import { parse, type ParseError } from "jsonc-parser"
import { Option } from "effect"

export interface PackageJsonShape {
  readonly dependencies?: Record<string, unknown>
  readonly devDependencies?: Record<string, unknown>
  readonly optionalDependencies?: Record<string, unknown>
  readonly peerDependencies?: Record<string, unknown>
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parsePackageJsonShape = (text: string): PackageJsonShape => {
  const errors: ParseError[] = []
  const value = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false
  })
  return errors.length === 0 && isRecord(value) ? value : {}
}

export const packageJsonDependencySpec = (
  text: string,
  packageName: string
): Option.Option<string> => {
  const pkg = parsePackageJsonShape(text)
  for (const section of dependencySections) {
    const dependencies = pkg[section]
    if (!isRecord(dependencies)) continue
    const spec = dependencies[packageName]
    if (typeof spec === "string" && spec.trim().length > 0) {
      return Option.some(spec.trim())
    }
  }
  return Option.none()
}

export const packageJsonHasDependency = (
  text: string,
  names: ReadonlyArray<string>
): boolean => names.some((name) => Option.isSome(packageJsonDependencySpec(text, name)))
