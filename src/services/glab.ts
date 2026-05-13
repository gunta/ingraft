import { Command as PlatformCommand, CommandExecutor } from "@effect/platform"
import { Effect, Stream, pipe } from "effect"
import { RuntimeConfig } from "./runtime.ts"

export interface GitLabCliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface GitLabCliOptions {
  readonly cwd?: string
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(Stream.decodeText("utf-8"), Stream.runFold("", (a, b) => a + b))

const makeGitLabCliExec =
  (executor: CommandExecutor.CommandExecutor) =>
  (args: ReadonlyArray<string>, options: GitLabCliOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = PlatformCommand.make("glab", ...args)
        const cmd = options.cwd
          ? pipe(base, PlatformCommand.workingDirectory(options.cwd))
          : base
        const proc = yield* executor.start(cmd)
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
          { concurrency: 3 }
        )
        return {
          stdout,
          stderr,
          exitCode: Number(exitCode)
        } satisfies GitLabCliResult
      })
    )

export class GitLabCli extends Effect.Service<GitLabCli>()(
  "vendor-subtree/GitLabCli",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const executor = yield* CommandExecutor.CommandExecutor
      return {
        exec: makeGitLabCliExec(executor)
      }
    })
  }
) {}

export const glab = (
  args: ReadonlyArray<string>,
  options: GitLabCliOptions = {}
) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) => {
      const cwd = options.cwd ?? runtime.cwd
      return GitLabCli.exec(args, options).pipe(
        Effect.withSpan("glab.exec", {
          attributes: {
            args: args.join(" "),
            cwd
          }
        }),
        Effect.annotateLogs({
          glab: `glab ${args.join(" ")}`,
          cwd
        })
      )
    })
  )
