import { Command as Cli } from "@effect/cli"
import { NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Logger } from "effect"
import { LiveLayer } from "./app/layers.ts"
import { RuntimeConfig } from "./app/runtime.ts"
import { VERSION } from "./domain/constants.ts"
import {
  type VendorError,
  exitCodeOf,
  formatVendorError
} from "./domain/errors.ts"
import { addCmd } from "./commands/add.ts"
import { depsCmd, depsImpl } from "./commands/deps.ts"
import { doctorCmd } from "./commands/doctor.ts"
import { initCmd } from "./commands/init.ts"
import { listCmd } from "./commands/list.ts"
import { refreshCmd } from "./commands/refresh.ts"
import { removeCmd } from "./commands/remove.ts"
import { updateCmd } from "./commands/update.ts"

export const vendorCommand = Cli.make("vendor-subtree", {}, () =>
  depsImpl({
    dryRun: false,
    json: false,
    strategy: "subtree",
    yes: false
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

const handleVendorError = <E extends VendorError>(
  cause: E
) =>
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
    InvalidVendorFilter: handleVendorError,
    NotGitRepository: handleVendorError,
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
  Effect.provide(LiveLayer)
)

export const runMain = () => NodeRuntime.runMain(main)
