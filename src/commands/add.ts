import { Args, Command as Cli, Options } from "@effect/cli"
import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_REF,
  TRAILER_STRATEGY,
  TRAILER_URL,
  VENDOR_DIR
} from "../constants.ts"
import {
  SubtreeAddFailed,
  UnsupportedVendorFilter,
  VendorPathAlreadyExists,
  VendorStrategyCommandFailed,
  VendoredRepoAlreadyExists,
  VersionResolutionFailed
} from "../errors.ts"
import { materializeFilteredRepo } from "../filtered-checkout.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  detectDefaultBranch,
  emptyCommit,
  git,
  repoRoot
} from "../git.ts"
import { updateGitignore } from "../gitignore.ts"
import { info, ok, warn, withCommandTelemetry } from "../log.ts"
import { inferRepoName, normalizeRepoUrl } from "../repo.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { RepositoryHosts } from "../repository-hosts.ts"
import { findByName, listVendored, type VendoredRepo } from "../vendor-state.ts"
import {
  DEFAULT_VENDOR_STRATEGY,
  type VendorStrategy
} from "../vendor-strategy.ts"
import {
  EMPTY_VENDOR_FILTER,
  formatVendorFilterTrailer,
  hasVendorFilter,
  type VendorFilter,
  vendorFilterFromOptions
} from "../vendor-filter.ts"
import {
  resolveVersion,
  type VersionSelector,
  versionSelectorFromOptions
} from "../version.ts"

export interface AddCommandParams {
  readonly repo: string
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly maxFileSize: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly name: Option.Option<string>
  readonly strategy: VendorStrategy
}

interface SubtreeAddMessageParams {
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly url: string
  readonly strategy: VendorStrategy
  readonly filter: VendorFilter
  readonly action?: "upsert" | "remove"
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
  readonly finalName: string
  readonly finalPrefix: string
  readonly finalRef: string
  readonly filter: VendorFilter
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
  readonly cwd: string
  readonly prefix: string
  readonly strategy: VendorStrategy
  readonly url: string
}

interface ResolveRefParams {
  readonly url: string
  readonly selector: VersionSelector
}

const addRepoArg = Args.text({ name: "repo" }).pipe(
  Args.withDescription(
    "GitHub shorthand (owner/repo), HTTPS URL, or SSH URL of the upstream repository."
  )
)

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
  Options.withDescription(
    "Override the inferred name (used for the prefix path and lookups)."
  ),
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

const optionOrElseEffect = <A, E, R>(
  option: Option.Option<A>,
  orElse: Effect.Effect<A, E, R>
) =>
  Option.match(option, {
    onNone: () => orElse,
    onSome: Effect.succeed
  })

const resolveRef = ({ selector, url }: ResolveRefParams) => {
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
            onSome: (value) =>
              info(`Using release tag '${value}'.`).pipe(Effect.as(value))
          })
        )
      )
    case "Default":
      return info(`Detecting default branch for ${url}...`).pipe(
        Effect.zipRight(detectDefaultBranch(url)),
        Effect.flatMap((detected) =>
          Option.match(detected, {
            onSome: (value) =>
              info(`Using ref '${value}' (detected from remote HEAD).`).pipe(
                Effect.as(value)
              ),
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
  return value.length === 0 ? "" : `\nvendor-filter: ${value}`
}

const subtreeAddMessage = ({
  action = "upsert",
  filter,
  name,
  prefix,
  ref,
  strategy,
  url
}: SubtreeAddMessageParams) =>
  `vendor: add ${name} (${url}@${ref}) [${strategy}]\n\n${TRAILER_DIR}: ${prefix}\n${TRAILER_URL}: ${url}\n${TRAILER_REF}: ${ref}\n${TRAILER_STRATEGY}: ${strategy}\n${TRAILER_ACTION}: ${action}${filterTrailer(filter)}`

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
      return yield* Effect.fail(
        new VendorPathAlreadyExists({ prefix: finalPrefix })
      )
    }
  })

const addSubtree = ({
  cwd,
  finalName,
  finalPrefix,
  finalRef,
  filter,
  url
}: AddSubtreeParams) =>
  hasVendorFilter(filter)
    ? Effect.gen(function* () {
        yield* materializeFilteredRepo({
          cwd,
          filter,
          prefix: finalPrefix,
          ref: finalRef,
          target: finalPrefix,
          url
        })
        yield* commitPathsIfChanged({
          cwd,
          paths: [finalPrefix],
          message: subtreeAddMessage({
            filter,
            name: finalName,
            prefix: finalPrefix,
            ref: finalRef,
            strategy: "subtree",
            url
          })
        })
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

const checkoutVendorRef = ({
  cwd,
  prefix,
  ref,
  strategy
}: CheckoutVendorRefParams) =>
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

const ensureParentDirectory = ({
  cwd,
  prefix
}: EnsureParentDirectoryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(path.dirname(path.resolve(cwd, prefix)), {
      recursive: true
    }).pipe(Effect.ignore)
  })

const cloneVendorRepo = ({
  cwd,
  prefix,
  strategy,
  url
}: CloneVendorRepoParams) =>
  Effect.gen(function* () {
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
  finalName,
  finalPrefix,
  finalRef,
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
          url
        })
      })
    }
  })

const addCloneIgnore = ({
  cwd,
  existingRepos,
  finalName,
  finalPrefix,
  finalRef,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    yield* ensureParentDirectory({ cwd, prefix: finalPrefix })
    if (hasVendorFilter(filter)) {
      yield* checkoutFilteredRepo({
        cwd,
        filter,
        ref: finalRef,
        target: finalPrefix,
        url
      })
    } else {
      yield* cloneVendorRepo({
        cwd,
        prefix: finalPrefix,
        strategy,
        url
      })

      yield* checkoutVendorRef({
        cwd,
        prefix: finalPrefix,
        ref: finalRef,
        strategy
      })
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
  tag
}: AddCommandParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const url = normalizeRepoUrl(repo)
    const finalName = yield* optionOrElseEffect(name, inferRepoName(url))
    const finalPrefix = (
      Option.isSome(prefix) ? prefix.value : `${VENDOR_DIR}/${finalName}`
    ).replace(/\/+$/, "")
    const selector = yield* versionSelectorFromOptions({ ref, tag, release })
    const finalRef = yield* resolveRef({ url, selector })
    const filter = yield* vendorFilterFromOptions({
      exclude,
      excludeDirs,
      excludeExtensions,
      maxFileSize: Option.getOrNull(maxFileSize)
    })
    if (strategy === "submodule" && hasVendorFilter(filter)) {
      return yield* Effect.fail(
        new UnsupportedVendorFilter({
          strategy,
          reason:
            "submodules commit a gitlink to the upstream repository, so ignored files cannot be represented portably in the parent repo"
        })
      )
    }

    yield* ensureNewVendorTarget({ cwd, finalName, finalPrefix, fs, path })
    const existingRepos = yield* listVendored(cwd)

    yield* info(
      `Adding ${strategy}: ${url} @ ${finalRef} -> ${finalPrefix}/`
    )
    yield* addByStrategy({
      cwd,
      existingRepos,
      finalName,
      finalPrefix,
      finalRef,
      filter,
      strategy,
      url
    })

    const repos = yield* listVendored(cwd)
    yield* refreshGeneratedFiles({
      cwd,
      repos,
      commitMessage: `vendor: register ${finalName}`,
      vscode: true
    })

    yield* ok(`Vendored '${finalName}' at ${finalPrefix}/ using ${strategy}.`)
  }).pipe(withCommandTelemetry("add"))

export const addCmd = Cli.make(
  "add",
  {
    repo: addRepoArg,
    ref: addRefOption,
    tag: addTagOption,
    release: addReleaseOption,
    exclude: addExcludeOption,
    excludeDirs: addExcludeDirOption,
    excludeExtensions: addExcludeExtOption,
    maxFileSize: addMaxFileSizeOption,
    prefix: addPrefixOption,
    name: addNameOption,
    strategy: addStrategyOption
  },
  addImpl
).pipe(
  Cli.withDescription(
    "Add a new vendored repository using subtree, submodule, or clone-ignore strategy metadata."
  )
)
