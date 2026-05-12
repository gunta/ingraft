import { describe, expect, test } from "bun:test"
import { CliError, formatCliError } from "../src/errors.ts"
import { formatStatus } from "../src/log.ts"

describe("CLI presentation", () => {
  test("formats structured errors with detail and hint", () => {
    const message = formatCliError(
      new CliError({
        title: "Git command failed",
        detail: "git subtree pull exited with code 1",
        hint: "Run `git status` and resolve conflicts before retrying.",
        code: 3
      }),
      { colors: false }
    )

    expect(message).toContain("Error: Git command failed")
    expect(message).toContain("git subtree pull exited with code 1")
    expect(message).toContain(
      "Hint: Run `git status` and resolve conflicts before retrying."
    )
  })

  test("can colorize status messages for interactive output", () => {
    expect(formatStatus("ok", "Updated AGENTS.md", { colors: true })).toContain(
      "\x1b[32m"
    )
    expect(formatStatus("warn", "Skipped settings", { colors: true })).toContain(
      "\x1b[33m"
    )
  })
})
