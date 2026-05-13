import { Args, CliConfig, Command as Cli } from "@effect/cli"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Logger, Option } from "effect"

import { RepositoryAliases } from "./aliases/service.ts"
import { cleanHelpOutput, isSubcommandHelp, printRootHelp, shouldShowRootHelp } from "./app/help.ts"
import { ErrorView } from "./app/ink/error-view.tsx"
import { renderInkOnce } from "./app/ink/render.tsx"
import { LiveLayer } from "./app/layers.ts"
import { RuntimeConfig } from "./app/runtime.ts"
import { addCmd, addManyImpl } from "./commands/add.tsx"
import { contextCmd } from "./commands/context.tsx"
import { depsCmd } from "./commands/deps.tsx"
import { doctorCmd } from "./commands/doctor.tsx"
import { initCmd } from "./commands/init.tsx"
import { listCmd } from "./commands/list.tsx"
import { refreshCmd } from "./commands/refresh.tsx"
import { removeCmd } from "./commands/remove.tsx"
import { openTui, tuiCmd } from "./commands/tui.ts"
import { updateCmd } from "./commands/update.tsx"
import { VERSION } from "./domain/constants.ts"
import { type VendorError, errorPresentation, exitCodeOf } from "./domain/errors.ts"
import { GitMetadata } from "./services/git-metadata.ts"

const rootTargetsArg = Args.text({ name: "target" }).pipe(
  Args.withDescription("Optional repo URLs, GitHub shorthands, or npm package names to vendor."),
  Args.repeated
)

export const vendorCommand = Cli.make("ingraft", { targets: rootTargetsArg }, ({ targets }) =>
  Effect.gen(function* () {
    yield* RepositoryAliases
    return yield* targets.length === 0
      ? openTui
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
    tuiCmd,
    depsCmd,
    addCmd,
    updateCmd,
    removeCmd,
    listCmd,
    contextCmd,
    refreshCmd,
    doctorCmd
  ])
)

export const runCli = Cli.run(vendorCommand, {
  name: "ingraft — git reference manager for coding agents",
  version: VERSION
})

const handleVendorError = <E extends VendorError>(cause: E) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) =>
      Effect.promise(() =>
        renderInkOnce(<ErrorView presentation={errorPresentation(cause)} />)
      ).pipe(Effect.zipRight(runtime.exit(exitCodeOf(cause))))
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

const cliConfigLayer = CliConfig.layer({
  showBuiltIns: false,
  showTypes: false
})

export const main = app.pipe(
  Effect.provide(Logger.pretty),
  Effect.provide(LiveLayer),
  Effect.provide(GitMetadata.Default),
  Effect.provide(cliConfigLayer)
)

export const runMain = () => {
  if (shouldShowRootHelp(process.argv)) {
    printRootHelp()
    return
  }
  if (isSubcommandHelp(process.argv)) {
    const origLog = console.log.bind(console)
    console.log = (...args: any[]) => {
      const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")
      origLog(cleanHelpOutput(text))
    }
  }
  NodeRuntime.runMain(Effect.scoped(main))
}
