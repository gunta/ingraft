import { describe, expect, test } from "bun:test"

import {
  gitFilterRepoRemovePathArgs,
  normalizeHistoryRewritePath
} from "../src/commands/remove.tsx"

describe("dangerous history rewrite remove", () => {
  test("normalizes vendored paths as directory filters", () => {
    expect(normalizeHistoryRewritePath("vendor/effect")).toBe("vendor/effect/")
    expect(normalizeHistoryRewritePath("/vendor/effect/")).toBe("vendor/effect/")
  })

  test("uses git-filter-repo to remove the vendor path from all history", () => {
    expect(gitFilterRepoRemovePathArgs("vendor/effect")).toEqual([
      "filter-repo",
      "--force",
      "--path",
      "vendor/effect/",
      "--invert-paths"
    ])
  })
})
