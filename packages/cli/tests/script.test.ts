import { describe, expect, test } from "bun:test"

import { commandInvocation, scriptRelTo } from "../src/project/script.ts"

describe("script invocation", () => {
  test("derives a repo-relative bun command from injected argv", () => {
    const params = {
      cwd: "/repo",
      argv: ["bun", "/repo/packages/cli/scripts/vendor.ts"]
    }

    expect(scriptRelTo(params)).toBe("packages/cli/scripts/vendor.ts")
    expect(commandInvocation(params)).toBe("bun packages/cli/scripts/vendor.ts")
  })

  test("uses bunx vendor-subtree@latest when argv does not point into the repo", () => {
    expect(
      commandInvocation({
        cwd: "/repo",
        argv: ["vendor-subtree", "/usr/local/bin/vendor-subtree"]
      })
    ).toBe("bunx vendor-subtree@latest")
  })
})
