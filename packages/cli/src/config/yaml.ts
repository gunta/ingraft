import { parseDocument } from "yaml"
import { Option } from "effect"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseYamlConfig = (text: string): Option.Option<Record<string, unknown>> =>
  Option.liftThrowable((value: string) => {
    const document = parseDocument(value)
    if (document.errors.length > 0) return undefined
    return document.toJS() as unknown
  })(text).pipe(Option.filter(isRecord))

const valueAtPath = (
  value: Record<string, unknown>,
  path: ReadonlyArray<string>
): unknown =>
  path.reduce<unknown>(
    (current, key) => (isRecord(current) ? current[key] : undefined),
    value
  )

export const yamlHasPath = (
  text: string,
  path: ReadonlyArray<string>
): boolean =>
  Option.match(parseYamlConfig(text), {
    onNone: () => false,
    onSome: (value) => valueAtPath(value, path) !== undefined
  })
