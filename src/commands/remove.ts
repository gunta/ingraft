import { Args, Command as Cli } from "@effect/cli"
import { Effect, Option } from "effect"
import { updateAgentDocs } from "../agent-docs.ts"
import {
  assertCleanTree,
  commitConfigChanges,
  git,
  gitChecked,
  repoRoot
} from "../git.ts"
import { info, ok } from "../log.ts"
import { reportWritten } from "../reports.ts"
import { commandInvocation } from "../script.ts"
import { findByName, listVendored } from "../vendor-state.ts"
import { die } from "../errors.ts"

const removeNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Name (or prefix path) of the vendored repository to remove.")
)

export const removeImpl = (name: string) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const repo = yield* findByName(cwd, name)
    if (Option.isNone(repo)) {
      return yield* die(`No vendored repo named '${name}'.`, 4)
    }
    const target = repo.value

    yield* info(`Removing ${target.prefix}/`)
    const rm = yield* git(["rm", "-rf", target.prefix], { cwd })
    if (rm.exitCode !== 0) {
      return yield* die(`git rm failed: ${rm.stderr.trim() || rm.stdout.trim()}`, 3)
    }
    yield* gitChecked(["commit", "-m", `vendor: remove ${target.name}`], { cwd })

    const reposAfter = yield* listVendored(cwd)
    const command = commandInvocation(cwd)
    const written = yield* updateAgentDocs({ cwd, repos: reposAfter, command })
    yield* reportWritten(cwd, written)
    yield* commitConfigChanges(
      cwd,
      `vendor: refresh agent doc after removing ${target.name}`
    )

    yield* ok(`Removed '${target.name}'.`)
  })

export const removeCmd = Cli.make("remove", { name: removeNameArg }, ({ name }) =>
  removeImpl(name)
).pipe(Cli.withDescription("Remove a vendored repository."))
