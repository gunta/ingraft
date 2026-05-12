import { Args, Command as Cli, Options } from "@effect/cli"
import { Effect, Option } from "effect"
import { updateAgentDocs } from "../agent-docs.ts"
import { TRAILER_DIR, TRAILER_REF, TRAILER_URL } from "../constants.ts"
import { assertCleanTree, commitConfigChanges, git, repoRoot } from "../git.ts"
import { error, info, ok, warn, withCommandTelemetry } from "../log.ts"
import { reportWritten } from "../reports.ts"
import { commandInvocation } from "../script.ts"
import { listVendored, type VendoredRepo } from "../vendor-state.ts"
import { die } from "../errors.ts"

const updateNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Name (or prefix path) of the vendored repository to update."),
  Args.optional
)

const updateAllOption = Options.boolean("all").pipe(
  Options.withAlias("a"),
  Options.withDescription("Update every vendored repository.")
)

export const updateImpl = ({
  all,
  name
}: {
  readonly name: Option.Option<string>
  readonly all: boolean
}) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const list = yield* listVendored(cwd)
    let targets: ReadonlyArray<VendoredRepo>
    if (all) {
      if (list.length === 0) {
        yield* warn("No vendored repos to update.")
        return
      }
      targets = list
    } else {
      if (Option.isNone(name)) {
        return yield* die(
          {
            title: "No update target specified",
            detail: "The update command needs one vendored repo name or --all.",
            hint: "Usage: vendor update <name> or vendor update --all"
          },
          2
        )
      }
      const target = list.find(
        (repo) => repo.name === name.value || repo.prefix === name.value
      )
      if (!target) {
        return yield* die(
          {
            title: `No vendored repo named '${name.value}'`,
            hint: "Run `vendor list` to see what's vendored."
          },
          4
        )
      }
      targets = [target]
    }

    const failed: string[] = []
    for (const repo of targets) {
      yield* info(`Updating ${repo.name}: ${repo.url} @ ${repo.ref}`)
      const message = `vendor: update ${repo.name} (${repo.url}@${repo.ref})\n\n${TRAILER_DIR}: ${repo.prefix}\n${TRAILER_URL}: ${repo.url}\n${TRAILER_REF}: ${repo.ref}`
      const subtree = yield* git(
        [
          "subtree",
          "pull",
          `--prefix=${repo.prefix}`,
          repo.url,
          repo.ref,
          "--squash",
          "-m",
          message
        ],
        { cwd }
      )
      if (subtree.exitCode === 0) {
        yield* ok(`updated ${repo.name}`)
      } else {
        const last =
          (subtree.stderr.trim() || subtree.stdout.trim()).split("\n").slice(-1)[0] ??
          "unknown error"
        yield* error(`failed: ${last}`)
        failed.push(repo.name)
      }
    }

    const reposAfter = yield* listVendored(cwd)
    const command = commandInvocation(cwd)
    const written = yield* updateAgentDocs({ cwd, repos: reposAfter, command })
    yield* reportWritten(cwd, written)
    yield* commitConfigChanges(cwd, "vendor: refresh agent doc after update")

    if (failed.length > 0) {
      return yield* die(
        {
          title: "One or more updates failed",
          detail: `Failed repositories: ${failed.join(", ")}`,
          hint: "Review the git error above, resolve conflicts if any, and retry the failed names."
        },
        3
      )
    }
  }).pipe(withCommandTelemetry("update"))

export const updateCmd = Cli.make(
  "update",
  { name: updateNameArg, all: updateAllOption },
  updateImpl
).pipe(
  Cli.withDescription(
    "Pull upstream changes for one or all vendored repositories."
  )
)
