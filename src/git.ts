import {
  Command as PlatformCommand,
  CommandExecutor,
  FileSystem
} from "@effect/platform"
import { Effect, Option, Stream, pipe } from "effect"
import { die } from "./errors.ts"

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(Stream.decodeText("utf-8"), Stream.runFold("", (a, b) => a + b))

export interface GitOptions {
  readonly cwd?: string
}

const gitCommandLabel = (args: ReadonlyArray<string>) => `git ${args.join(" ")}`

const gitOutput = (result: GitResult) =>
  result.stderr.trim() || result.stdout.trim() || "unknown error"

const makeGitExec =
  (executor: CommandExecutor.CommandExecutor) =>
  (args: ReadonlyArray<string>, options: GitOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = PlatformCommand.make("git", ...args)
        const cmd = options.cwd
          ? pipe(base, PlatformCommand.workingDirectory(options.cwd))
          : base
        const proc = yield* executor.start(cmd)
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
          { concurrency: 3 }
        )
        return { stdout, stderr, exitCode: Number(exitCode) } satisfies GitResult
      })
    )

export class Git extends Effect.Service<Git>()("vendor-subtree/Git", {
  accessors: true,
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor
    return {
      exec: makeGitExec(executor)
    }
  })
}) {}

export const git = (args: ReadonlyArray<string>, options: GitOptions = {}) =>
  Git.exec(args, options).pipe(
    Effect.withSpan("git.exec", {
      attributes: {
        args: args.join(" "),
        cwd: options.cwd ?? process.cwd()
      }
    }),
    Effect.annotateLogs({
      git: gitCommandLabel(args),
      cwd: options.cwd ?? process.cwd()
    })
  )

export const gitChecked = (
  args: ReadonlyArray<string>,
  options: GitOptions = {}
) =>
  git(args, options).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result)
        : die(
            {
              title: "Git command failed",
              detail: `${gitCommandLabel(args)} exited with ${result.exitCode}\n${gitOutput(result)}`,
              hint: options.cwd
                ? `Run this from ${options.cwd} after checking the working tree.`
                : "Run the git command manually for the full git output."
            },
            3
          )
    )
  )

export const repoRoot = Effect.gen(function* () {
  const result = yield* git(["rev-parse", "--show-toplevel"])
  if (result.exitCode !== 0) {
    return yield* die(
      {
        title: "Not inside a git repository",
        detail:
          "The vendor-subtree command must run from a project that already has a git repository.",
        hint: "Run this from your project root, or run `git init` first."
      },
      5
    )
  }
  return result.stdout.trim()
})

export const assertCleanTree = (cwd: string) =>
  Effect.gen(function* () {
    const result = yield* gitChecked(
      ["status", "--porcelain", "--untracked-files=no"],
      { cwd }
    )
    if (result.stdout.trim() !== "") {
      return yield* die(
        {
          title: "Working tree has uncommitted changes",
          detail:
            "git subtree refuses to run on dirty trees, and this command only ignores untracked files.",
          hint: "Commit or stash tracked changes before running subtree operations."
        },
        4
      )
    }
  })

export const detectDefaultBranch = (url: string) =>
  Effect.gen(function* () {
    const result = yield* git(["ls-remote", "--symref", url, "HEAD"])
    if (result.exitCode !== 0) return Option.none<string>()
    const match = result.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)
    return match?.[1] ? Option.some(match[1]) : Option.none<string>()
  })

export const commitConfigChanges = (cwd: string, message: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const candidates = [".vscode/settings.json", "AGENTS.md", "CLAUDE.md"]
    const toStage: string[] = []
    for (const relativePath of candidates) {
      if (yield* fs.exists(`${cwd}/${relativePath}`)) toStage.push(relativePath)
    }
    if (toStage.length === 0) return
    yield* git(["add", "--", ...toStage], { cwd })
    const diff = yield* git(["diff", "--cached", "--quiet"], { cwd })
    if (diff.exitCode === 0) return
    yield* git(["commit", "-m", message], { cwd })
  })
