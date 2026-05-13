import { Args, Command as Cli, Options } from "@effect/cli"
import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"

import { RepositoryAliases } from "../aliases/service.ts"
import { info, ok, warn, withCommandTelemetry } from "../app/log.ts"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_FILTER,
  TRAILER_REF,
  TRAILER_STRATEGY,
  TRAILER_SYNC_PACKAGE,
  TRAILER_URL,
  VENDOR_DIR
} from "../domain/constants.ts"
import {
  InvalidAddTargets,
  SubtreeAddFailed,
  UnsupportedVendorFilter,
  VendorPathAlreadyExists,
  VendorStrategyCommandFailed,
  VendoredRepoAlreadyExists,
  VersionResolutionFailed
} from "../domain/errors.ts"
import { hostedRepoFromInput, inferRepoName, normalizeRepoUrl } from "../domain/repo.ts"
import {
  formatVendorFilterTrailer,
  hasVendorFilter,
  type VendorFilter,
  vendorFilterFromOptions
} from "../domain/vendor-filter.ts"
import { findByName, listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import {
  DEFAULT_VENDOR_STRATEGY,
  effectiveVendorStrategy,
  type VendorStrategy
} from "../domain/vendor-strategy.ts"
import {
  resolveVersion,
  type VersionSelector,
  versionSelectorFromOptions
} from "../domain/version.ts"
import { PackageVersionSync, type PackageVersionResolution } from "../package-sync/service.ts"
import { checkoutFilteredRepo, materializeFilteredRepo } from "../project/filtered-checkout.ts"
import { updateGitignore } from "../project/gitignore.ts"
import { ProjectFiles } from "../project/service.ts"
import {
  artifactRemoteWithCredentials,
  CloudflareArtifacts
} from "../services/cloudflare-artifacts.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  detectDefaultBranch,
  emptyCommit,
  git,
  repoRoot
} from "../services/git.ts"
import { Jujutsu } from "../services/jujutsu.ts"
import { RepositoryHosts } from "../services/repository-hosts.ts"

export interface AddCommandParams {
  readonly repo: string
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
  readonly syncPackage: Option.Option<string>
  readonly cloudflareArtifact: boolean
  readonly cloudflareArtifactDepth: Option.Option<string>
  readonly cloudflareArtifactName: Option.Option<string>
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly maxFileSize: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly name: Option.Option<string>
  readonly strategy: VendorStrategy
}

export interface AddManyCommandParams extends Omit<AddCommandParams, "repo"> {
  readonly repos: ReadonlyArray<string>
}

export type AddTarget =
  | {
      readonly _tag: "RepositoryTarget"
      readonly input: string
      readonly url: string
    }
  | {
      readonly _tag: "PackageTarget"
      readonly input: string
      readonly packageName: string
    }

interface SubtreeAddMessageParams {
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly url: string
  readonly strategy: VendorStrategy
  readonly filter: VendorFilter
  readonly action?: "upsert" | "remove"
  readonly syncPackage: Option.Option<string>
}

interface EnsureNewVendorTargetParams {
  readonly cwd: string
  readonly finalName: string
  readonly finalPrefix: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}

interface AddSubtreeParams {
  readonly cwd: string
  readonly cloudflareArtifact: CloudflareArtifactOptions
  readonly finalName: string
  readonly finalPrefix: string
  readonly finalRef: string
  readonly filter: VendorFilter
  readonly syncPackage: Option.Option<string>
  readonly url: string
}

interface AddStrategyParams extends AddSubtreeParams {
  readonly strategy: VendorStrategy
  readonly existingRepos: ReadonlyArray<VendoredRepo>
}

interface CheckoutVendorRefParams {
  readonly cwd: string
  readonly prefix: string
  readonly ref: string
  readonly strategy: VendorStrategy
}

interface EnsureParentDirectoryParams {
  readonly cwd: string
  readonly prefix: string
}

interface CloneVendorRepoParams {
  readonly artifact: CloudflareArtifactOptions
  readonly cwd: string
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly strategy: VendorStrategy
  readonly url: string
}

interface ImportArtifactRemoteParams {
  readonly artifact: CloudflareArtifactOptions
  readonly name: string
  readonly ref: string
  readonly url: string
}

interface ImportedArtifactRemote {
  readonly cloneUrl: string
  readonly redactedUrl: string
}

interface SetCloneOriginParams {
  readonly cwd: string
  readonly prefix: string
  readonly strategy: VendorStrategy
  readonly url: string
}

interface ResolveRefParams {
  readonly cwd: string
  readonly url: string
  readonly selector: VersionSelector
}

interface CloudflareArtifactOptions {
  readonly depth: Option.Option<number>
  readonly enabled: boolean
  readonly name: Option.Option<string>
}

const addRepoArg = Args.text({ name: "repo" }).pipe(
  Args.withDescription(
    "GitHub shorthand (owner/repo), HTTPS/SSH URL, or npm package name to vendor."
  )
)

const addRepoArgs = addRepoArg.pipe(Args.atLeast(1))

const addRefOption = Options.text("ref").pipe(
  Options.withAlias("r"),
  Options.withDescription(
    "Branch, tag, or commit to vendor. Defaults to the upstream's default branch."
  ),
  Options.optional
)

const addTagOption = Options.text("tag").pipe(
  Options.withDescription("Git tag to vendor, for example v3.21.2."),
  Options.optional
)

const addReleaseOption = Options.text("release").pipe(
  Options.withDescription(
    "Host release to vendor. Use a release tag/name or 'latest' for the latest GitHub/GitLab release."
  ),
  Options.optional
)

const addSyncPackageOption = Options.text("sync-package").pipe(
  Options.withDescription(
    "Resolve the vendored ref from the root package.json dependency version and persist that sync intent for future updates."
  ),
  Options.optional
)

const addCloudflareArtifactOption = Options.boolean("cloudflare-artifact").pipe(
  Options.withDescription(
    "Import the source repository into Cloudflare Artifacts and clone the short-lived Artifacts remote locally. Implies clone-ignore."
  )
)

const addCloudflareArtifactNameOption = Options.text("cloudflare-artifact-name").pipe(
  Options.withDescription(
    "Cloudflare Artifacts repository name. Defaults to the vendored repository name."
  ),
  Options.optional
)

const addCloudflareArtifactDepthOption = Options.text("cloudflare-artifact-depth").pipe(
  Options.withDescription(
    "Optional import depth to pass to the Cloudflare Artifacts REST import API."
  ),
  Options.optional
)

const addExcludeOption = Options.text("exclude").pipe(
  Options.withDescription(
    "Repo-relative glob to omit from materialized source. Repeatable, for example --exclude '*.png'."
  ),
  Options.repeated
)

const addExcludeDirOption = Options.text("exclude-dir").pipe(
  Options.withDescription(
    "Repo-relative directory to omit from materialized source. Repeatable, for example --exclude-dir docs."
  ),
  Options.repeated
)

const addExcludeExtOption = Options.text("exclude-ext").pipe(
  Options.withDescription(
    "File extension to omit from materialized source. Repeatable, for example --exclude-ext png."
  ),
  Options.repeated
)

const addMaxFileSizeOption = Options.text("max-file-size").pipe(
  Options.withDescription(
    "Omit files larger than this size from materialized source, for example 1MB or 512KB."
  ),
  Options.optional
)

const addPrefixOption = Options.text("prefix").pipe(
  Options.withAlias("p"),
  Options.withDescription(`Vendor prefix path. Defaults to '${VENDOR_DIR}/<name>'.`),
  Options.optional
)

const addNameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.withDescription("Override the inferred name (used for the prefix path and lookups)."),
  Options.optional
)

const addStrategyOption = Options.choiceWithValue("strategy", [
  ["subtree", "subtree"],
  ["submodule", "submodule"],
  ["clone-ignore", "clone-ignore"],
  ["clone", "clone-ignore"]
] as const).pipe(
  Options.withDefault(DEFAULT_VENDOR_STRATEGY),
  Options.withDescription(
    "Vendoring strategy: subtree commits source, submodule commits a gitlink, clone-ignore clones locally and gitignores it."
  )
)

const optionOrElseEffect = <A, E, R>(option: Option.Option<A>, orElse: Effect.Effect<A, E, R>) =>
  Option.match(option, {
    onNone: () => orElse,
    onSome: Effect.succeed
  })

const syncPackageLabel = (packageName: string) => `--sync-package ${packageName}`

export const classifyAddTarget = (input: string): AddTarget => {
  const trimmed = input.trim()
  return hostedRepoFromInput(trimmed) === null
    ? {
        _tag: "PackageTarget",
        input,
        packageName: trimmed
      }
    : {
        _tag: "RepositoryTarget",
        input,
        url: normalizeRepoUrl(trimmed)
      }
}

const resolutionVersionSource = (resolution: PackageVersionResolution): string =>
  resolution.versionSource === "package-json" ? "package.json range" : resolution.versionSource

const resolvePackageTarget = ({
  cwd,
  packageName
}: {
  readonly cwd: string
  readonly packageName: string
}) =>
  info(`Resolving npm package '${packageName}' from installed metadata and lockfiles...`).pipe(
    Effect.zipRight(
      PackageVersionSync.resolvePackageSource({
        cwd,
        packageName
      })
    ),
    Effect.tap((resolution) =>
      info(
        `Using ${resolution.ref} from ${packageName}@${resolution.version} (${resolutionVersionSource(resolution)}, ${resolution.source}).`
      )
    )
  )

const parseOptionalPositiveInteger = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Effect.succeed(Option.none<number>()),
    onSome: (text) => {
      const parsed = Number.parseInt(text, 10)
      return Number.isInteger(parsed) && parsed > 0
        ? Effect.succeed(Option.some(parsed))
        : Effect.fail(
            new VersionResolutionFailed({
              selector: `--cloudflare-artifact-depth ${text}`,
              url: "Cloudflare Artifacts"
            })
          )
    }
  })

const resolveSyncedPackageRef = ({
  cwd,
  packageName,
  url
}: {
  readonly cwd: string
  readonly packageName: string
  readonly url: string
}) =>
  PackageVersionSync.resolve({
    cwd,
    packageName,
    repoUrl: url
  }).pipe(
    Effect.tap((resolution) =>
      info(
        `Using ${resolution.ref} from ${packageName}@${resolution.version} (${resolutionVersionSource(resolution)}, ${resolution.source}).`
      )
    )
  )

const resolveRef = ({ cwd, selector, url }: ResolveRefParams) => {
  switch (selector._tag) {
    case "Ref":
      return info(`Using ref '${selector.value}'.`).pipe(Effect.as(selector.value))
    case "Tag":
      return info(`Using tag '${selector.value}'.`).pipe(Effect.as(selector.value))
    case "Release":
      return info(`Resolving release '${selector.value}' for ${url}...`).pipe(
        Effect.zipRight(resolveVersion({ url, selector })),
        Effect.flatMap((resolved) =>
          Option.match(resolved, {
            onNone: () =>
              Effect.fail(
                new VersionResolutionFailed({
                  selector: `--release ${selector.value}`,
                  url
                })
              ),
            onSome: (value) => info(`Using release tag '${value}'.`).pipe(Effect.as(value))
          })
        )
      )
    case "SyncPackage":
      return info(`Resolving ${syncPackageLabel(selector.value)} for ${url}...`).pipe(
        Effect.zipRight(
          resolveSyncedPackageRef({
            cwd,
            packageName: selector.value,
            url
          })
        ),
        Effect.map((resolution: PackageVersionResolution) => resolution.ref)
      )
    case "Default":
      return info(`Detecting default branch for ${url}...`).pipe(
        Effect.zipRight(detectDefaultBranch(url)),
        Effect.flatMap((detected) =>
          Option.match(detected, {
            onSome: (value) =>
              info(`Using ref '${value}' (detected from remote HEAD).`).pipe(Effect.as(value)),
            onNone: () =>
              warn("Could not detect default branch; falling back to 'main'.").pipe(
                Effect.as("main")
              )
          })
        )
      )
  }
}

const filterTrailer = (filter: VendorFilter): string => {
  const value = formatVendorFilterTrailer(filter)
  return value.length === 0 ? "" : `\n${TRAILER_FILTER}: ${value}`
}

const syncPackageTrailer = (syncPackage: Option.Option<string>): string =>
  Option.match(syncPackage, {
    onNone: () => "",
    onSome: (value) => `\n${TRAILER_SYNC_PACKAGE}: ${value}`
  })

const subtreeAddMessage = ({
  action = "upsert",
  filter,
  name,
  prefix,
  ref,
  strategy,
  syncPackage,
  url
}: SubtreeAddMessageParams) =>
  `vendor: add ${name} (${url}@${ref}) [${strategy}]\n\n${TRAILER_DIR}: ${prefix}\n${TRAILER_URL}: ${url}\n${TRAILER_REF}: ${ref}\n${TRAILER_STRATEGY}: ${strategy}\n${TRAILER_ACTION}: ${action}${filterTrailer(filter)}${syncPackageTrailer(syncPackage)}`

const ensureNewVendorTarget = ({
  cwd,
  finalName,
  finalPrefix,
  fs,
  path
}: EnsureNewVendorTargetParams) =>
  Effect.gen(function* () {
    const existing = yield* findByName({ cwd, name: finalName })
    if (Option.isSome(existing)) {
      return yield* Effect.fail(
        new VendoredRepoAlreadyExists({
          name: finalName,
          prefix: existing.value.prefix
        })
      )
    }
    const exists = yield* fs.exists(path.resolve(cwd, finalPrefix))
    if (exists) {
      return yield* Effect.fail(new VendorPathAlreadyExists({ prefix: finalPrefix }))
    }
  })

const addSubtree = ({
  cloudflareArtifact: _cloudflareArtifact,
  cwd,
  finalName,
  finalPrefix,
  finalRef,
  filter,
  syncPackage,
  url
}: AddSubtreeParams) =>
  hasVendorFilter(filter)
    ? Effect.gen(function* () {
        yield* materializeFilteredRepo({
          cwd,
          filter,
          prefix: finalPrefix,
          ref: finalRef,
          url
        })
        const message = subtreeAddMessage({
          filter,
          name: finalName,
          prefix: finalPrefix,
          ref: finalRef,
          strategy: "subtree",
          syncPackage,
          url
        })
        const committed = yield* commitPathsIfChanged({
          cwd,
          paths: [finalPrefix],
          message
        })
        if (!committed) yield* emptyCommit({ cwd, message })
      })
    : git(
        [
          "subtree",
          "add",
          `--prefix=${finalPrefix}`,
          url,
          finalRef,
          "--squash",
          "-m",
          subtreeAddMessage({
            filter,
            name: finalName,
            prefix: finalPrefix,
            ref: finalRef,
            strategy: "subtree",
            syncPackage,
            url
          })
        ],
        { cwd }
      ).pipe(
        Effect.filterOrFail(
          (subtree) => subtree.exitCode === 0,
          (subtree) =>
            new SubtreeAddFailed({
              url,
              ref: finalRef,
              prefix: finalPrefix,
              output: subtree.stderr.trim() || subtree.stdout.trim()
            })
        ),
        Effect.asVoid
      )

const strategyGitFailed = ({
  action,
  prefix,
  result,
  strategy
}: {
  readonly action: "add" | "update" | "remove"
  readonly prefix: string
  readonly result: { readonly stdout: string; readonly stderr: string }
  readonly strategy: VendorStrategy
}) =>
  new VendorStrategyCommandFailed({
    action,
    prefix,
    strategy,
    output: result.stderr.trim() || result.stdout.trim() || "unknown error"
  })

const checkoutVendorRef = ({ cwd, prefix, ref, strategy }: CheckoutVendorRefParams) =>
  Effect.gen(function* () {
    const fetch = yield* git(["-C", prefix, "fetch", "--tags", "origin", ref], {
      cwd
    })
    if (fetch.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({ action: "add", prefix, result: fetch, strategy })
      )
    }

    const checkout = yield* git(["-C", prefix, "checkout", "FETCH_HEAD"], {
      cwd
    })
    if (checkout.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({ action: "add", prefix, result: checkout, strategy })
      )
    }
  })

const ensureParentDirectory = ({ cwd, prefix }: EnsureParentDirectoryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs
      .makeDirectory(path.dirname(path.resolve(cwd, prefix)), {
        recursive: true
      })
      .pipe(Effect.ignore)
  })

const importArtifactRemote = ({ artifact, name, ref, url }: ImportArtifactRemoteParams) =>
  Effect.gen(function* () {
    const importName = Option.getOrElse(artifact.name, () => name)
    const imported = yield* CloudflareArtifacts.importRepo({
      branch: ref,
      depth: artifact.depth,
      name: importName,
      url
    })
    return {
      cloneUrl: artifactRemoteWithCredentials(imported),
      redactedUrl: imported.remote
    } satisfies ImportedArtifactRemote
  })

const setCloneOrigin = ({ cwd, prefix, strategy, url }: SetCloneOriginParams) =>
  Effect.gen(function* () {
    const result = yield* git(["-C", prefix, "remote", "set-url", "origin", url], {
      cwd
    })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(strategyGitFailed({ action: "add", prefix, result, strategy }))
    }
  })

const cloneVendorRepo = ({
  artifact,
  cwd,
  name,
  prefix,
  ref,
  strategy,
  url
}: CloneVendorRepoParams) =>
  Effect.gen(function* () {
    if (artifact.enabled) {
      const imported = yield* importArtifactRemote({
        artifact,
        name,
        ref,
        url
      })
      const result = yield* git(["clone", imported.cloneUrl, prefix], {
        cwd,
        redactedArgs: ["clone", imported.redactedUrl, prefix]
      })
      if (result.exitCode !== 0) {
        return yield* Effect.fail(
          strategyGitFailed({
            action: "add",
            prefix,
            result,
            strategy
          })
        )
      }
      return result
    }

    const hostResult = yield* RepositoryHosts.clone({
      cwd,
      input: url,
      target: prefix
    })
    if (Option.isSome(hostResult) && hostResult.value.exitCode === 0) {
      return hostResult.value
    }

    const result = yield* git(["clone", url, prefix], { cwd })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({
          action: "add",
          prefix,
          result,
          strategy
        })
      )
    }
    return result
  })

const addSubmodule = ({
  cwd,
  existingRepos: _existingRepos,
  filter,
  finalName,
  finalPrefix,
  finalRef,
  syncPackage,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    yield* ensureParentDirectory({ cwd, prefix: finalPrefix })
    const result = yield* git(["submodule", "add", url, finalPrefix], { cwd })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({
          action: "add",
          prefix: finalPrefix,
          result,
          strategy
        })
      )
    }

    yield* checkoutVendorRef({
      cwd,
      prefix: finalPrefix,
      ref: finalRef,
      strategy
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitmodules", finalPrefix],
      message: subtreeAddMessage({
        name: finalName,
        filter,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        syncPackage,
        url
      })
    })
    if (!committed) {
      yield* emptyCommit({
        cwd,
        message: subtreeAddMessage({
          name: finalName,
          filter,
          prefix: finalPrefix,
          ref: finalRef,
          strategy,
          syncPackage,
          url
        })
      })
    }
  })

const addCloneIgnore = ({
  cloudflareArtifact,
  cwd,
  existingRepos,
  filter,
  finalName,
  finalPrefix,
  finalRef,
  syncPackage,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    yield* ensureParentDirectory({ cwd, prefix: finalPrefix })
    if (hasVendorFilter(filter)) {
      if (cloudflareArtifact.enabled) {
        const imported = yield* importArtifactRemote({
          artifact: cloudflareArtifact,
          name: finalName,
          ref: finalRef,
          url
        })
        yield* checkoutFilteredRepo({
          cwd,
          filter,
          redactedUrl: imported.redactedUrl,
          ref: finalRef,
          storedRemoteUrl: url,
          target: finalPrefix,
          url: imported.cloneUrl
        })
      } else {
        yield* checkoutFilteredRepo({
          cwd,
          filter,
          ref: finalRef,
          target: finalPrefix,
          url
        })
      }
    } else {
      yield* cloneVendorRepo({
        artifact: cloudflareArtifact,
        cwd,
        name: finalName,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        url
      })
      yield* checkoutVendorRef({
        cwd,
        prefix: finalPrefix,
        ref: finalRef,
        strategy
      })
      if (cloudflareArtifact.enabled) {
        yield* setCloneOrigin({
          cwd,
          prefix: finalPrefix,
          strategy,
          url
        })
      }
    }
    yield* updateGitignore({
      cwd,
      prefixes: [
        ...existingRepos
          .filter((repo) => repo.strategy === "clone-ignore")
          .map((repo) => repo.prefix),
        finalPrefix
      ]
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitignore"],
      message: subtreeAddMessage({
        filter,
        name: finalName,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        syncPackage,
        url
      })
    })
    if (!committed) {
      yield* emptyCommit({
        cwd,
        message: subtreeAddMessage({
          filter,
          name: finalName,
          prefix: finalPrefix,
          ref: finalRef,
          strategy,
          syncPackage,
          url
        })
      })
    }
  })

const addByStrategy = (params: AddStrategyParams) => {
  switch (params.strategy) {
    case "subtree":
      return addSubtree(params)
    case "submodule":
      return addSubmodule(params)
    case "clone-ignore":
      return addCloneIgnore(params)
  }
}

export const addImpl = ({
  cloudflareArtifact,
  cloudflareArtifactDepth,
  cloudflareArtifactName,
  exclude,
  excludeDirs,
  excludeExtensions,
  maxFileSize,
  name,
  prefix,
  release,
  ref,
  repo,
  strategy,
  syncPackage,
  tag
}: AddCommandParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)
    const jjColocated = yield* Jujutsu.isColocated(cwd)
    const jjStrategy = effectiveVendorStrategy({
      jjColocated,
      requested: strategy
    })
    if (jjStrategy !== strategy) {
      yield* warn(
        "Detected a colocated jj workspace; using clone-ignore because jj does not support git submodule workflows and mutating git subtree history is fragile there."
      )
    }
    const finalStrategy = cloudflareArtifact ? "clone-ignore" : jjStrategy
    if (cloudflareArtifact && finalStrategy !== jjStrategy) {
      yield* warn(
        "Using clone-ignore because Cloudflare Artifacts is a remote clone accelerator for local vendored checkouts."
      )
    }

    const target = classifyAddTarget(repo)
    const selector = yield* versionSelectorFromOptions({
      ref,
      tag,
      release,
      syncPackage
    })
    const packageResolution =
      target._tag === "PackageTarget"
        ? Option.some(
            yield* resolvePackageTarget({
              cwd,
              packageName: target.packageName
            })
          )
        : Option.none<PackageVersionResolution>()
    const url =
      target._tag === "RepositoryTarget"
        ? target.url
        : Option.getOrThrow(Option.getOrThrow(packageResolution).repositoryUrl)
    const finalName = yield* optionOrElseEffect(name, inferRepoName(url))
    const finalPrefix = (
      Option.isSome(prefix) ? prefix.value : `${VENDOR_DIR}/${finalName}`
    ).replace(/\/+$/, "")
    const finalRef =
      target._tag === "PackageTarget" && selector._tag === "Default"
        ? Option.getOrThrow(packageResolution).ref
        : yield* resolveRef({ cwd, url, selector })
    const resolvedSyncPackage =
      selector._tag === "SyncPackage"
        ? Option.some(selector.value)
        : target._tag === "PackageTarget" && selector._tag === "Default"
          ? Option.some(target.packageName)
          : Option.none<string>()
    const artifactDepth = yield* parseOptionalPositiveInteger(cloudflareArtifactDepth)
    const artifactOptions = {
      depth: artifactDepth,
      enabled: cloudflareArtifact,
      name: cloudflareArtifactName
    } satisfies CloudflareArtifactOptions
    const filter = yield* vendorFilterFromOptions({
      exclude,
      excludeDirs,
      excludeExtensions,
      maxFileSize: Option.getOrNull(maxFileSize)
    })
    if (finalStrategy === "submodule" && hasVendorFilter(filter)) {
      return yield* Effect.fail(
        new UnsupportedVendorFilter({
          strategy: finalStrategy,
          reason:
            "submodules commit a gitlink to the upstream repository, so ignored files cannot be represented portably in the parent repo"
        })
      )
    }

    yield* ensureNewVendorTarget({ cwd, finalName, finalPrefix, fs, path })
    const existingRepos = yield* listVendored(cwd)

    yield* info(`Adding ${finalStrategy}: ${url} @ ${finalRef} -> ${finalPrefix}/`)
    yield* addByStrategy({
      cwd,
      cloudflareArtifact: artifactOptions,
      existingRepos,
      finalName,
      finalPrefix,
      finalRef,
      filter,
      strategy: finalStrategy,
      syncPackage: resolvedSyncPackage,
      url
    })

    const repos = yield* listVendored(cwd)
    yield* ProjectFiles.refresh({
      cwd,
      repos,
      commitMessage: `vendor: register ${finalName}`,
      editorSettings: true
    })

    yield* ok(`Vendored '${finalName}' at ${finalPrefix}/ using ${finalStrategy}.`)
  }).pipe(withCommandTelemetry("add"))

export const addManyImpl = ({ repos, ...params }: AddManyCommandParams) =>
  Effect.gen(function* () {
    const expandedTargets = yield* RepositoryAliases.expand(repos)
    const expandedRepos = expandedTargets.map((target) => target.target)

    if (expandedRepos.length === 0) {
      return yield* Effect.fail(
        new InvalidAddTargets({
          reason: "No add targets remain after alias expansion.",
          targets: repos
        })
      )
    }

    yield* Effect.forEach(
      expandedTargets,
      (target) =>
        target.alias === undefined
          ? Effect.void
          : info(`Alias '${target.alias}' -> ${target.target}`),
      { discard: true }
    )

    if (expandedRepos.length > 1 && (Option.isSome(params.name) || Option.isSome(params.prefix))) {
      return yield* Effect.fail(
        new InvalidAddTargets({
          reason: "--name and --prefix can only be used when adding one target.",
          targets: expandedRepos
        })
      )
    }

    yield* Effect.forEach(
      expandedRepos,
      (repo) =>
        addImpl({
          ...params,
          repo
        }),
      { concurrency: 1, discard: true }
    )
    if (expandedRepos.length > 1) {
      yield* ok(`Processed ${expandedRepos.length} vendor add target(s).`)
    }
  }).pipe(withCommandTelemetry("add-many"))

export const addCmd = Cli.make(
  "add",
  {
    repos: addRepoArgs,
    ref: addRefOption,
    tag: addTagOption,
    release: addReleaseOption,
    syncPackage: addSyncPackageOption,
    cloudflareArtifact: addCloudflareArtifactOption,
    cloudflareArtifactDepth: addCloudflareArtifactDepthOption,
    cloudflareArtifactName: addCloudflareArtifactNameOption,
    exclude: addExcludeOption,
    excludeDirs: addExcludeDirOption,
    excludeExtensions: addExcludeExtOption,
    maxFileSize: addMaxFileSizeOption,
    prefix: addPrefixOption,
    name: addNameOption,
    strategy: addStrategyOption
  },
  addManyImpl
).pipe(
  Cli.withDescription(
    "Add one or more vendored repositories, aliases, or npm packages using subtree, submodule, or clone-ignore strategy metadata."
  )
)
