import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import { VENDOR_DIR } from "../domain/constants.ts"
import {
  completeMerge,
  ensureArrayItem,
  ensureObjectProperty,
  initialSettingsState,
  parseSettings,
  type SettingsMergeResult,
  type SettingsMergeState
} from "../config/jsonc-settings.ts"
import { formatStatus } from "../app/log.ts"
import { RuntimeConfig, type RuntimeConfigShape } from "../app/runtime.ts"
import {
  detectProjectLanguages,
  type ProjectLanguageUsage
} from "../project/languages.ts"
import { Git } from "../services/git.ts"

const VENDOR_GLOB = `${VENDOR_DIR}/**`
const MATERIAL_ICON_FOLDER_ASSOCIATIONS =
  "material-icon-theme.folders.associations"
const MATERIAL_ICON_VENDOR_FOLDER = "packages"
const ARRAY_KEYS_BY_LANGUAGE = {
  typescript: "typescript.preferences.autoImportFileExcludePatterns",
  javascript: "javascript.preferences.autoImportFileExcludePatterns"
} as const
const ARRAY_KEYS = Object.values(ARRAY_KEYS_BY_LANGUAGE)

type ArrayExclusionKey = (typeof ARRAY_KEYS)[number]
type VscodeProjectLanguage = keyof typeof ARRAY_KEYS_BY_LANGUAGE

export interface VscodeLanguageUsage {
  readonly javascript: boolean
  readonly typescript: boolean
}

export interface MergeVscodeSettingsOptions {
  readonly languages?: VscodeLanguageUsage
}

interface UpdateVscodeSettingsWithParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly listProjectFiles: (
    cwd: string
  ) => Effect.Effect<ReadonlyArray<string>, unknown>
  readonly path: Path.Path
  readonly runtime: RuntimeConfigShape
}

interface DetectVscodeLanguageUsageParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly listProjectFiles: (
    cwd: string
  ) => Effect.Effect<ReadonlyArray<string>, unknown>
  readonly path: Path.Path
}

const DEFAULT_LANGUAGE_USAGE = {
  javascript: true,
  typescript: true
} as const satisfies VscodeLanguageUsage

const warnWithRuntime = (runtime: RuntimeConfigShape, message: string) =>
  Effect.logWarning(formatStatus("warn", message, { colors: runtime.colors }))

const emptyLanguageUsage = (): VscodeLanguageUsage => ({
  javascript: false,
  typescript: false
})

const selectedArrayKeys = (
  languages: VscodeLanguageUsage
): ReadonlyArray<ArrayExclusionKey> =>
  (Object.keys(ARRAY_KEYS_BY_LANGUAGE) as ReadonlyArray<VscodeProjectLanguage>)
    .filter((language) => languages[language])
    .map((language) => ARRAY_KEYS_BY_LANGUAGE[language])

const ensureArrayExclusion = (
  state: SettingsMergeState,
  key: ArrayExclusionKey
): SettingsMergeState => ensureArrayItem({ item: VENDOR_GLOB, key, state })

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
  value: Record<string, unknown>,
  languages: VscodeLanguageUsage
): SettingsMergeState =>
  ensureVendorFolderIcon(
    selectedArrayKeys(languages).reduce(
      ensureArrayExclusion,
      initialSettingsState(source, value)
    )
  )

export const mergeVscodeSettingsText = (
  text = "{}\n",
  options: MergeVscodeSettingsOptions = {}
): SettingsMergeResult => {
  const parsed = parseSettings({
    objectName: ".vscode/settings.json",
    text
  })
  if (parsed._tag === "Invalid") {
    return { _tag: "Invalid", message: parsed.message }
  }

  return completeMerge(
    mergeValidSettings(
      parsed.source,
      parsed.value,
      options.languages ?? DEFAULT_LANGUAGE_USAGE
    )
  )
}

const detectVscodeLanguageUsage = ({
  cwd,
  fs,
  listProjectFiles,
  path
}: DetectVscodeLanguageUsageParams) =>
  detectProjectLanguages({ cwd, fs, listProjectFiles, path }).pipe(
    Effect.map(
      (languages: ProjectLanguageUsage) =>
        ({
          javascript: languages.javascript,
          typescript: languages.typescript
        }) satisfies VscodeLanguageUsage
    )
  )

const gitProjectFiles =
  (gitService: Git) =>
  (cwd: string): Effect.Effect<ReadonlyArray<string>, unknown> =>
    gitService.exec(
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd }
    ).pipe(
      Effect.map((result) =>
        result.exitCode === 0
          ? result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0)
          : []
      )
    )

const updateVscodeSettingsWith = ({
  cwd,
  fs,
  listProjectFiles,
  path,
  runtime
}: UpdateVscodeSettingsWithParams) =>
  Effect.gen(function* () {
    const target = path.resolve(cwd, ".vscode/settings.json")
    const current = (yield* fs.exists(target))
      ? yield* fs.readFileString(target)
      : "{}\n"

    const languages = yield* detectVscodeLanguageUsage({
      cwd,
      fs,
      listProjectFiles,
      path
    })
    const merged = mergeVscodeSettingsText(current, { languages })
    switch (merged._tag) {
      case "Invalid":
        yield* warnWithRuntime(
          runtime,
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

export class VscodeSettings extends Effect.Service<VscodeSettings>()(
  "vendor-subtree/VscodeSettings",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const gitService = yield* Git
      const path = yield* Path.Path
      const runtime = yield* RuntimeConfig
      return {
        refresh: (cwd: string) =>
          updateVscodeSettingsWith({
            cwd,
            fs,
            listProjectFiles: gitProjectFiles(gitService),
            path,
            runtime
          })
      }
    })
  }
) {}
