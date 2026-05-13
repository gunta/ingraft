import { Command as PlatformCommand, CommandExecutor } from "@effect/platform"
import { Effect, Option, Stream, pipe } from "effect"

import { RuntimeConfig } from "../app/runtime.ts"
import { githubRepoFromInput, type GitHubRepository } from "../domain/repo.ts"

export interface GitHubCliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface GitHubCliOptions {
  readonly cwd?: string
}

export interface GitHubCloneParams {
  readonly cwd: string
  readonly repo: GitHubRepository
  readonly target: string
}

export interface GitHubCloneFromInputParams {
  readonly cwd: string
  readonly input: string
  readonly target: string
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText("utf-8"),
    Stream.runFold("", (a, b) => a + b)
  )

const makeGitHubCliExec =
  (executor: CommandExecutor.CommandExecutor) =>
  (args: ReadonlyArray<string>, options: GitHubCliOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = PlatformCommand.make("gh", ...args)
        const cmd = options.cwd ? pipe(base, PlatformCommand.workingDirectory(options.cwd)) : base
        const proc = yield* executor.start(cmd)
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
          { concurrency: 3 }
        )
        return {
          stdout,
          stderr,
          exitCode: Number(exitCode)
        } satisfies GitHubCliResult
      })
    )

export class GitHubCli extends Effect.Service<GitHubCli>()("ingraft/GitHubCli", {
  accessors: true,
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor
    return {
      exec: makeGitHubCliExec(executor)
    }
  })
}) {}

export const gh = (args: ReadonlyArray<string>, options: GitHubCliOptions = {}) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) => {
      const cwd = options.cwd ?? runtime.cwd
      return GitHubCli.exec(args, options).pipe(
        Effect.withSpan("gh.exec", {
          attributes: {
            args: args.join(" "),
            cwd
          }
        }),
        Effect.annotateLogs({
          gh: `gh ${args.join(" ")}`,
          cwd
        })
      )
    })
  )

export const ghDefaultBranch = (repo: GitHubRepository) =>
  gh([
    "repo",
    "view",
    repo.nameWithOwner,
    "--json",
    "defaultBranchRef",
    "--jq",
    ".defaultBranchRef.name"
  ]).pipe(
    Effect.map((result) => {
      const branch = result.stdout.trim()
      return result.exitCode === 0 && branch.length > 0
        ? Option.some(branch)
        : Option.none<string>()
    })
  )

export const ghDefaultBranchFromInput = (input: string) =>
  Option.fromNullable(githubRepoFromInput(input)).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: ghDefaultBranch
    })
  )

export const ghRepoClone = ({ cwd, repo, target }: GitHubCloneParams) =>
  gh(["repo", "clone", repo.nameWithOwner, target], { cwd })

export const ghRepoCloneFromInput = ({ cwd, input, target }: GitHubCloneFromInputParams) =>
  Option.fromNullable(githubRepoFromInput(input)).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none<GitHubCliResult>()),
      onSome: (repo) => ghRepoClone({ cwd, repo, target }).pipe(Effect.map(Option.some))
    })
  )
