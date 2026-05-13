import { Effect } from "effect"

import { RuntimeConfig } from "./runtime.ts"
import type { StyleOptions } from "./styles.ts"
import { renderStatusBadge } from "./ui.ts"

export type StatusKind = "info" | "ok" | "warn" | "error"

export const formatStatus = (
  kind: StatusKind,
  message: string,
  options: StyleOptions = {}
): string => `${renderStatusBadge(kind, options)} ${message}`

export const withCommandTelemetry =
  (command: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(`vendor.${command}`, { attributes: { command } }),
      Effect.withLogSpan(`vendor.${command}`),
      Effect.annotateLogs({ command })
    )

const logStatus = (
  kind: StatusKind,
  message: string,
  log: (message: string) => Effect.Effect<void>
) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) => log(formatStatus(kind, message, { colors: runtime.colors })))
  )

export const info = (message: string) => logStatus("info", message, Effect.logInfo)
export const ok = (message: string) => logStatus("ok", message, Effect.logInfo)
export const warn = (message: string) => logStatus("warn", message, Effect.logWarning)
export const error = (message: string) => logStatus("error", message, Effect.logError)
