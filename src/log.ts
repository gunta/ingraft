import { Effect } from "effect"

export const info = (message: string) => Effect.logInfo(message)
export const ok = (message: string) => Effect.logInfo(`✓ ${message}`)
export const warn = (message: string) => Effect.logWarning(message)
export const error = (message: string) => Effect.logError(message)
