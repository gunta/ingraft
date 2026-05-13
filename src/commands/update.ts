import { Args, Command as Cli, Options } from "@effect/cli"
import { FileSystem, Path } from "@effect/platform"
import { Array as Arr, Effect, Option } from "effect"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_REF,
  TRAILER_STRATEGY,
  TRAILER_URL
} from "../constants.ts"
import {
  UpdateFailed,
  UpdateTargetMissing,
  VendorStrategyCommandFailed,
  VendoredRepoNotFound
} from "../errors.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  git,
  repoRoot
} from "../git.ts"
import { error, info, ok, warn, withCommandTelemetry } from "../log.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { listVendored, type VendoredRepo } from "../vendor-state.ts"
import type { VendorStrategy } from "../vendor-strategy.ts"

export interface SelectUpdateTargetsParams {
  readonly all: boolean
  readonly name: Option.Option<string>
  readonly repos: ReadonlyArray<VendoredRepo>
}

export interface UpdateCommandParams {
  readonly name: Option.Option<string>
  readonly all: boolean
}

interface GitOutputParams {
  readonly stdout: string
  readonly stderr: string
}

interface VendoredRepoCommandParams {
  readonly cwd: string
  readonly repo: VendoredRepo
}

interface StrategyGitFailureParams {
  readonly prefix: string
  readonly result: { readonly stdout: string; readonly stderr: string }
  readonly strategy: VendorStrategy
}

const updateNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Name (or prefix path) of the vendored repository to update."),
  Args.optional
)

const updateAllOption = Options.boolean("all").pipe(
  Options.withAlias("a"),
  Options.withDescription("Update every vendored repository.")
)

type UpdateTargetSelectionError = UpdateTargetMissing | VendoredRepoNotFound

export const selectUpdateTargets = ({
  all,
  name,
  repos
}: SelectUpdateTargetsParams): Effect.Effect<
  Option.Option<ReadonlyArray<VendoredRepo>>,
  UpdateTargetSelectionError
> => {
  if (all) {
    return Effect.succeed(
      repos.length === 0 ? Option.none() : Option.some(repos)
    )
  }

  return Effect.gen(function* () {
    const value = yield* Option.match(name, {
      onNone: () => Effect.fail(new UpdateTargetMissing()),
      onSome: Effect.succeed
    })
    const repo = yield* Option.match(
      Option.fromNullable(
        repos.find((repo) => repo.name === value || repo.prefix === value)
      ),
      {
        onNone: () => Effect.fail(new VendoredRepoNotFound({ name: value })),
        onSome: Effect.succeed
      }
    )
    return Option.some([repo])
  })
}

const updateMessage = (repo: VendoredRepo) =>
  `vendor: update ${repo.name} (${repo.url}@${repo.ref}) [${repo.strategy}]\n\n${TRAILER_DIR}: ${repo.prefix}\n${TRAILER_URL}: ${repo.url}\n${TRAILER_REF}: ${repo.ref}\n${TRAILER_STRATEGY}: ${repo.strategy}\n${TRAILER_ACTION}: upsert`

const lastGitLine = ({ stdout, stderr }: GitOutputParams): string =>
  (stderr.trim() || stdout.trim()).split("\n").slice(-1)[0] ?? "unknown error"

const failureOutput = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null) {
    if ("output" in cause && typeof cause.output === "string") return cause.output
    if ("message" in cause && typeof cause.message === "string") {
      return cause.message
    }
  }
  return String(cause)
}

const pullSubtree = ({ cwd, repo }: VendoredRepoCommandParams) =>
  git(
    [
      "subtree",
      "pull",
      `--prefix=${repo.prefix}`,
      repo.url,
      repo.ref,
      "--squash",
      "-m",
      updateMessage(repo)
    ],
    { cwd }
  )

const strategyGitFailed = ({
  prefix,
  result,
  strategy
}: StrategyGitFailureParams) =>
  new VendorStrategyCommandFailed({
    action: "update",
    prefix,
    strategy,
    output: result.stderr.trim() || result.stdout.trim() || "unknown error"
  })

const checkedStrategyGit = (
  args: ReadonlyArray<string>,
  { cwd, repo }: VendoredRepoCommandParams
) =>
  git(args, { cwd }).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) =>
        strategyGitFailed({
          prefix: repo.prefix,
          result,
          strategy: repo.strategy
        })
    ),
    Effect.asVoid
  )

const checkoutRepoRef = (params: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    yield* checkedStrategyGit(
      ["-C", params.repo.prefix, "fetch", "--tags", "origin", params.repo.ref],
      params
    )
    yield* checkedStrategyGit(["-C", params.repo.prefix, "checkout", "FETCH_HEAD"], params)
  })

const updateSubmodule = (params: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    yield* checkedStrategyGit(
      ["submodule", "update", "--init", "--recursive", "--", params.repo.prefix],
      params
    )
    yield* checkoutRepoRef(params)
    yield* commitPathsIfChanged({
      cwd: params.cwd,
      paths: [params.repo.prefix],
      message: updateMessage(params.repo)
    })
  })

const updateCloneIgnore = (params: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(params.cwd, params.repo.prefix)
    const exists = yield* fs.exists(target)
    if (!exists) {
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(
        Effect.ignore
      )
      yield* checkedStrategyGit(["clone", params.repo.url, params.repo.prefix], params)
    }
    yield* checkoutRepoRef(params)
  })

const updateByStrategy = (params: VendoredRepoCommandParams) => {
  switch (params.repo.strategy) {
    case "subtree":
      return pullSubtree(params).pipe(
        Effect.filterOrFail(
          (result) => result.exitCode === 0,
          (result) =>
            strategyGitFailed({
              prefix: params.repo.prefix,
              result,
              strategy: params.repo.strategy
            })
        ),
        Effect.asVoid
      )
    case "submodule":
      return updateSubmodule(params)
    case "clone-ignore":
      return updateCloneIgnore(params)
  }
}

const updateOne = ({ cwd, repo }: VendoredRepoCommandParams) =>
  info(`Updating ${repo.name}: ${repo.url} @ ${repo.ref}`).pipe(
    Effect.zipRight(updateByStrategy({ cwd, repo }).pipe(Effect.either)),
    Effect.flatMap((result) =>
      result._tag === "Right"
          ? ok(`updated ${repo.name}`).pipe(Effect.as(Option.none<string>()))
        : error(
            `failed: ${lastGitLine({
              stdout: "",
              stderr: failureOutput(result.left)
            })}`
          ).pipe(Effect.as(Option.some(repo.name)))
    )
  )

const refreshAfterUpdate = (cwd: string) =>
  Effect.gen(function* () {
    const reposAfter = yield* listVendored(cwd)
    yield* refreshGeneratedFiles({
      cwd,
      repos: reposAfter,
      commitMessage: "vendor: refresh agent doc after update"
    })
  })

export const updateImpl = ({
  all,
  name
}: UpdateCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const targets = yield* listVendored(cwd).pipe(
      Effect.flatMap((repos) => selectUpdateTargets({ all, name, repos }))
    )

    yield* Option.match(targets, {
      onNone: () => warn("No vendored repos to update."),
      onSome: (repos) =>
        Effect.forEach(repos, (repo) => updateOne({ cwd, repo }), {
          concurrency: 1
        }).pipe(
          Effect.map(Arr.getSomes),
          Effect.tap(() => refreshAfterUpdate(cwd)),
          Effect.flatMap((failed) =>
            failed.length > 0
              ? Effect.fail(new UpdateFailed({ names: failed }))
              : Effect.void
          )
        )
    })
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
