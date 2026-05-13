import { Command as Cli } from "@effect/cli"
import { Effect } from "effect"

import { withCommandTelemetry } from "../app/log.tsx"
import { launchTui } from "../tui/launcher.ts"

export const openTui = Effect.promise(() => launchTui()).pipe(
  Effect.asVoid,
  withCommandTelemetry("tui")
)

export const tuiCmd = Cli.make("tui", {}, () => openTui).pipe(
  Cli.withDescription("Open the interactive vendoring dashboard.")
)
