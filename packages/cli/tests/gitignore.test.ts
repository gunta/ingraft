import { describe, expect, test } from "bun:test"
import { mergeGitignoreText } from "../src/project/gitignore.ts"

describe("clone-ignore gitignore section", () => {
  test("adds a managed section for ignored local clones", () => {
    const result = mergeGitignoreText({
      content: "node_modules/\n",
      prefixes: ["vendor/effect"]
    })

    expect(result).toContain("# vendor-subtree-skill: clone-ignore begin")
    expect(result).toContain("/vendor/effect/")
    expect(result).toContain("node_modules/")
  })

  test("removes the managed section when no clone-ignore repos remain", () => {
    const result = mergeGitignoreText({
      content: [
        "node_modules/",
        "",
        "# vendor-subtree-skill: clone-ignore begin",
        "/vendor/effect/",
        "# vendor-subtree-skill: clone-ignore end",
        ""
      ].join("\n"),
      prefixes: []
    })

    expect(result).toBe("node_modules/\n")
  })
})
