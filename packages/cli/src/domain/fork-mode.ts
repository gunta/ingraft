import { Effect } from "effect"

import { git } from "../services/git.ts"

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
