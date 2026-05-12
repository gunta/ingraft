import { Command as Cli } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Logger } from "effect"
import { FALLBACK_SCRIPT_REL, VERSION } from "./constants.ts"
import { CliError } from "./errors.ts"
import { error } from "./log.ts"
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
    "Manage vendored external git repositories as git subtrees so coding agents can read them as plain files."
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
  name: "vendor — git subtree manager for coding agents",
  version: VERSION
})

export const main = runCli(process.argv).pipe(
  Effect.catchTag("CliError", (cause: CliError) =>
    error(cause.message).pipe(
      Effect.zipRight(Effect.sync(() => process.exit(cause.code)))
    )
  ),
  Effect.provide(Logger.pretty),
  Effect.provide(BunContext.layer)
)

export const runMain = () => BunRuntime.runMain(main)
