import * as TOML from "@iarna/toml"
import { Option } from "effect"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseTomlConfig = (text: string): Option.Option<Record<string, unknown>> =>
  Option.liftThrowable((value: string) => TOML.parse(value) as unknown)(text).pipe(
    Option.filter(isRecord)
  )

const valueAtPath = (
  value: Record<string, unknown>,
  path: ReadonlyArray<string>
): unknown =>
  path.reduce<unknown>(
    (current, key) => (isRecord(current) ? current[key] : undefined),
    value
  )

export const tomlHasPath = (
  text: string,
  path: ReadonlyArray<string>
): boolean =>
  Option.match(parseTomlConfig(text), {
    onNone: () => false,
    onSome: (value) => valueAtPath(value, path) !== undefined
  })

export const tomlPathHasArrayValue = (
  text: string,
  path: ReadonlyArray<string>,
  expected: string
): boolean =>
  Option.match(parseTomlConfig(text), {
    onNone: () => false,
    onSome: (value) => {
      const current = valueAtPath(value, path)
      return (
        Array.isArray(current) &&
        current.some((item) => typeof item === "string" && item === expected)
      )
    }
  })

export const tomlPathHasAnyArrayValue = (
  text: string,
  path: ReadonlyArray<string>,
  expected: ReadonlyArray<string>
): boolean => expected.some((item) => tomlPathHasArrayValue(text, path, item))
