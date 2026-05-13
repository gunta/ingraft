import { Command as Cli } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer, Logger } from "effect"
import { FALLBACK_SCRIPT_REL, VERSION } from "./constants.ts"
import {
  type VendorError,
  exitCodeOf,
  formatVendorError
} from "./errors.ts"
import { Git } from "./git.ts"
import { GitHubCli } from "./gh.ts"
import { GitLabCli } from "./glab.ts"
import { RepositoryHosts } from "./repository-hosts.ts"
import { RuntimeConfig } from "./runtime.ts"
import { addCmd } from "./commands/add.ts"
import { initCmd } from "./commands/init.ts"
import { listCmd } from "./commands/list.ts"
import { refreshCmd } from "./commands/refresh.ts"
import { removeCmd } from "./commands/remove.ts"
import { updateCmd } from "./commands/update.ts"

export const vendorCommand = Cli.make("vendor", {}, () =>
  Console.log(
    `Run \`bun ${FALLBACK_SCRIPT_REL} --help\` to see available commands.\n` +
      "Common commands: init, add, update, list, remove, refresh."
  )
).pipe(
  Cli.withDescription(
    "Manage vendored external git repositories for coding agents using subtree, submodule, or clone-ignore strategies."
  ),
  Cli.withSubcommands([
    initCmd,
    addCmd,
    updateCmd,
    removeCmd,
    listCmd,
    refreshCmd
  ])
)

export const runCli = Cli.run(vendorCommand, {
  name: "vendor — git reference manager for coding agents",
  version: VERSION
})

const GitLive = Git.Default.pipe(Layer.provide(BunContext.layer))
const GitHubCliLive = GitHubCli.Default.pipe(Layer.provide(BunContext.layer))
const GitLabCliLive = GitLabCli.Default.pipe(Layer.provide(BunContext.layer))
const RepositoryHostsLive = RepositoryHosts.Default.pipe(
  Layer.provide(Layer.mergeAll(GitHubCliLive, GitLabCliLive))
)
const LiveLayer = Layer.mergeAll(
  BunContext.layer,
  GitLive,
  RepositoryHostsLive,
  RuntimeConfig.Default
)

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

export const runMain = () => BunRuntime.runMain(main)
