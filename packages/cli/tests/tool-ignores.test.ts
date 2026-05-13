import { describe, expect, test } from "bun:test"
import { mergeBiomeConfigText } from "../src/tool-ignores/biome.ts"
import { mergeCspellConfigText } from "../src/tool-ignores/cspell.ts"
import {
  mergeEslintConfigText,
  mergeEslintIgnoreText
} from "../src/tool-ignores/eslint.ts"
import { mergeMarkdownlintIgnoreText } from "../src/tool-ignores/markdownlint.ts"
import { mergeOxlintConfigText } from "../src/tool-ignores/oxlint.ts"
import { mergePyrightConfigText } from "../src/tool-ignores/pyright.ts"
import { mergeStylelintConfigText } from "../src/tool-ignores/stylelint.ts"

describe("tool ignore config mergers", () => {
  test("adds a Biome vendor exclusion without hiding files from agents", () => {
    const result = mergeBiomeConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"files"')
      expect(result.text).toContain('"includes"')
      expect(result.text).toContain('"**"')
      expect(result.text).toContain('"!vendor/**"')
    }
  })

  test("adds Oxlint ignorePatterns", () => {
    const result = mergeOxlintConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignorePatterns"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("adds ESLint ignorePatterns for JSON configs", () => {
    const result = mergeEslintConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignorePatterns"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("adds managed ignore-file sections for legacy ignore files", () => {
    expect(mergeEslintIgnoreText("dist/\n")).toContain("vendor/")
    expect(mergeMarkdownlintIgnoreText("docs/generated/\n")).toContain("vendor/")
  })

  test("adds CSpell ignorePaths", () => {
    const result = mergeCspellConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignorePaths"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("adds Pyright exclude entries", () => {
    const result = mergePyrightConfigText('{"exclude":[".venv"]}\n')

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('".venv"')
      expect(result.text).toContain('"vendor"')
    }
  })

  test("adds Stylelint ignoreFiles entries", () => {
    const result = mergeStylelintConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignoreFiles"')
      expect(result.text).toContain('"vendor/**"')
    }
  })
})
