import {
  Command as PlatformCommand,
  CommandExecutor,
  FileSystem,
  Path
} from "@effect/platform"
import { Effect, Either, Option, Schema, Stream } from "effect"
import {
  packageJsonDependencySpec,
  parsePackageJsonShape
} from "../config/package-json.ts"
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
}

export interface PackageVersionSyncParams {
  readonly cwd: string
  readonly packageName: string
  readonly repoUrl: string
}

export interface PackageVersionResolution {
  readonly packageName: string
  readonly packageSpec: string
  readonly ref: string
  readonly repositoryUrl: Option.Option<string>
  readonly source: "npm-gitHead" | "git-tag"
  readonly version: string
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
  ".next",
  ".turbo",
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

const decodeNpmPackageMetadata = Schema.decodeUnknownEither(
  NpmPackageMetadataSchema,
  { errors: "all" }
)

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(Stream.decodeText("utf-8"), Stream.runFold("", (a, b) => a + b))

export const packageSpecFromPackageJson = (
  json: string,
  packageName: string
): Option.Option<string> => packageJsonDependencySpec(json, packageName)

const isDependencyRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

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

const normalizeManifestPath = (filePath: string): string =>
  filePath.replaceAll("\\", "/")

const isIgnoredManifestPath = (filePath: string): boolean =>
  normalizeManifestPath(filePath)
    .split("/")
    .some((part) => ignoredPackageManifestDirs.has(part))

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
  const walk = (
    relativeDir: string
  ): Effect.Effect<ReadonlyArray<string>> =>
    Effect.gen(function* () {
      const absoluteDir =
        relativeDir === "" ? cwd : path.resolve(cwd, relativeDir)
      const entries = yield* fs
        .readDirectory(absoluteDir)
        .pipe(Effect.catchAll(() => Effect.succeed([] as Array<string>)))
      const nested = yield* Effect.forEach(
        entries,
        (entry) =>
          Effect.gen(function* () {
            const relativePath =
              relativeDir === "" ? entry : `${relativeDir}/${entry}`
            if (isIgnoredManifestPath(relativePath)) return []
            if (entry === "package.json") return [relativePath]
            const info = yield* fs
              .stat(path.resolve(cwd, relativePath))
              .pipe(Effect.option)
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

const toNpmPackageMetadata = (
  raw: NpmPackageMetadataRaw
): NpmPackageMetadata => ({
  version: raw.version,
  gitHead:
    raw.gitHead === undefined ? Option.none() : Option.some(raw.gitHead),
  repositoryUrl: repositoryUrlValue(raw.repository).pipe(
    Option.flatMap(normalizeNpmRepositoryUrl)
  )
})

export const parseNpmPackageMetadata = (
  stdout: string
): Option.Option<NpmPackageMetadata> =>
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
  (url
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .split(/[/:]/)
    .pop() ?? url)
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
  packageName.startsWith("@")
    ? (packageName.split("/")[1] ?? packageName)
    : packageName

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

const packageSpecFromProject = (
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
      const spec = packageSpecFromPackageJson(json, packageName)
      if (Option.isSome(spec)) return spec
    }
    return Option.none<string>()
  })

const npmViewPackageMetadata = (
  executor: CommandExecutor.CommandExecutor,
  cwd: string,
  packageName: string,
  packageSpec: string
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const command = PlatformCommand.make(
        "npm",
        "view",
        npmDescriptor(packageName, packageSpec),
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

const failedSync = (
  { packageName, repoUrl }: PackageVersionSyncParams,
  reason: string
) =>
  new PackageVersionSyncFailed({
    packageName,
    reason,
    url: repoUrl
  })

const safeGitResult: GitResult = {
  exitCode: 1,
  stdout: "",
  stderr: ""
}

const tagExists = (
  git: Git,
  cwd: string,
  repoUrl: string,
  tag: string
) =>
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
    const projectPackageSpec = yield* packageSpecFromProject(
      fs,
      path,
      params.cwd,
      params.packageName
    )
    const packageSpec = yield* Option.match(
      projectPackageSpec,
      {
        onNone: () =>
          Effect.fail(
            failedSync(
              params,
              `${params.packageName} is not present in project package.json dependencies.`
            )
          ),
        onSome: Effect.succeed
      }
    )
    const npm = yield* npmViewPackageMetadata(
      executor,
      params.cwd,
      params.packageName,
      packageSpec
    ).pipe(
      Effect.catchAll(() =>
        Effect.fail(failedSync(params, "npm view could not be executed."))
      )
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
        Effect.fail(
          failedSync(params, "npm metadata did not include a usable version.")
        ),
      onSome: Effect.succeed
    })

    if (Option.isSome(metadata.gitHead)) {
      return {
        packageName: params.packageName,
        packageSpec,
        ref: metadata.gitHead.value,
        repositoryUrl: metadata.repositoryUrl,
        source: "npm-gitHead",
        version: metadata.version
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
          packageSpec,
          ref,
          repositoryUrl: metadata.repositoryUrl,
          source: "git-tag",
          version: metadata.version
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
  executor: CommandExecutor.CommandExecutor,
  cwd: string,
  dependency: PackageDependency
): Effect.Effect<DependencyVendorCandidate> =>
  npmViewPackageMetadata(
    executor,
    cwd,
    dependency.name,
    dependency.spec
  ).pipe(
    Effect.map((result) => {
      if (result.exitCode !== 0) {
        return unavailableCandidate(
          dependency,
          result.stderr.trim() ||
            result.stdout.trim() ||
            "npm view returned no metadata"
        )
      }
      const metadata = parseNpmPackageMetadata(result.stdout)
      return Option.match(metadata, {
        onNone: () =>
          unavailableCandidate(
            dependency,
            "npm metadata did not include a usable version"
          ),
        onSome: (value) => dependencyCandidateFromMetadata(dependency, value)
      })
    }),
    Effect.catchAll(() =>
      Effect.succeed(unavailableCandidate(dependency, "npm view failed"))
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
        (dependency) => scanPackageDependency(executor, cwd, dependency),
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
        scan: (cwd: string) =>
          scanPackageDependencies(fs, path, executor, cwd)
      }
    })
  }
) {}
