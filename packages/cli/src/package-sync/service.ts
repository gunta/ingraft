import { Command as PlatformCommand, CommandExecutor, FileSystem, Path } from "@effect/platform"
import { Effect, Either, Option, Schema, Stream } from "effect"
import { parse as parseJsonc, type ParseError } from "jsonc-parser"

import { packageJsonDependencySpec, parsePackageJsonShape } from "../config/package-json.ts"
import { parseYamlConfig } from "../config/yaml.ts"
import { VENDOR_DIR } from "../domain/constants.ts"
import { PackageVersionSyncFailed } from "../domain/errors.ts"
import { Git, type GitResult } from "../services/git.ts"

export type PackageDependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies"

export interface PackageDependency {
  readonly manifestPath: string
  readonly name: string
  readonly section: PackageDependencySection
  readonly spec: string
}

export type PackageVersionSource =
  | "node_modules"
  | "package-lock"
  | "pnpm-lock"
  | "yarn-lock"
  | "bun-lock"
  | "package-json"

export interface ProjectPackageVersion {
  readonly packageSpec: string
  readonly source: PackageVersionSource
  readonly version: Option.Option<string>
}

export interface DependencyVendorCandidate {
  readonly manifestPath: string
  readonly packageName: string
  readonly packageSpec: string
  readonly reason?: string
  readonly repositoryUrl?: string
  readonly section: PackageDependencySection
  readonly source: "npm"
  readonly status: "matched" | "metadata-unavailable" | "missing-repository"
  readonly suggestedName?: string
  readonly syncPackage: string
  readonly version?: string
  readonly versionSource?: PackageVersionSource
}

export interface PackageVersionSyncParams {
  readonly cwd: string
  readonly packageName: string
  readonly repoUrl: string
}

export interface PackageSourceResolutionParams {
  readonly cwd: string
  readonly packageName: string
}

export interface PackageVersionResolution {
  readonly packageName: string
  readonly packageSpec: string
  readonly ref: string
  readonly repositoryUrl: Option.Option<string>
  readonly source: "npm-gitHead" | "git-tag"
  readonly version: string
  readonly versionSource: PackageVersionSource
}

export interface NpmPackageMetadata {
  readonly gitHead: Option.Option<string>
  readonly repositoryUrl: Option.Option<string>
  readonly version: string
}

interface CommandResult {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const satisfies ReadonlyArray<PackageDependencySection>

const ignoredPackageManifestDirs = new Set([
  ".git",
  ".jj",
  ".moon",
  ".next",
  ".nx",
  ".pants.d",
  ".rush",
  ".turbo",
  ".gradle",
  "bazel-bin",
  "bazel-out",
  "bazel-testlogs",
  "build",
  "coverage",
  "dist",
  "node_modules",
  VENDOR_DIR
])

const NpmRepositorySchema = Schema.Union(
  Schema.String,
  Schema.Struct({
    url: Schema.String.pipe(Schema.minLength(1))
  })
)

const NpmPackageMetadataSchema = Schema.Struct({
  version: Schema.String.pipe(Schema.minLength(1)),
  gitHead: Schema.optionalWith(Schema.String.pipe(Schema.minLength(1)), {
    exact: true
  }),
  repository: Schema.optionalWith(NpmRepositorySchema, { exact: true })
})

type NpmPackageMetadataRaw = typeof NpmPackageMetadataSchema.Type

const decodeNpmPackageMetadata = Schema.decodeUnknownEither(NpmPackageMetadataSchema, {
  errors: "all"
})

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText("utf-8"),
    Stream.runFold("", (a, b) => a + b)
  )

export const packageSpecFromPackageJson = (
  json: string,
  packageName: string
): Option.Option<string> => packageJsonDependencySpec(json, packageName)

const isDependencyRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseJsonObject = (text: string): Option.Option<Record<string, unknown>> => {
  const errors: ParseError[] = []
  const value = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false
  })
  return errors.length === 0 && isRecord(value) ? Option.some(value) : Option.none()
}

const stringProperty = (value: unknown, key: string): Option.Option<string> =>
  isRecord(value) && typeof value[key] === "string" ? Option.some(value[key]) : Option.none()

const cleanLockedVersion = (value: string): string =>
  value
    .trim()
    .replace(/^\D*(?=\d)/, "")
    .replace(/\(.+$/, "")

const nonEmptyVersion = (value: string): Option.Option<string> => {
  const version = cleanLockedVersion(value)
  return /^\d/.test(version) ? Option.some(version) : Option.none()
}

export const packageJsonDependencies = (
  json: string,
  manifestPath = "package.json"
): ReadonlyArray<PackageDependency> => {
  const pkg = parsePackageJsonShape(json)
  return dependencySections.flatMap((section) => {
    const dependencies = pkg[section]
    if (!isDependencyRecord(dependencies)) return []
    return Object.entries(dependencies).flatMap(([name, spec]) =>
      typeof spec === "string" && spec.trim().length > 0
        ? [{ manifestPath, name, section, spec: spec.trim() }]
        : []
    )
  })
}

const packageJsonVersion = (json: string): Option.Option<string> =>
  parseJsonObject(json).pipe(
    Option.flatMap((value) => stringProperty(value, "version")),
    Option.flatMap(nonEmptyVersion)
  )

const nodeModulesPackagePath = (packageName: string): string =>
  `node_modules/${packageName}/package.json`

const packageLockPackagePath = (packageName: string): string => `node_modules/${packageName}`

export const parsePackageLockVersion = (text: string, packageName: string): Option.Option<string> =>
  parseJsonObject(text).pipe(
    Option.flatMap((lock) => {
      const packages = lock.packages
      if (isRecord(packages)) {
        const entry = packages[packageLockPackagePath(packageName)]
        const version = stringProperty(entry, "version").pipe(Option.flatMap(nonEmptyVersion))
        if (Option.isSome(version)) return version
        for (const [key, value] of Object.entries(packages)) {
          if (key.endsWith(`/${packageLockPackagePath(packageName)}`)) {
            const nestedVersion = stringProperty(value, "version").pipe(
              Option.flatMap(nonEmptyVersion)
            )
            if (Option.isSome(nestedVersion)) return nestedVersion
          }
        }
      }

      const dependencies = lock.dependencies
      if (isRecord(dependencies)) {
        return stringProperty(dependencies[packageName], "version").pipe(
          Option.flatMap(nonEmptyVersion)
        )
      }

      return Option.none()
    })
  )

const lockDependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const

const pnpmEntryVersion = (entry: unknown): Option.Option<string> => {
  if (typeof entry === "string") return nonEmptyVersion(entry)
  return stringProperty(entry, "version").pipe(Option.flatMap(nonEmptyVersion))
}

const pnpmVersionFromPackageKey = (key: string, packageName: string): Option.Option<string> => {
  const normalized = key.replace(/^\/+/, "")
  const prefix = `${packageName}@`
  return normalized.startsWith(prefix)
    ? nonEmptyVersion(normalized.slice(prefix.length))
    : Option.none()
}

export const parsePnpmLockVersion = (text: string, packageName: string): Option.Option<string> =>
  parseYamlConfig(text).pipe(
    Option.flatMap((lock) => {
      const importers = lock.importers
      if (isRecord(importers)) {
        for (const importer of Object.values(importers)) {
          if (!isRecord(importer)) continue
          for (const section of lockDependencySections) {
            const dependencies = importer[section]
            if (!isRecord(dependencies)) continue
            const version = pnpmEntryVersion(dependencies[packageName])
            if (Option.isSome(version)) return version
          }
        }
      }

      const packages = lock.packages
      if (isRecord(packages)) {
        for (const key of Object.keys(packages)) {
          const version = pnpmVersionFromPackageKey(key, packageName)
          if (Option.isSome(version)) return version
        }
      }

      return Option.none()
    })
  )

const yarnSelectorMatchesPackage = (selector: string, packageName: string): boolean => {
  const normalized = selector.trim().replace(/^"|"$/g, "")
  return normalized === packageName || normalized.startsWith(`${packageName}@`)
}

const yarnHeaderMatchesPackage = (header: string, packageName: string): boolean =>
  header.split(/,\s*/).some((selector) => yarnSelectorMatchesPackage(selector, packageName))

export const parseYarnLockVersion = (text: string, packageName: string): Option.Option<string> => {
  let matchingBlock = false
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.endsWith(":") && !line.startsWith(" ") && !line.startsWith("\t")) {
      matchingBlock = yarnHeaderMatchesPackage(trimmed.slice(0, -1), packageName)
      continue
    }
    if (!matchingBlock) continue
    const match = trimmed.match(/^version\s+"([^"]+)"/)
    if (match?.[1]) return nonEmptyVersion(match[1])
  }
  return Option.none()
}

const bunVersionFromSpecifier = (specifier: string, packageName: string): Option.Option<string> => {
  const prefix = `${packageName}@`
  return specifier.startsWith(prefix)
    ? nonEmptyVersion(specifier.slice(prefix.length))
    : Option.none()
}

export const parseBunLockVersion = (text: string, packageName: string): Option.Option<string> =>
  parseJsonObject(text).pipe(
    Option.flatMap((lock) => {
      const packages = lock.packages
      if (!isRecord(packages)) return Option.none()
      const entry = packages[packageName]
      if (Array.isArray(entry) && typeof entry[0] === "string") {
        return bunVersionFromSpecifier(entry[0], packageName)
      }
      for (const value of Object.values(packages)) {
        if (Array.isArray(value) && typeof value[0] === "string") {
          const version = bunVersionFromSpecifier(value[0], packageName)
          if (Option.isSome(version)) return version
        }
      }
      return Option.none()
    })
  )

const normalizeManifestPath = (filePath: string): string => filePath.replaceAll("\\", "/")

const isIgnoredManifestPath = (filePath: string): boolean => {
  const normalized = normalizeManifestPath(filePath)
  return (
    normalized.split("/").some((part) => ignoredPackageManifestDirs.has(part)) ||
    normalized.startsWith("common/temp/")
  )
}

const sortManifestPaths = (paths: ReadonlyArray<string>) =>
  [...paths].sort((a, b) => {
    if (a === "package.json") return -1
    if (b === "package.json") return 1
    return a.localeCompare(b)
  })

export const listPackageManifestPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string
): Effect.Effect<ReadonlyArray<string>> => {
  const walk = (relativeDir: string): Effect.Effect<ReadonlyArray<string>> =>
    Effect.gen(function* () {
      const absoluteDir = relativeDir === "" ? cwd : path.resolve(cwd, relativeDir)
      const entries = yield* fs
        .readDirectory(absoluteDir)
        .pipe(Effect.catchAll(() => Effect.succeed([] as Array<string>)))
      const nested = yield* Effect.forEach(
        entries,
        (entry) =>
          Effect.gen(function* () {
            const relativePath = relativeDir === "" ? entry : `${relativeDir}/${entry}`
            if (isIgnoredManifestPath(relativePath)) return []
            if (entry === "package.json") return [relativePath]
            const info = yield* fs.stat(path.resolve(cwd, relativePath)).pipe(Effect.option)
            if (Option.isNone(info) || info.value.type !== "Directory") return []
            return yield* walk(relativePath)
          }),
        { concurrency: 8 }
      )
      return sortManifestPaths(nested.flat())
    })

  return walk("")
}

const repositoryUrlValue = (
  repository: NpmPackageMetadataRaw["repository"]
): Option.Option<string> => {
  if (typeof repository === "string") return Option.some(repository)
  if (repository === undefined) return Option.none()
  return Option.some(repository.url)
}

const normalizeNpmRepositoryUrl = (url: string): Option.Option<string> => {
  const normalized = url
    .trim()
    .replace(/^git\+/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "git@github.com:")
    .replace(/#.*$/, "")
  return normalized.length === 0 ? Option.none() : Option.some(normalized)
}

const toNpmPackageMetadata = (raw: NpmPackageMetadataRaw): NpmPackageMetadata => ({
  version: raw.version,
  gitHead: raw.gitHead === undefined ? Option.none() : Option.some(raw.gitHead),
  repositoryUrl: repositoryUrlValue(raw.repository).pipe(Option.flatMap(normalizeNpmRepositoryUrl))
})

export const parseNpmPackageMetadata = (stdout: string): Option.Option<NpmPackageMetadata> =>
  Option.liftThrowable((value: string) => JSON.parse(value))(stdout).pipe(
    Option.flatMap((value) => {
      const rawValue = Array.isArray(value) ? value.at(-1) : value
      return Either.match(decodeNpmPackageMetadata(rawValue), {
        onLeft: () => Option.none<NpmPackageMetadata>(),
        onRight: (raw) => Option.some(toNpmPackageMetadata(raw))
      })
    })
  )

const suggestedNameFromRepositoryUrl = (url: string): string =>
  (url.replace(/#.*$/, "").replace(/\/+$/, "").split(/[/:]/).pop() ?? url)
    .replace(/\.git$/, "")
    .replace(/^@/, "")

export const dependencyCandidateFromMetadata = (
  dependency: PackageDependency,
  metadata: NpmPackageMetadata
): DependencyVendorCandidate => {
  const repositoryUrl = Option.getOrUndefined(metadata.repositoryUrl)
  if (repositoryUrl === undefined) {
    return {
      manifestPath: dependency.manifestPath,
      packageName: dependency.name,
      packageSpec: dependency.spec,
      reason: "npm metadata does not include a repository URL",
      section: dependency.section,
      source: "npm",
      status: "missing-repository",
      syncPackage: dependency.name,
      version: metadata.version
    }
  }
  return {
    manifestPath: dependency.manifestPath,
    packageName: dependency.name,
    packageSpec: dependency.spec,
    repositoryUrl,
    section: dependency.section,
    source: "npm",
    status: "matched",
    suggestedName: suggestedNameFromRepositoryUrl(repositoryUrl),
    syncPackage: dependency.name,
    version: metadata.version
  }
}

const unscopedPackageName = (packageName: string): string =>
  packageName.startsWith("@") ? (packageName.split("/")[1] ?? packageName) : packageName

export const tagCandidatesForPackageVersion = (
  packageName: string,
  version: string
): ReadonlyArray<string> =>
  Array.from(
    new Set([
      `${packageName}@${version}`,
      `${unscopedPackageName(packageName)}@${version}`,
      `v${version}`,
      version
    ])
  )

const npmDescriptor = (packageName: string, spec: string): string =>
  spec === "" || spec === "*" ? packageName : `${packageName}@${spec}`

const packageDependencyFromProject = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  packageName: string
) =>
  Effect.gen(function* () {
    const manifests = yield* listPackageManifestPaths(fs, path, cwd)
    for (const manifestPath of manifests) {
      const json = yield* fs
        .readFileString(path.resolve(cwd, manifestPath))
        .pipe(Effect.catchAll(() => Effect.succeed("")))
      const dependency = packageJsonDependencies(json, manifestPath).find(
        (entry) => entry.name === packageName
      )
      if (dependency) return Option.some(dependency)
    }
    return Option.none<PackageDependency>()
  })

const readOptionalFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  relativePath: string
) => {
  const target = path.resolve(cwd, relativePath)
  return fs
    .exists(target)
    .pipe(
      Effect.flatMap((exists) =>
        exists
          ? fs.readFileString(target).pipe(Effect.option)
          : Effect.succeed(Option.none<string>())
      )
    )
}

const detectNodeModulesPackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  packageName: string
) =>
  readOptionalFile(fs, path, cwd, nodeModulesPackagePath(packageName)).pipe(
    Effect.map(Option.flatMap(packageJsonVersion))
  )

const detectLockfileVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  packageName: string
) =>
  Effect.gen(function* () {
    const packageLock = yield* readOptionalFile(fs, path, cwd, "package-lock.json")
    if (Option.isSome(packageLock)) {
      const version = parsePackageLockVersion(packageLock.value, packageName)
      if (Option.isSome(version)) return { source: "package-lock" as const, version }
    }

    const pnpmLock = yield* readOptionalFile(fs, path, cwd, "pnpm-lock.yaml")
    if (Option.isSome(pnpmLock)) {
      const version = parsePnpmLockVersion(pnpmLock.value, packageName)
      if (Option.isSome(version)) return { source: "pnpm-lock" as const, version }
    }

    const yarnLock = yield* readOptionalFile(fs, path, cwd, "yarn.lock")
    if (Option.isSome(yarnLock)) {
      const version = parseYarnLockVersion(yarnLock.value, packageName)
      if (Option.isSome(version)) return { source: "yarn-lock" as const, version }
    }

    const bunLock = yield* readOptionalFile(fs, path, cwd, "bun.lock")
    if (Option.isSome(bunLock)) {
      const version = parseBunLockVersion(bunLock.value, packageName)
      if (Option.isSome(version)) return { source: "bun-lock" as const, version }
    }

    return {
      source: "package-json" as const,
      version: Option.none<string>()
    }
  })

export const detectProjectPackageVersion = ({
  cwd,
  dependency
}: {
  readonly cwd: string
  readonly dependency: PackageDependency
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const nodeModulesVersion = yield* detectNodeModulesPackageVersion(
      fs,
      path,
      cwd,
      dependency.name
    )
    if (Option.isSome(nodeModulesVersion)) {
      return {
        packageSpec: dependency.spec,
        source: "node_modules",
        version: nodeModulesVersion
      } satisfies ProjectPackageVersion
    }

    const lockfile = yield* detectLockfileVersion(fs, path, cwd, dependency.name)
    return {
      packageSpec: dependency.spec,
      source: lockfile.source,
      version: lockfile.version
    } satisfies ProjectPackageVersion
  })

const detectProjectPackageVersionWith = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  dependency: PackageDependency
) =>
  detectProjectPackageVersion({ cwd, dependency }).pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.catchAll(() =>
      Effect.succeed({
        packageSpec: dependency.spec,
        source: "package-json",
        version: Option.none<string>()
      } satisfies ProjectPackageVersion)
    )
  )

const npmDescriptorForProjectVersion = (
  packageName: string,
  detected: ProjectPackageVersion
): string =>
  Option.match(detected.version, {
    onNone: () => npmDescriptor(packageName, detected.packageSpec),
    onSome: (version) => npmDescriptor(packageName, version)
  })

const npmViewPackageMetadata = (
  executor: CommandExecutor.CommandExecutor,
  cwd: string,
  descriptor: string
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const command = PlatformCommand.make(
        "npm",
        "view",
        descriptor,
        "version",
        "repository",
        "gitHead",
        "--json"
      ).pipe(PlatformCommand.workingDirectory(cwd))
      const proc = yield* executor.start(command)
      const [exitCode, stdout, stderr] = yield* Effect.all(
        [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
        { concurrency: 3 }
      )
      return {
        exitCode: Number(exitCode),
        stdout,
        stderr
      } satisfies CommandResult
    })
  )

const failedSync = ({ packageName, repoUrl }: PackageVersionSyncParams, reason: string) =>
  new PackageVersionSyncFailed({
    packageName,
    reason,
    url: repoUrl
  })

const failedPackageSource = ({ packageName }: PackageSourceResolutionParams, reason: string) =>
  new PackageVersionSyncFailed({
    packageName,
    reason,
    url: `npm:${packageName}`
  })

const safeGitResult: GitResult = {
  exitCode: 1,
  stdout: "",
  stderr: ""
}

const tagExists = (git: Git, cwd: string, repoUrl: string, tag: string) =>
  git.exec(["ls-remote", "--tags", repoUrl, `refs/tags/${tag}`], { cwd }).pipe(
    Effect.catchAll(() => Effect.succeed(safeGitResult)),
    Effect.map((result) => result.exitCode === 0 && result.stdout.trim() !== "")
  )

const firstExistingTag = (
  git: Git,
  cwd: string,
  repoUrl: string,
  candidates: ReadonlyArray<string>
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      const exists = yield* tagExists(git, cwd, repoUrl, candidate)
      if (exists) return Option.some(candidate)
    }
    return Option.none()
  })

const resolvePackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: CommandExecutor.CommandExecutor,
  git: Git,
  params: PackageVersionSyncParams
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(
      fs,
      path,
      params.cwd,
      params.packageName
    )
    const dependency = yield* Option.match(projectDependency, {
      onNone: () =>
        Effect.fail(
          failedSync(
            params,
            `${params.packageName} is not present in project package.json dependencies.`
          )
        ),
      onSome: Effect.succeed
    })
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const npm = yield* npmViewPackageMetadata(
      executor,
      params.cwd,
      npmDescriptorForProjectVersion(params.packageName, detected)
    ).pipe(
      Effect.catchAll(() => Effect.fail(failedSync(params, "npm view could not be executed.")))
    )
    if (npm.exitCode !== 0) {
      return yield* Effect.fail(
        failedSync(
          params,
          npm.stderr.trim() || npm.stdout.trim() || "npm view returned no metadata."
        )
      )
    }

    const metadata = yield* Option.match(parseNpmPackageMetadata(npm.stdout), {
      onNone: () =>
        Effect.fail(failedSync(params, "npm metadata did not include a usable version.")),
      onSome: Effect.succeed
    })

    if (Option.isSome(metadata.gitHead)) {
      return {
        packageName: params.packageName,
        packageSpec: detected.packageSpec,
        ref: metadata.gitHead.value,
        repositoryUrl: metadata.repositoryUrl,
        source: "npm-gitHead",
        version: metadata.version,
        versionSource: detected.source
      }
    }

    const tag = yield* firstExistingTag(
      git,
      params.cwd,
      params.repoUrl,
      tagCandidatesForPackageVersion(params.packageName, metadata.version)
    )
    return yield* Option.match(tag, {
      onNone: () =>
        Effect.fail(
          failedSync(
            params,
            `No matching source tag found for ${params.packageName}@${metadata.version}.`
          )
        ),
      onSome: (ref) =>
        Effect.succeed({
          packageName: params.packageName,
          packageSpec: detected.packageSpec,
          ref,
          repositoryUrl: metadata.repositoryUrl,
          source: "git-tag",
          version: metadata.version,
          versionSource: detected.source
        } satisfies PackageVersionResolution)
    })
  })

const resolvePackageSource = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: CommandExecutor.CommandExecutor,
  git: Git,
  params: PackageSourceResolutionParams
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(
      fs,
      path,
      params.cwd,
      params.packageName
    )
    const dependency = Option.getOrElse(projectDependency, () => ({
      manifestPath: "package.json",
      name: params.packageName,
      section: "dependencies" as const,
      spec: "latest"
    }))
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const npm = yield* npmViewPackageMetadata(
      executor,
      params.cwd,
      npmDescriptorForProjectVersion(params.packageName, detected)
    ).pipe(
      Effect.catchAll(() =>
        Effect.fail(failedPackageSource(params, "npm view could not be executed."))
      )
    )
    if (npm.exitCode !== 0) {
      return yield* Effect.fail(
        failedPackageSource(
          params,
          npm.stderr.trim() || npm.stdout.trim() || "npm view returned no metadata."
        )
      )
    }

    const metadata = yield* Option.match(parseNpmPackageMetadata(npm.stdout), {
      onNone: () =>
        Effect.fail(failedPackageSource(params, "npm metadata did not include a usable version.")),
      onSome: Effect.succeed
    })
    const repoUrl = yield* Option.match(metadata.repositoryUrl, {
      onNone: () =>
        Effect.fail(failedPackageSource(params, "npm metadata did not include a repository URL.")),
      onSome: Effect.succeed
    })

    if (Option.isSome(metadata.gitHead)) {
      return {
        packageName: params.packageName,
        packageSpec: detected.packageSpec,
        ref: metadata.gitHead.value,
        repositoryUrl: metadata.repositoryUrl,
        source: "npm-gitHead",
        version: metadata.version,
        versionSource: detected.source
      }
    }

    const tag = yield* firstExistingTag(
      git,
      params.cwd,
      repoUrl,
      tagCandidatesForPackageVersion(params.packageName, metadata.version)
    )
    return yield* Option.match(tag, {
      onNone: () =>
        Effect.fail(
          failedPackageSource(
            params,
            `No matching source tag found for ${params.packageName}@${metadata.version}.`
          )
        ),
      onSome: (ref) =>
        Effect.succeed({
          packageName: params.packageName,
          packageSpec: detected.packageSpec,
          ref,
          repositoryUrl: metadata.repositoryUrl,
          source: "git-tag",
          version: metadata.version,
          versionSource: detected.source
        } satisfies PackageVersionResolution)
    })
  })

const unavailableCandidate = (
  dependency: PackageDependency,
  reason: string
): DependencyVendorCandidate => ({
  manifestPath: dependency.manifestPath,
  packageName: dependency.name,
  packageSpec: dependency.spec,
  reason,
  section: dependency.section,
  source: "npm",
  status: "metadata-unavailable",
  syncPackage: dependency.name
})

const scanPackageDependency = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: CommandExecutor.CommandExecutor,
  cwd: string,
  dependency: PackageDependency
): Effect.Effect<DependencyVendorCandidate> =>
  detectProjectPackageVersionWith(fs, path, cwd, dependency).pipe(
    Effect.flatMap((detected) =>
      npmViewPackageMetadata(
        executor,
        cwd,
        npmDescriptorForProjectVersion(dependency.name, detected)
      ).pipe(
        Effect.map((result) => {
          if (result.exitCode !== 0) {
            return {
              ...unavailableCandidate(
                dependency,
                result.stderr.trim() || result.stdout.trim() || "npm view returned no metadata"
              ),
              versionSource: detected.source
            }
          }
          const metadata = parseNpmPackageMetadata(result.stdout)
          return Option.match(metadata, {
            onNone: () => ({
              ...unavailableCandidate(dependency, "npm metadata did not include a usable version"),
              versionSource: detected.source
            }),
            onSome: (value) => ({
              ...dependencyCandidateFromMetadata(dependency, value),
              versionSource: detected.source
            })
          })
        }),
        Effect.catchAll(() =>
          Effect.succeed({
            ...unavailableCandidate(dependency, "npm view failed"),
            versionSource: detected.source
          })
        )
      )
    )
  )

const scanPackageDependencies = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: CommandExecutor.CommandExecutor,
  cwd: string
) =>
  listPackageManifestPaths(fs, path, cwd).pipe(
    Effect.flatMap((manifests) =>
      Effect.forEach(
        manifests,
        (manifestPath) =>
          fs.readFileString(path.resolve(cwd, manifestPath)).pipe(
            Effect.map((json) => packageJsonDependencies(json, manifestPath)),
            Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<PackageDependency>))
          ),
        { concurrency: 8 }
      )
    ),
    Effect.map((manifests) => {
      const dependencies = manifests.flat()
      const seen = new Set<string>()
      return dependencies.filter((dependency) => {
        const key = `${dependency.name}\u0000${dependency.spec}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }),
    Effect.flatMap((dependencies) =>
      Effect.forEach(
        dependencies,
        (dependency) => scanPackageDependency(fs, path, executor, cwd, dependency),
        { concurrency: 6 }
      )
    )
  )

export class PackageVersionSync extends Effect.Service<PackageVersionSync>()(
  "vendor-subtree/PackageVersionSync",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const executor = yield* CommandExecutor.CommandExecutor
      const git = yield* Git
      return {
        resolve: (params: PackageVersionSyncParams) =>
          resolvePackageVersion(fs, path, executor, git, params),
        resolvePackageSource: (params: PackageSourceResolutionParams) =>
          resolvePackageSource(fs, path, executor, git, params),
        scan: (cwd: string) => scanPackageDependencies(fs, path, executor, cwd)
      }
    })
  }
) {}
