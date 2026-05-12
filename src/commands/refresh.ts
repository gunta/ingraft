import { Command as Cli } from "@effect/cli"
import { Effect } from "effect"
import { updateAgentDocs } from "../agent-docs.ts"
import { commitConfigChanges, repoRoot } from "../git.ts"
import { withCommandTelemetry } from "../log.ts"
import { reportOptionalPath, reportWritten } from "../reports.ts"
import { commandInvocation } from "../script.ts"
import { listVendored } from "../vendor-state.ts"
import { updateVscodeSettings } from "../vscode-settings.ts"

export const refreshImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const repos = yield* listVendored(cwd)
  const command = commandInvocation(cwd)
  const written = yield* updateAgentDocs({ cwd, repos, command })
  yield* reportWritten(cwd, written)
  const settings = yield* updateVscodeSettings(cwd)
  yield* reportOptionalPath(cwd, settings)
  yield* commitConfigChanges(cwd, "vendor: refresh agent docs")
}).pipe(withCommandTelemetry("refresh"))

export const refreshCmd = Cli.make("refresh", {}, () => refreshImpl).pipe(
  Cli.withDescription(
    "Re-generate AGENTS.md sections + .vscode/settings.json from the current git state."
  )
)
