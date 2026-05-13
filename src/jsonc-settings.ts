import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  type ParseError
} from "jsonc-parser"

export interface UnchangedSettingsMerge {
  readonly _tag: "Unchanged"
}

export interface UpdatedSettingsMerge {
  readonly _tag: "Updated"
  readonly text: string
}

export interface InvalidSettingsMerge {
  readonly _tag: "Invalid"
  readonly message: string
}

export type SettingsMergeResult =
  | UnchangedSettingsMerge
  | UpdatedSettingsMerge
  | InvalidSettingsMerge

export interface ValidParsedSettings {
  readonly _tag: "Valid"
  readonly value: Record<string, unknown>
  readonly source: string
}

export interface InvalidParsedSettings {
  readonly _tag: "Invalid"
  readonly message: string
  readonly source: string
}

export type ParsedSettings = ValidParsedSettings | InvalidParsedSettings

export interface SettingsMergeState {
  readonly changed: boolean
  readonly settings: Record<string, unknown>
  readonly text: string
}

export interface ParseSettingsParams {
  readonly text: string
  readonly objectName: string
}

export interface EnsureArrayItemParams {
  readonly item: string
  readonly key: string
  readonly state: SettingsMergeState
}

export interface EnsureArrayItemsParams {
  readonly items: ReadonlyArray<string>
  readonly key: string
  readonly state: SettingsMergeState
  readonly fallback?: ReadonlyArray<string>
}

export interface EnsureObjectPropertyParams {
  readonly key: string
  readonly property: string
  readonly state: SettingsMergeState
  readonly value: unknown
  readonly overwrite?: boolean
}

const formatOptions = { insertSpaces: true, tabSize: 2 }

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseSettings = ({
  objectName,
  text
}: ParseSettingsParams): ParsedSettings => {
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
      message: `${objectName} must contain a JSON object.`,
      source
    }
  }
  return { _tag: "Valid" as const, value, source }
}

export const initialSettingsState = (
  source: string,
  settings: Record<string, unknown>
): SettingsMergeState => ({
  changed: false,
  settings: { ...settings },
  text: source
})

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

const updateState = (
  state: SettingsMergeState,
  path: ReadonlyArray<string>,
  value: unknown,
  settings: Record<string, unknown>
): SettingsMergeState => ({
  changed: true,
  settings,
  text: applyJsoncChange(state.text, path, value)
})

export const ensureArrayItem = ({
  item,
  key,
  state
}: EnsureArrayItemParams): SettingsMergeState =>
  ensureArrayItems({ items: [item], key, state })

export const ensureArrayItems = ({
  fallback = [],
  items,
  key,
  state
}: EnsureArrayItemsParams): SettingsMergeState => {
  const current = Array.isArray(state.settings[key])
    ? state.settings[key]
    : [...fallback]
  const missing = items.filter((item) => !current.includes(item))
  if (missing.length === 0) return state

  const value = [...current, ...missing]
  return updateState(state, [key], value, {
    ...state.settings,
    [key]: value
  })
}

export const ensureObjectProperty = ({
  key,
  overwrite = true,
  property,
  state,
  value
}: EnsureObjectPropertyParams): SettingsMergeState => {
  const current = isRecord(state.settings[key]) ? state.settings[key] : {}
  if (!overwrite && Object.hasOwn(current, property)) return state
  if (current[property] === value) return state

  const next = { ...current, [property]: value }
  return isRecord(state.settings[key])
    ? updateState(state, [key, property], value, {
        ...state.settings,
        [key]: next
      })
    : updateState(state, [key], next, {
        ...state.settings,
        [key]: next
      })
}

export const completeMerge = (
  state: SettingsMergeState
): SettingsMergeResult =>
  state.changed ? { _tag: "Updated", text: state.text } : { _tag: "Unchanged" }
