import { Effect, Option } from "effect"
import { updateAgentDocs } from "./agent-docs.ts"
import { commitConfigChanges } from "./git.ts"
import { updateGitignore } from "./gitignore.ts"
import { reportOptionalPath, reportWritten } from "./reports.ts"
import { RuntimeConfig } from "./runtime.ts"
import { commandInvocation } from "./script.ts"
import type { VendoredRepo } from "./vendor-state.ts"
import { updateVscodeSettings } from "./vscode-settings.ts"

export interface RefreshGeneratedFilesParams {
  readonly cwd: string
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly commitMessage: string
  readonly vscode?: boolean
}

export const refreshGeneratedFiles = ({
  commitMessage,
  cwd,
  repos,
  vscode = false
}: RefreshGeneratedFilesParams) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeConfig
    const command = commandInvocation({ cwd, argv: runtime.argv })
    const written = yield* updateAgentDocs({ cwd, repos, command })
    const gitignore = yield* updateGitignore({
      cwd,
      prefixes: repos
        .filter((repo) => repo.strategy === "clone-ignore")
        .map((repo) => repo.prefix)
    })
    yield* reportWritten({
      cwd,
      paths: [...written, ...Option.match(gitignore, {
        onNone: () => [],
        onSome: (path) => [path]
      })]
    })
    if (vscode) {
      const settings = yield* updateVscodeSettings(cwd)
      yield* reportOptionalPath({ cwd, path: settings })
    }
    yield* commitConfigChanges({ cwd, message: commitMessage })
  })
