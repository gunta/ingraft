import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { ok, withCommandTelemetry } from "../app/log.tsx"
import { RuntimeConfig } from "../app/runtime.ts"
import {
  detectFork,
  readForkMode,
  writeForkMode,
  type ForkMode
} from "../domain/fork-mode.ts"
import { listVendored } from "../domain/vendor-state.ts"
import { commandInvocation } from "../project/script.ts"
import { ProjectFiles } from "../project/service.ts"
import { repoRoot } from "../services/git.ts"
import { Prompts } from "../services/prompts.tsx"

export const initImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const existingMode = yield* readForkMode({ cwd })
  if (existingMode === undefined) {
    const detected = yield* detectFork({ cwd })
    if (detected.isFork) {
      const prompts = yield* Prompts
      const parentName =
        "parentNameWithOwner" in detected ? detected.parentNameWithOwner : undefined
      const baseMessage =
        parentName === undefined
          ? "This repo looks like a fork. How will you use it? [1=contribute upstream, 2=personal use]:"
          : `This repo is a fork of ${parentName}. How will you use it? [1=contribute upstream, 2=personal use]:`
      const choice = yield* prompts.selectOne({
        message: baseMessage,
        choices: [
          {
            label: "contribute",
            description: "ingraft commits land in the host repo and may push upstream"
          },
          {
            label: "personal",
            description: "ingraft writes to .git/info/exclude only; nothing ever pushes"
          }
        ]
      })
      if (choice !== undefined) {
        yield* writeForkMode({ cwd, mode: choice.label as ForkMode })
        yield* ok(`Saved ingraft.forkMode = ${choice.label}.`)
      }
    }
  }

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
