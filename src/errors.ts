import { Data, Effect } from "effect"
import { style, type StyleOptions } from "./styles.ts"

export class CliError extends Data.TaggedError("CliError")<{
  readonly title: string
  readonly detail?: string
  readonly hint?: string
  readonly code: number
  readonly message?: string
}> {}

export type CliErrorInput =
  | string
  | {
      readonly title: string
      readonly detail?: string
      readonly hint?: string
    }

const normalizeCliError = (input: CliErrorInput, code: number) =>
  typeof input === "string"
    ? { title: input, message: input, code }
    : { ...input, message: input.title, code }

export const formatCliError = (
  cause: CliError,
  options: StyleOptions = {}
): string => {
  const lines = [
    `${style.red("Error:", options)} ${style.bold(
      cause.title ?? cause.message ?? "Command failed",
      options
    )}`
  ]
  if (cause.detail) lines.push(cause.detail)
  if (cause.hint) lines.push(`${style.yellow("Hint:", options)} ${cause.hint}`)
  return lines.join("\n")
}

export const die = (input: CliErrorInput, code = 1) =>
  Effect.fail(new CliError(normalizeCliError(input, code)))
