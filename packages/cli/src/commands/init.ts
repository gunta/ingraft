import { Command as Cli } from "@effect/cli"
import { Effect } from "effect"
import { repoRoot } from "../services/git.ts"
import { ok, withCommandTelemetry } from "../app/log.ts"
import { ProjectFiles } from "../project/service.ts"
import { RuntimeConfig } from "../app/runtime.ts"
import { commandInvocation } from "../project/script.ts"
import { listVendored } from "../domain/vendor-state.ts"

export const initImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const repos = yield* listVendored(cwd)
  const runtime = yield* RuntimeConfig
  const command = commandInvocation({ cwd, argv: runtime.argv })
  yield* ProjectFiles.refresh({
    cwd,
    repos,
    commitMessage: "vendor: initialize vendor-subtree-skill",
    editorSettings: true
  })
  yield* ok(
    `Initialized. Run \`${command} add <repo>\` to vendor a repository.`
  )
}).pipe(withCommandTelemetry("init"))

export const initCmd = Cli.make("init", {}, () => initImpl).pipe(
  Cli.withDescription(
    "Bootstrap the AGENTS.md (and CLAUDE.md) section, clone-ignore .gitignore entries, and editor exclusions, then commit."
  )
)
