import { Effect, Option } from "effect"
import { ok } from "./log.ts"

export const relativeTo = (root: string, path: string): string =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path

export const reportWritten = (cwd: string, paths: ReadonlyArray<string>) =>
  Effect.forEach(paths, (path) => ok(`Updated ${relativeTo(cwd, path)}`), {
    discard: true
  })

export const reportOptionalPath = (cwd: string, path: Option.Option<string>) =>
  Option.match(path, {
    onNone: () => Effect.void,
    onSome: (value) => ok(`Updated ${relativeTo(cwd, value)}`)
  })
