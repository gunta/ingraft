import { describe, expect, test } from "bun:test"
import {
  formatVendorError,
  GitCommandFailed,
  PackageVersionSyncFailed
} from "../src/domain/errors.ts"
import { formatStatus } from "../src/app/log.ts"

describe("CLI presentation", () => {
  test("formats tagged domain errors with detail and hint", () => {
    const message = formatVendorError(
      new GitCommandFailed({
        args: ["subtree", "pull"],
        cwd: "/repo",
        exitCode: 1,
        output: "merge conflict"
      }),
      { colors: false }
    )

    expect(message).toContain("Error: Git command failed")
    expect(message).toContain("git subtree pull exited with 1")
    expect(message).toContain("merge conflict")
    expect(message).toContain("Hint:")
  })

  test("can colorize status messages for interactive output", () => {
    expect(formatStatus("ok", "Updated AGENTS.md", { colors: true })).toContain(
      "\x1b[32m"
    )
    expect(formatStatus("warn", "Skipped settings", { colors: true })).toContain(
      "\x1b[33m"
    )
  })

  test("formats package sync failures with the package and reason", () => {
    const message = formatVendorError(
      new PackageVersionSyncFailed({
        packageName: "effect",
        reason: "effect is not present in root package.json",
        url: "https://github.com/Effect-TS/effect.git"
      }),
      { colors: false }
    )

    expect(message).toContain("Could not sync package 'effect'")
    expect(message).toContain("effect is not present in root package.json")
    expect(message).toContain("Repository: https://github.com/Effect-TS/effect.git")
  })
})
