import { Command as Cli } from "@effect/cli"
import { Effect } from "effect"
import { repoRoot } from "../git.ts"
import { withCommandTelemetry } from "../log.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { listVendored } from "../vendor-state.ts"

export const refreshImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const repos = yield* listVendored(cwd)
  yield* refreshGeneratedFiles({
    cwd,
    repos,
    commitMessage: "vendor: refresh agent docs",
    editorSettings: true
  })
}).pipe(withCommandTelemetry("refresh"))

export const refreshCmd = Cli.make("refresh", {}, () => refreshImpl).pipe(
  Cli.withDescription(
    "Re-generate AGENTS.md sections, clone-ignore .gitignore entries, and editor exclusions from the current git state."
  )
)
