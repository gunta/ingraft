import { describe, expect, test } from "bun:test"
import { mergeVscodeSettingsText } from "../src/vscode-settings.ts"

describe("VS Code settings", () => {
  test("adds vendor exclusions while preserving JSONC comments", () => {
    const current = [
      "{",
      "  // keep this comment",
      '  "search.exclude": {',
      '    "dist/**": true',
      "  }",
      "}"
    ].join("\n")

    const result = mergeVscodeSettingsText(current)

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain("// keep this comment")
      expect(result.text).toContain('"vendor/**": true')
      expect(result.text).toContain('"dist/**": true')
      expect(result.text).toContain(
        '"typescript.preferences.autoImportFileExcludePatterns"'
      )
      expect(result.text).toContain(
        '"material-icon-theme.folders.associations"'
      )
      expect(result.text).toContain('"vendor": "packages"')
    }
  })

  test("keeps an existing vendor folder icon association", () => {
    const result = mergeVscodeSettingsText(
      [
        "{",
        '  "material-icon-theme.folders.associations": {',
        '    "vendor": "lib"',
        "  }",
        "}"
      ].join("\n")
    )

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"vendor": "lib"')
      expect(result.text).not.toContain('"vendor": "packages"')
    }
  })

  test("reports invalid JSONC instead of overwriting the file", () => {
    const result = mergeVscodeSettingsText("{ invalid")

    expect(result._tag).toBe("Invalid")
  })
})
