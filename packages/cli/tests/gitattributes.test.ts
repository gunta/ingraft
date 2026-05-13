import { describe, expect, test } from "bun:test"

import { mergeGitattributesText } from "../src/project/gitattributes.ts"

describe("subtree gitattributes section", () => {
  test("adds GitHub Linguist attributes for committed subtree sources", () => {
    const result = mergeGitattributesText({
      content: "*.png binary\n",
      prefixes: ["vendor/effect"]
    })

    expect(result).toContain("# ingraft: github-diff begin")
    expect(result).toContain("/vendor/effect/** linguist-vendored linguist-generated")
    expect(result).toContain("*.png binary")
  })

  test("sorts and deduplicates subtree prefixes", () => {
    const result = mergeGitattributesText({
      content: "",
      prefixes: ["vendor/zod", "/vendor/effect/", "vendor/zod"]
    })

    expect(result).toContain(
      [
        "/vendor/effect/** linguist-vendored linguist-generated",
        "/vendor/zod/** linguist-vendored linguist-generated"
      ].join("\n")
    )
  })

  test("removes the managed section when no subtree repos remain", () => {
    const result = mergeGitattributesText({
      content: [
        "*.png binary",
        "",
        "# ingraft: github-diff begin",
        "# Hide committed vendored subtree source in GitHub PR diffs by default.",
        "/vendor/effect/** linguist-vendored linguist-generated",
        "# ingraft: github-diff end",
        ""
      ].join("\n"),
      prefixes: []
    })

    expect(result).toBe("*.png binary\n")
  })
})
