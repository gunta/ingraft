import { describe, expect, test } from "bun:test"

import { mergeZedSettingsText } from "../src/editors/zed.ts"
import { mergePrettierIgnoreText } from "../src/tool-ignores/prettier.ts"

describe("editor settings", () => {
  test("does not add Zed scan exclusions because that hides vendor from LSPs", () => {
    const result = mergeZedSettingsText(
      ["{", "  // keep this comment", '  "file_scan_exclusions": ["**/.git"]', "}"].join("\n")
    )

    expect(result._tag).toBe("Unchanged")
  })

  test("does not parse or overwrite existing Zed settings", () => {
    const result = mergeZedSettingsText("{ invalid")

    expect(result._tag).toBe("Unchanged")
  })

  test("does not hide vendor from Zed file scans", () => {
    const result = mergeZedSettingsText("{}\n")

    expect(result._tag).toBe("Unchanged")
  })

  test("adds a managed Prettier ignore section for formatting only", () => {
    const result = mergePrettierIgnoreText("dist/\n")

    expect(result).toContain("# vendor-subtree: prettier-ignore begin")
    expect(result).toContain("vendor/")
    expect(result).toContain("dist/")
  })
})
