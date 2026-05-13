import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { ok, withCommandTelemetry } from "../app/log.tsx"
import { RuntimeConfig } from "../app/runtime.ts"
import { listVendored } from "../domain/vendor-state.ts"
import { commandInvocation } from "../project/script.ts"
import { ProjectFiles } from "../project/service.ts"
import { repoRoot } from "../services/git.ts"

export const initImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const repos = yield* listVendored(cwd)
  const runtime = yield* RuntimeConfig
  const projectFiles = yield* ProjectFiles
  const command = yield* commandInvocation({ cwd, argv: runtime.argv })
  yield* projectFiles.refresh({
    cwd,
    repos,
    commitMessage: "vendor: initialize ingraft",
    editorSettings: true
  })
  yield* ok(`Initialized. Run \`${command} add <repo>\` to vendor a repository.`)
}).pipe(withCommandTelemetry("init"))

export const initCmd = Command.make("init", {}, () => initImpl).pipe(
  Command.withDescription(
    "Bootstrap agent docs, .gitignore, .gitattributes, editor settings, and tool ignores, then commit."
  )
)
