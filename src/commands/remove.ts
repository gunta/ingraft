import { Args, Command as Cli } from "@effect/cli"
import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import { GitRemoveFailed, VendoredRepoNotFound } from "../errors.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  emptyCommit,
  git,
  gitChecked,
  repoRoot
} from "../git.ts"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_REF,
  TRAILER_STRATEGY,
  TRAILER_URL
} from "../constants.ts"
import { updateGitignore } from "../gitignore.ts"
import { info, ok, withCommandTelemetry } from "../log.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { findByName, listVendored, type VendoredRepo } from "../vendor-state.ts"

export interface RemoveCommandParams {
  readonly name: string
}

interface RemoveTargetParams {
  readonly cwd: string
  readonly name: string
}

interface RemoveFromGitParams {
  readonly cwd: string
  readonly target: VendoredRepo
}

interface RemoveCloneIgnoreParams {
  readonly cwd: string
  readonly reposBefore: ReadonlyArray<VendoredRepo>
  readonly target: VendoredRepo
}

const removeNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Name (or prefix path) of the vendored repository to remove.")
)

const removeTarget = ({ cwd, name }: RemoveTargetParams) =>
  findByName({ cwd, name }).pipe(
    Effect.flatMap((repo) =>
      Option.match(repo, {
        onNone: () => Effect.fail(new VendoredRepoNotFound({ name })),
        onSome: Effect.succeed
      })
    )
  )

const removeFromGit = ({ cwd, target }: RemoveFromGitParams) =>
  git(
    target.strategy === "submodule"
      ? ["rm", "-f", target.prefix]
      : ["rm", "-rf", target.prefix],
    { cwd }
  ).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) =>
        new GitRemoveFailed({
          prefix: target.prefix,
          output: result.stderr.trim() || result.stdout.trim()
        })
    ),
    Effect.asVoid
  )

const removeMessage = (target: VendoredRepo) =>
  `vendor: remove ${target.name} (${target.url}@${target.ref}) [${target.strategy}]\n\n${TRAILER_DIR}: ${target.prefix}\n${TRAILER_URL}: ${target.url}\n${TRAILER_REF}: ${target.ref}\n${TRAILER_STRATEGY}: ${target.strategy}\n${TRAILER_ACTION}: remove`

const removeCloneIgnore = ({
  cwd,
  reposBefore,
  target
}: RemoveCloneIgnoreParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.remove(path.resolve(cwd, target.prefix), {
      force: true,
      recursive: true
    })
    yield* updateGitignore({
      cwd,
      prefixes: reposBefore
        .filter(
          (repo) =>
            repo.strategy === "clone-ignore" && repo.prefix !== target.prefix
        )
        .map((repo) => repo.prefix)
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitignore"],
      message: removeMessage(target)
    })
    if (!committed) yield* emptyCommit({ cwd, message: removeMessage(target) })
  })

export const removeImpl = ({ name }: RemoveCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const target = yield* removeTarget({ cwd, name })
    const reposBefore = yield* listVendored(cwd)

    yield* info(`Removing ${target.prefix}/`)
    if (target.strategy === "clone-ignore") {
      yield* removeCloneIgnore({ cwd, reposBefore, target })
    } else {
      yield* removeFromGit({ cwd, target })
      yield* gitChecked(["commit", "-m", removeMessage(target)], { cwd })
    }

    const reposAfter = yield* listVendored(cwd)
    yield* refreshGeneratedFiles({
      cwd,
      repos: reposAfter,
      commitMessage: `vendor: refresh agent doc after removing ${target.name}`
    })

    yield* ok(`Removed '${target.name}'.`)
  }).pipe(withCommandTelemetry("remove"))

export const removeCmd = Cli.make(
  "remove",
  { name: removeNameArg },
  removeImpl
).pipe(Cli.withDescription("Remove a vendored repository."))
