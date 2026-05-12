import { Command as PlatformCommand, FileSystem } from "@effect/platform"
import { Effect, Option, Stream, pipe } from "effect"
import { die } from "./errors.ts"

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(Stream.decodeText("utf-8"), Stream.runFold("", (a, b) => a + b))

export const git = (
  args: ReadonlyArray<string>,
  options: { readonly cwd?: string } = {}
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const base = PlatformCommand.make("git", ...args)
      const cmd = options.cwd
        ? pipe(base, PlatformCommand.workingDirectory(options.cwd))
        : base
      const proc = yield* PlatformCommand.start(cmd)
      const [exitCode, stdout, stderr] = yield* Effect.all(
        [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
        { concurrency: 3 }
      )
      return { stdout, stderr, exitCode } satisfies GitResult
    })
  )

export const gitChecked = (
  args: ReadonlyArray<string>,
  options: { readonly cwd?: string } = {}
) =>
  git(args, options).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result)
        : die(
            `git ${args.join(" ")} failed (exit ${result.exitCode})\n${
              result.stderr.trim() || result.stdout.trim() || "unknown error"
            }`,
            3
          )
    )
  )

export const repoRoot = Effect.gen(function* () {
  const result = yield* git(["rev-parse", "--show-toplevel"])
  if (result.exitCode !== 0) {
    return yield* die(
      "Not inside a git repository. Run this from your project root, or run `git init` first.",
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
        "Working tree has uncommitted changes. Commit or stash them before running\n" +
          "subtree operations (git refuses to subtree on dirty trees).",
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
