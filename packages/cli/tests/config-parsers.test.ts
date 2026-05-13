import { describe, expect, test } from "bun:test"
import { Option } from "effect"
import {
  packageJsonHasDependency,
  packageJsonDependencySpec
} from "../src/config/package-json.ts"
import { jsObjectHasArrayValue } from "../src/config/javascript-source.ts"
import { tomlHasPath, tomlPathHasArrayValue } from "../src/config/toml.ts"
import { tsObjectHasArrayValue } from "../src/config/typescript-source.ts"
import { yamlHasPath } from "../src/config/yaml.ts"

describe("non-destructive config parsers", () => {
  test("reads package.json dependency sections with JSONC-compatible parsing", () => {
    const text = `{
      // package managers do not write comments, but humans often do
      "dependencies": {
        "effect": "^3.21.2",
      },
      "devDependencies": {
        "typescript": "^6.0.3",
      },
    }`

    expect(packageJsonHasDependency(text, ["typescript"])).toBe(true)
    expect(Option.getOrUndefined(packageJsonDependencySpec(text, "effect"))).toBe(
      "^3.21.2"
    )
  })

  test("reads TOML sections and array values without string matching", () => {
    const text = `
      [tool.ruff]
      exclude = ["vendor", ".venv"]
    `

    expect(tomlHasPath(text, ["tool", "ruff"])).toBe(true)
    expect(tomlPathHasArrayValue(text, ["tool", "ruff", "exclude"], "vendor")).toBe(
      true
    )
  })

  test("reads YAML documents through the document parser", () => {
    const text = `
      # prettier config
      plugins:
        - prettier-plugin-tailwindcss
    `

    expect(yamlHasPath(text, ["plugins"])).toBe(true)
  })

  test("uses ts-morph for TypeScript config source detection", () => {
    const text = `
      export default {
        ignorePatterns: ["vendor/**"]
      }
    `

    expect(tsObjectHasArrayValue(text, "ignorePatterns", "vendor/**")).toBe(true)
  })

  test("uses jscodeshift for JavaScript config source detection", () => {
    const text = `
      module.exports = {
        ignorePatterns: ["vendor/**"]
      }
    `

    expect(jsObjectHasArrayValue(text, "ignorePatterns", "vendor/**")).toBe(true)
  })
})
