import { Args, Command as Cli } from "@effect/cli"
import { NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Logger, Option } from "effect"

import { RepositoryAliases } from "./aliases/service.ts"
import { LiveLayer } from "./app/layers.ts"
import { RuntimeConfig } from "./app/runtime.ts"
import { addCmd, addManyImpl } from "./commands/add.ts"
import { depsCmd, depsImpl } from "./commands/deps.ts"
import { doctorCmd } from "./commands/doctor.ts"
import { initCmd } from "./commands/init.ts"
import { listCmd } from "./commands/list.ts"
import { refreshCmd } from "./commands/refresh.ts"
import { removeCmd } from "./commands/remove.ts"
import { updateCmd } from "./commands/update.ts"
import { VERSION } from "./domain/constants.ts"
import { type VendorError, exitCodeOf, formatVendorError } from "./domain/errors.ts"
import { GitMetadata } from "./services/git-metadata.ts"

const rootTargetsArg = Args.text({ name: "target" }).pipe(
  Args.withDescription("Optional repo URLs, GitHub shorthands, or npm package names to vendor."),
  Args.repeated
)

export const vendorCommand = Cli.make(
  "vendor-subtree",
  { targets: rootTargetsArg },
  ({ targets }) =>
    Effect.gen(function* () {
      yield* RepositoryAliases
      return yield* targets.length === 0
        ? depsImpl({
            dryRun: false,
            json: false,
            strategy: "subtree",
            yes: false
          })
        : addManyImpl({
            cloudflareArtifact: false,
            cloudflareArtifactDepth: Option.none(),
            cloudflareArtifactName: Option.none(),
            exclude: [],
            excludeDirs: [],
            excludeExtensions: [],
            maxFileSize: Option.none(),
            name: Option.none(),
            prefix: Option.none(),
            ref: Option.none(),
            release: Option.none(),
            repos: targets,
            strategy: "subtree",
            syncPackage: Option.none(),
            tag: Option.none()
          })
    })
).pipe(
  Cli.withDescription(
    "Manage vendored external git repositories for coding agents using subtree, submodule, or clone-ignore strategies."
  ),
  Cli.withSubcommands([
    initCmd,
    depsCmd,
    addCmd,
    updateCmd,
    removeCmd,
    listCmd,
    refreshCmd,
    doctorCmd
  ])
)

export const runCli = Cli.run(vendorCommand, {
  name: "vendor-subtree — git reference manager for coding agents",
  version: VERSION
})

const handleVendorError = <E extends VendorError>(cause: E) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) =>
      Console.error(formatVendorError(cause, { colors: runtime.colors })).pipe(
        Effect.zipRight(runtime.exit(exitCodeOf(cause)))
      )
    )
  )

const app = RuntimeConfig.pipe(
  Effect.flatMap((runtime) => runCli(runtime.argv)),
  Effect.catchTags({
    DirtyWorkingTree: handleVendorError,
    GitCommandFailed: handleVendorError,
    GitRemoveFailed: handleVendorError,
    HistoryRewriteFailed: handleVendorError,
    HistoryRewriteToolMissing: handleVendorError,
    InvalidVendorFilter: handleVendorError,
    InvalidAddTargets: handleVendorError,
    NotGitRepository: handleVendorError,
    PackageVersionSyncFailed: handleVendorError,
    RepositoryAliasDatabaseInvalid: handleVendorError,
    RepoNameInferenceFailed: handleVendorError,
    SubtreeAddFailed: handleVendorError,
    UnsupportedVendorFilter: handleVendorError,
    UpdateFailed: handleVendorError,
    UpdateTargetMissing: handleVendorError,
    VendorPathAlreadyExists: handleVendorError,
    VendorStrategyCommandFailed: handleVendorError,
    VendoredRepoAlreadyExists: handleVendorError,
    VendoredRepoNotFound: handleVendorError,
    VersionResolutionFailed: handleVendorError,
    VersionSelectorConflict: handleVendorError
  })
)

export const main = app.pipe(
  Effect.provide(Logger.pretty),
  Effect.provide(LiveLayer),
  Effect.provide(GitMetadata.Default)
)

export const runMain = () => NodeRuntime.runMain(main)
