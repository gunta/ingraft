import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import { VENDOR_DIR } from "./constants.ts"
import {
  completeMerge,
  ensureArrayItems,
  initialSettingsState,
  parseSettings,
  type SettingsMergeResult,
  type SettingsMergeState
} from "./jsonc-settings.ts"
import { warn } from "./log.ts"

export const EDITOR_IGNORE_BEGIN =
  "# vendor-subtree-skill: editor-ignore begin"
export const EDITOR_IGNORE_END = "# vendor-subtree-skill: editor-ignore end"

const VENDOR_IGNORE = `/${VENDOR_DIR}/`
const VENDOR_GLOB = `${VENDOR_DIR}/**`
const ZED_FILE_SCAN_EXCLUSIONS = "file_scan_exclusions"
const ZED_DEFAULT_SCAN_EXCLUSIONS = [
  "**/.git",
  "**/.svn",
  "**/.hg",
  "**/.jj",
  "**/CVS",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/.classpath",
  "**/.settings"
] as const

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const trimTrailingBlankLines = (content: string): string =>
  content.replace(/\n+$/g, "")

const sectionRegex = new RegExp(
  `(?:^|\\n)${escapeRegex(EDITOR_IGNORE_BEGIN)}[\\s\\S]*?${escapeRegex(
    EDITOR_IGNORE_END
  )}\\n?`
)

const renderEditorIgnoreSection = (): string =>
  [
    EDITOR_IGNORE_BEGIN,
    "# Used by ripgrep-backed editors and pickers.",
    VENDOR_IGNORE,
    EDITOR_IGNORE_END
  ].join("\n")

export const mergeEditorIgnoreText = (content: string): string => {
  const normalized = trimTrailingBlankLines(content)
  const section = renderEditorIgnoreSection()
  const next = sectionRegex.test(normalized)
    ? normalized.replace(sectionRegex, `\n${section}`)
    : [normalized, section].filter((part) => part.length > 0).join("\n\n")

  return `${trimTrailingBlankLines(next)}\n`
}

const ensureZedVendorExclusion = (
  state: SettingsMergeState
): SettingsMergeState =>
  ensureArrayItems({
    fallback: ZED_DEFAULT_SCAN_EXCLUSIONS,
    items: [VENDOR_GLOB],
    key: ZED_FILE_SCAN_EXCLUSIONS,
    state
  })

const mergeValidZedSettings = (
  source: string,
  value: Record<string, unknown>
): SettingsMergeState =>
  ensureZedVendorExclusion(initialSettingsState(source, value))

export const mergeZedSettingsText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({
    objectName: ".zed/settings.json",
    text
  })
  if (parsed._tag === "Invalid") {
    return { _tag: "Invalid", message: parsed.message }
  }

  return completeMerge(mergeValidZedSettings(parsed.source, parsed.value))
}

export const updateZedSettings = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(cwd, ".zed/settings.json")
    const current = (yield* fs.exists(target))
      ? yield* fs.readFileString(target)
      : "{}\n"

    const merged = mergeZedSettingsText(current)
    switch (merged._tag) {
      case "Invalid":
        yield* warn(
          `Could not parse .zed/settings.json (${merged.message}); skipping update.`
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

export const updateEditorIgnore = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(cwd, ".ignore")
    const current = (yield* fs.exists(target))
      ? yield* fs.readFileString(target)
      : ""
    const next = mergeEditorIgnoreText(current)

    if (next === current) return Option.none<string>()
    yield* fs.writeFileString(target, next)
    return Option.some(target)
  })
