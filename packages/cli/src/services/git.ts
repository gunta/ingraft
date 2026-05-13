import { Command as PlatformCommand, CommandExecutor, FileSystem } from "@effect/platform"
import { Effect, Option, Stream, pipe } from "effect"

import { RuntimeConfig } from "../app/runtime.ts"
import { DirtyWorkingTree, GitCommandFailed, NotGitRepository } from "../domain/errors.ts"
import { GitMetadata } from "./git-metadata.ts"
import { RepositoryHosts } from "./repository-hosts.ts"

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText("utf-8"),
    Stream.runFold("", (a, b) => a + b)
  )

export interface GitOptions {
  readonly cwd?: string
  readonly redactedArgs?: ReadonlyArray<string>
}

export interface CommitConfigChangesParams {
  readonly cwd: string
  readonly message: string
}

export interface CommitPathsIfChangedParams {
  readonly cwd: string
  readonly message: string
  readonly paths: ReadonlyArray<string>
}

export interface EmptyCommitParams {
  readonly cwd: string
  readonly message: string
}

const gitCommandLabel = (args: ReadonlyArray<string>) => `git ${args.join(" ")}`

const gitOutput = (result: GitResult) =>
  result.stderr.trim() || result.stdout.trim() || "unknown error"

const nonZeroExit = (
  args: ReadonlyArray<string>,
  result: GitResult,
  options: GitOptions
): GitCommandFailed => {
  const params = {
    args: options.redactedArgs ?? args,
    exitCode: result.exitCode,
    output: gitOutput(result)
  }

  return new GitCommandFailed(options.cwd === undefined ? params : { ...params, cwd: options.cwd })
}

const makeGitExec =
  (executor: CommandExecutor.CommandExecutor) =>
  (args: ReadonlyArray<string>, options: GitOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = PlatformCommand.make("git", ...args)
        const cmd = options.cwd ? pipe(base, PlatformCommand.workingDirectory(options.cwd)) : base
        const proc = yield* executor.start(cmd)
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
          { concurrency: 3 }
        )
        return { stdout, stderr, exitCode: Number(exitCode) } satisfies GitResult
      })
    )

export class Git extends Effect.Service<Git>()("ingraft/Git", {
  accessors: true,
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor
    return {
      exec: makeGitExec(executor)
    }
  })
}) {}

export const git = (args: ReadonlyArray<string>, options: GitOptions = {}) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) => {
      const cwd = options.cwd ?? runtime.cwd
      const logArgs = options.redactedArgs ?? args
      return Git.exec(args, options).pipe(
        Effect.withSpan("git.exec", {
          attributes: {
            args: logArgs.join(" "),
            cwd
          }
        }),
        Effect.annotateLogs({
          git: gitCommandLabel(logArgs),
          cwd
        })
      )
    })
  )

export const gitChecked = (args: ReadonlyArray<string>, options: GitOptions = {}) =>
  git(args, options).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) => nonZeroExit(args, result, options)
    )
  )

export const repoRoot = RuntimeConfig.pipe(
  Effect.flatMap((runtime) =>
    GitMetadata.findRoot(runtime.cwd).pipe(
      Effect.withSpan("git.findRoot", {
        attributes: {
          cwd: runtime.cwd
        }
      }),
      Effect.annotateLogs({
        git: "isomorphic-git findRoot",
        cwd: runtime.cwd
      }),
      Effect.catchAll(() => Effect.fail(new NotGitRepository()))
    )
  )
)

export const assertCleanTree = (cwd: string) =>
  gitChecked(["status", "--porcelain", "--untracked-files=no"], { cwd }).pipe(
    Effect.filterOrFail(
      (result) => result.stdout.trim() === "",
      () => new DirtyWorkingTree({ cwd })
    ),
    Effect.asVoid
  )

export const detectDefaultBranch = (url: string) =>
  RepositoryHosts.defaultBranch(url).pipe(
    Effect.flatMap((branch) =>
      Option.isSome(branch)
        ? Effect.succeed(branch)
        : git(["ls-remote", "--symref", url, "HEAD"]).pipe(
            Effect.map((result) => {
              if (result.exitCode !== 0) return Option.none<string>()
              const match = result.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)
              return match?.[1] ? Option.some(match[1]) : Option.none<string>()
            })
          )
    )
  )

export const commitConfigChanges = ({ cwd, message }: CommitConfigChangesParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const candidates = [
      ".gitignore",
      ".ignore",
      ".bazelignore",
      ".eslintignore",
      ".eslintrc.json",
      ".markdownlintignore",
      ".moon/workspace.yml",
      ".moon/workspace.yaml",
      ".prettierignore",
      ".oxlintrc.json",
      ".stylelintrc.json",
      ".zed/settings.json",
      ".vscode/settings.json",
      "biome.json",
      "biome.jsonc",
      "cspell.json",
      "cspell.jsonc",
      "cspell.config.json",
      "nx.json",
      "pnpm-workspace.yaml",
      "pyrightconfig.json",
      "stylelint.config.json",
      "turbo.json",
      "turbo.jsonc",
      "AGENTS.md",
      "CLAUDE.md"
    ]
    const toStage = yield* Effect.filter(candidates, (relativePath) =>
      fs
        .exists(`${cwd}/${relativePath}`)
        .pipe(
          Effect.flatMap((exists) =>
            exists
              ? Effect.succeed(true)
              : GitMetadata.pathKnownToGit(cwd, relativePath).pipe(
                  Effect.catchAll(() => Effect.succeed(false))
                )
          )
        )
    )
    if (toStage.length === 0) return
    yield* commitPathsIfChanged({ cwd, paths: toStage, message })
  })

export const commitPathsIfChanged = ({ cwd, message, paths }: CommitPathsIfChangedParams) =>
  Effect.gen(function* () {
    if (paths.length === 0) return false
    yield* git(["add", "--", ...paths], { cwd })
    const diff = yield* git(["diff", "--cached", "--quiet"], { cwd })
    if (diff.exitCode === 0) return false
    yield* gitChecked(["commit", "-m", message], { cwd })
    return true
  })

export const emptyCommit = ({ cwd, message }: EmptyCommitParams) =>
  gitChecked(["commit", "--allow-empty", "-m", message], { cwd }).pipe(Effect.asVoid)
