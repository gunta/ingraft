import { describe, expect, test } from "bun:test"

import { summarizeSnapshot, taskRows } from "../src/tui/status.ts"

describe("ingraft tui status", () => {
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
            suggestedName: "effect",
            versions: {
              local: "effect@3.21.2 (bun-lock)",
              remote: "effect@3.21.2 (npm latest)",
              status: "not-vendored",
              vendor: "not vendored"
            }
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
            repositoryUrl: "https://github.com/Effect-TS/effect.git",
            versions: {
              local: "effect@3.21.2 (bun-lock)",
              remote: "effect@3.21.3 (npm latest)",
              status: "remote-drift",
              vendor: "effect@3.21.2 (vendored source)"
            }
          }
        ]
      })
    ).toEqual(["UPDATE effect, @effect/platform -> effect [remote-drift]"])
  })
})
