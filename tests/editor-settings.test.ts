import { describe, expect, test } from "bun:test"
import {
  mergeEditorIgnoreText,
  mergeZedSettingsText
} from "../src/editor-settings.ts"

describe("editor settings", () => {
  test("adds Zed vendor scan exclusions while preserving JSONC comments", () => {
    const result = mergeZedSettingsText(
      [
        "{",
        "  // keep this comment",
        '  "file_scan_exclusions": ["**/.git"]',
        "}"
      ].join("\n")
    )

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain("// keep this comment")
      expect(result.text).toContain('"**/.git"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("reports invalid Zed JSONC instead of overwriting the file", () => {
    const result = mergeZedSettingsText("{ invalid")

    expect(result._tag).toBe("Invalid")
  })

  test("adds a managed .ignore section for ripgrep-backed editors", () => {
    const result = mergeEditorIgnoreText("dist/\n")

    expect(result).toContain("# vendor-subtree-skill: editor-ignore begin")
    expect(result).toContain("/vendor/")
    expect(result).toContain("dist/")
  })

  test("replaces an existing managed .ignore section", () => {
    const result = mergeEditorIgnoreText(
      [
        "dist/",
        "",
        "# vendor-subtree-skill: editor-ignore begin",
        "/old-vendor/",
        "# vendor-subtree-skill: editor-ignore end",
        ""
      ].join("\n")
    )

    expect(result).toContain("dist/")
    expect(result).toContain("/vendor/")
    expect(result).not.toContain("/old-vendor/")
  })
})
