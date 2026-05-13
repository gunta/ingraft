import { Effect } from "effect"

import { InkRenderFailed } from "../domain/errors.ts"
import { StatusLine, type StatusKind } from "./ink/components.tsx"
import { renderInkOnce } from "./ink/render.tsx"

export type { StatusKind }

export const withCommandTelemetry =
  (command: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(`vendor.${command}`, { attributes: { command } }),
      Effect.withLogSpan(`vendor.${command}`),
      Effect.annotateLogs({ command })
    )

const logStatus = (kind: StatusKind, label: string) =>
  Effect.tryPromise({
    try: () => renderInkOnce(<StatusLine kind={kind} label={label} />),
    catch: (cause) => new InkRenderFailed({ view: "StatusLine", cause })
  })

export const info = (message: string) => logStatus("info", message)
export const ok = (message: string) => logStatus("success", message)
export const warn = (message: string) => logStatus("warning", message)
export const error = (message: string) => logStatus("error", message)
