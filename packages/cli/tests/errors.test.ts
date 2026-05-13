import { describe, expect, test } from "bun:test"

import {
  errorPresentation,
  GitCommandFailed,
  PackageVersionSyncFailed
} from "../src/domain/errors.ts"

describe("CLI error presentation", () => {
  test("produces presentation with detail and hint for git failures", () => {
    const presentation = errorPresentation(
      new GitCommandFailed({
        args: ["subtree", "pull"],
        cwd: "/repo",
        exitCode: 1,
        output: "merge conflict"
      })
    )

    expect(presentation.title).toBe("Git command failed")
    expect(presentation.detail).toContain("git subtree pull exited with 1")
    expect(presentation.detail).toContain("merge conflict")
    expect(presentation.hint).toBeDefined()
    expect(presentation.code).toBe(3)
  })

  test("produces presentation for package sync failures", () => {
    const presentation = errorPresentation(
      new PackageVersionSyncFailed({
        packageName: "effect",
        reason: "effect is not present in root package.json",
        url: "https://github.com/Effect-TS/effect.git"
      })
    )

    expect(presentation.title).toContain("Could not sync package 'effect'")
    expect(presentation.detail).toContain("effect is not present in root package.json")
    expect(presentation.detail).toContain("Repository: https://github.com/Effect-TS/effect.git")
    expect(presentation.code).toBe(2)
  })
})
