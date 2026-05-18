import { Effect, Schema } from "effect"

import { git } from "../services/git.ts"
import { GitHubCli } from "../services/gh.ts"

export type ForkMode = "personal" | "contribute"

const FORK_MODE_CONFIG_KEY = "ingraft.forkMode"

export interface ReadForkModeParams {
  readonly cwd: string
}

export interface WriteForkModeParams {
  readonly cwd: string
  readonly mode: ForkMode
}

export interface ClearForkModeParams {
  readonly cwd: string
}

const parseForkMode = (value: string): ForkMode | undefined => {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "personal" || trimmed === "contribute") return trimmed
  return undefined
}

export const readForkMode = ({ cwd }: ReadForkModeParams) =>
  git(["config", "--get", FORK_MODE_CONFIG_KEY], { cwd }).pipe(
    Effect.map((result) =>
      result.exitCode === 0 ? parseForkMode(result.stdout) : undefined
    ),
    Effect.catch(() => Effect.succeed(undefined))
  )

export const writeForkMode = ({ cwd, mode }: WriteForkModeParams) =>
  git(["config", FORK_MODE_CONFIG_KEY, mode], { cwd }).pipe(Effect.asVoid)

export const clearForkMode = ({ cwd }: ClearForkModeParams) =>
  git(["config", "--unset", FORK_MODE_CONFIG_KEY], { cwd }).pipe(Effect.asVoid)

// ---------------------------------------------------------------------------
// Fork detection
// ---------------------------------------------------------------------------

const GhRepoViewSchema = Schema.Struct({
  isFork: Schema.Boolean,
  parent: Schema.NullOr(
    Schema.Struct({
      nameWithOwner: Schema.String
    })
  )
})

export interface DetectForkResult {
  readonly isFork: boolean
  readonly parentNameWithOwner?: string
  readonly source: "gh" | "remotes" | "none"
}

export interface DetectForkParams {
  readonly cwd: string
}

const detectForkViaGh = ({ cwd }: DetectForkParams) =>
  Effect.gen(function* () {
    const cli = yield* GitHubCli
    const result = yield* cli.exec(["repo", "view", "--json", "isFork,parent"], { cwd })
    if (result.exitCode !== 0) return undefined
    try {
      const parsed = Schema.decodeUnknownSync(GhRepoViewSchema)(JSON.parse(result.stdout))
      return {
        isFork: parsed.isFork,
        source: "gh" as const,
        ...(parsed.parent === null ? {} : { parentNameWithOwner: parsed.parent.nameWithOwner })
      } satisfies DetectForkResult
    } catch {
      return undefined
    }
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))

const detectForkViaRemotes = ({ cwd }: DetectForkParams) =>
  git(["remote", "get-url", "upstream"], { cwd }).pipe(
    Effect.map((result) =>
      result.exitCode === 0 && result.stdout.trim().length > 0
        ? ({
            isFork: true,
            source: "remotes" as const
          } satisfies DetectForkResult)
        : undefined
    ),
    Effect.catch(() => Effect.succeed(undefined))
  )

export const detectFork = (params: DetectForkParams) =>
  Effect.gen(function* () {
    const viaGh = yield* detectForkViaGh(params)
    if (viaGh !== undefined) return viaGh
    const viaRemotes = yield* detectForkViaRemotes(params)
    if (viaRemotes !== undefined) return viaRemotes
    return { isFork: false, source: "none" as const } satisfies DetectForkResult
  })
