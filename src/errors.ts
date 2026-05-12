import { Data, Effect } from "effect"

export class CliError extends Data.TaggedError("CliError")<{
  readonly message: string
  readonly code: number
}> {}

export const die = (message: string, code = 1) =>
  Effect.fail(new CliError({ message, code }))
