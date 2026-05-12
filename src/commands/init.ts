import { Command as Cli } from "@effect/cli"
import { Effect } from "effect"
import { updateAgentDocs } from "../agent-docs.ts"
import { commitConfigChanges, repoRoot } from "../git.ts"
import { ok, withCommandTelemetry } from "../log.ts"
import { reportOptionalPath, reportWritten } from "../reports.ts"
import { commandInvocation } from "../script.ts"
import { listVendored } from "../vendor-state.ts"
import { updateVscodeSettings } from "../vscode-settings.ts"

export const initImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const repos = yield* listVendored(cwd)
  const command = commandInvocation(cwd)
  const written = yield* updateAgentDocs({ cwd, repos, command })
  yield* reportWritten(cwd, written)
  const settings = yield* updateVscodeSettings(cwd)
  yield* reportOptionalPath(cwd, settings)
  yield* commitConfigChanges(cwd, "vendor: initialize vendor-subtree-skill")
  yield* ok(
    `Initialized. Run \`${command} add <repo>\` to vendor a repository.`
  )
}).pipe(withCommandTelemetry("init"))

export const initCmd = Cli.make("init", {}, () => initImpl).pipe(
  Cli.withDescription(
    "Bootstrap the AGENTS.md (and CLAUDE.md) section + .vscode/settings.json exclusions, and commit."
  )
)
