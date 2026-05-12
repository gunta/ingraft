import { Effect } from "effect"
import { style, type StyleOptions } from "./styles.ts"

export type StatusKind = "info" | "ok" | "warn" | "error"

const statusPrefix = (
  kind: StatusKind,
  options: StyleOptions = {}
): string => {
  switch (kind) {
    case "info":
      return style.cyan("i", options)
    case "ok":
      return style.green("✓", options)
    case "warn":
      return style.yellow("!", options)
    case "error":
      return style.red("x", options)
  }
}

export const formatStatus = (
  kind: StatusKind,
  message: string,
  options: StyleOptions = {}
): string => `${statusPrefix(kind, options)} ${message}`

export const withCommandTelemetry =
  (command: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(`vendor.${command}`, { attributes: { command } }),
      Effect.withLogSpan(`vendor.${command}`),
      Effect.annotateLogs({ command })
    )

export const info = (message: string) =>
  Effect.logInfo(formatStatus("info", message))
export const ok = (message: string) => Effect.logInfo(formatStatus("ok", message))
export const warn = (message: string) =>
  Effect.logWarning(formatStatus("warn", message))
export const error = (message: string) =>
  Effect.logError(formatStatus("error", message))
