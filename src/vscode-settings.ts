import { FileSystem, Path } from "@effect/platform"
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  type ParseError
} from "jsonc-parser"
import { Effect, Option } from "effect"
import { VENDOR_DIR } from "./constants.ts"
import { warn } from "./log.ts"

const VENDOR_GLOB = `${VENDOR_DIR}/**`
const ARRAY_KEYS = [
  "typescript.preferences.autoImportFileExcludePatterns",
  "javascript.preferences.autoImportFileExcludePatterns"
] as const
const OBJECT_KEYS = ["files.exclude", "files.watcherExclude", "search.exclude"] as const

export type SettingsMergeResult =
  | { readonly _tag: "Unchanged" }
  | { readonly _tag: "Updated"; readonly text: string }
  | { readonly _tag: "Invalid"; readonly message: string }

const formatOptions = { insertSpaces: true, tabSize: 2 }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseSettings = (text: string) => {
  const errors: ParseError[] = []
  const source = text.trim() === "" ? "{}\n" : text
  const value = parse(source, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    const message = errors
      .map((error) => printParseErrorCode(error.error))
      .join(", ")
    return { _tag: "Invalid" as const, message, source }
  }
  if (!isRecord(value)) {
    return {
      _tag: "Invalid" as const,
      message: ".vscode/settings.json must contain a JSON object.",
      source
    }
  }
  return { _tag: "Valid" as const, value, source }
}

const applyJsoncChange = (
  source: string,
  path: ReadonlyArray<string>,
  value: unknown
) =>
  applyEdits(
    source,
    modify(source, [...path], value, {
      formattingOptions: formatOptions
    })
  )

export const mergeVscodeSettingsText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings(text)
  if (parsed._tag === "Invalid") {
    return { _tag: "Invalid", message: parsed.message }
  }

  let next = parsed.source
  let changed = false
  const settings = { ...parsed.value }

  for (const key of ARRAY_KEYS) {
    const current = Array.isArray(settings[key]) ? settings[key] : []
    if (!current.includes(VENDOR_GLOB)) {
      const value = [...current, VENDOR_GLOB]
      next = applyJsoncChange(next, [key], value)
      settings[key] = value
      changed = true
    }
  }

  for (const key of OBJECT_KEYS) {
    const current = isRecord(settings[key]) ? settings[key] : {}
    if (current[VENDOR_GLOB] !== true) {
      if (isRecord(settings[key])) {
        next = applyJsoncChange(next, [key, VENDOR_GLOB], true)
        settings[key] = { ...current, [VENDOR_GLOB]: true }
      } else {
        const value = { [VENDOR_GLOB]: true }
        next = applyJsoncChange(next, [key], value)
        settings[key] = value
      }
      changed = true
    }
  }

  return changed ? { _tag: "Updated", text: next } : { _tag: "Unchanged" }
}

export const updateVscodeSettings = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(cwd, ".vscode/settings.json")
    const current = (yield* fs.exists(target))
      ? yield* fs.readFileString(target)
      : "{}\n"

    const merged = mergeVscodeSettingsText(current)
    switch (merged._tag) {
      case "Invalid":
        yield* warn(`Could not parse .vscode/settings.json (${merged.message}); skipping update.`)
        return Option.none<string>()
      case "Unchanged":
        return Option.none<string>()
      case "Updated":
        yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.ignore)
        yield* fs.writeFileString(target, merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`)
        return Option.some(target)
    }
  })
