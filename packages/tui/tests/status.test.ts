import { describe, expect, test } from "bun:test"
import { summarizeSnapshot, taskRows } from "../src/status.ts"

describe("vendor-subtree tui status", () => {
  test("summarizes dependency and vendoring task state", () => {
    expect(
      summarizeSnapshot({
        candidates: [
          { packageName: "effect", status: "matched" },
          { packageName: "left-pad", status: "missing-repository" }
        ],
        tasks: [
          {
            action: "add",
            existingName: null,
            packageNames: ["effect"],
            primaryPackageName: "effect",
            repositoryUrl: "https://github.com/Effect-TS/effect.git",
            suggestedName: "effect"
          }
        ]
      })
    ).toEqual([
      "2 dependencies scanned",
      "1 matched to source repositories",
      "1 repos ready to add",
      "0 vendored repos ready to update"
    ])
  })

  test("renders task rows for source repositories", () => {
    expect(
      taskRows({
        candidates: [],
        tasks: [
          {
            action: "update",
            existingName: "effect",
            packageNames: ["effect", "@effect/platform"],
            primaryPackageName: "effect",
            repositoryUrl: "https://github.com/Effect-TS/effect.git"
          }
        ]
      })
    ).toEqual(["UPDATE effect, @effect/platform -> effect"])
  })
})
