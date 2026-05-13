import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import { VENDOR_DIR } from "./constants.ts"
import {
  completeMerge,
  ensureArrayItem,
  ensureObjectProperty,
  initialSettingsState,
  parseSettings,
  type SettingsMergeResult,
  type SettingsMergeState
} from "./jsonc-settings.ts"
import { warn } from "./log.ts"

const VENDOR_GLOB = `${VENDOR_DIR}/**`
const MATERIAL_ICON_FOLDER_ASSOCIATIONS =
  "material-icon-theme.folders.associations"
const MATERIAL_ICON_VENDOR_FOLDER = "packages"
const ARRAY_KEYS = [
  "typescript.preferences.autoImportFileExcludePatterns",
  "javascript.preferences.autoImportFileExcludePatterns"
] as const
const OBJECT_KEYS = ["files.exclude", "files.watcherExclude", "search.exclude"] as const

type ArrayExclusionKey = (typeof ARRAY_KEYS)[number]
type ObjectExclusionKey = (typeof OBJECT_KEYS)[number]

const ensureArrayExclusion = (
  state: SettingsMergeState,
  key: ArrayExclusionKey
): SettingsMergeState => ensureArrayItem({ item: VENDOR_GLOB, key, state })

const ensureObjectExclusion = (
  state: SettingsMergeState,
  key: ObjectExclusionKey
): SettingsMergeState =>
  ensureObjectProperty({
    key,
    property: VENDOR_GLOB,
    state,
    value: true
  })

const ensureVendorFolderIcon = (
  state: SettingsMergeState
): SettingsMergeState =>
  ensureObjectProperty({
    key: MATERIAL_ICON_FOLDER_ASSOCIATIONS,
    overwrite: false,
    property: VENDOR_DIR,
    state,
    value: MATERIAL_ICON_VENDOR_FOLDER
  })

const mergeValidSettings = (
  source: string,
  value: Record<string, unknown>
): SettingsMergeState =>
  ensureVendorFolderIcon(
    OBJECT_KEYS.reduce(
      ensureObjectExclusion,
      ARRAY_KEYS.reduce(
        ensureArrayExclusion,
        initialSettingsState(source, value)
      )
    )
  )

export const mergeVscodeSettingsText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({
    objectName: ".vscode/settings.json",
    text
  })
  if (parsed._tag === "Invalid") {
    return { _tag: "Invalid", message: parsed.message }
  }

  return completeMerge(mergeValidSettings(parsed.source, parsed.value))
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
        yield* warn(
          `Could not parse .vscode/settings.json (${merged.message}); skipping update.`
        )
        return Option.none<string>()
      case "Unchanged":
        return Option.none<string>()
      case "Updated":
        yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(
          Effect.ignore
        )
        yield* fs.writeFileString(
          target,
          merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
        )
        return Option.some(target)
    }
  })
