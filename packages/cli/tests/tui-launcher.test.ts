import { describe, expect, test } from "bun:test"
import { pathToFileURL } from "node:url"

import { siblingModulePath, tuiLaunchPlan } from "../src/tui/launcher.ts"

describe("tui launcher", () => {
  test("uses a Bun child process for built Node executions", () => {
    const moduleUrl = pathToFileURL("/repo/packages/cli/dist/src/tui/launcher.js").href

    expect(tuiLaunchPlan({ args: ["--debug"], isBunRuntime: false, moduleUrl })).toEqual({
      _tag: "spawn",
      args: ["/repo/packages/cli/dist/src/tui/runner.js", "--debug"],
      command: "bun"
    })
  })

  test("preserves TypeScript source paths during workspace development", () => {
    const moduleUrl = pathToFileURL("/repo/packages/cli/src/tui/launcher.ts").href

    expect(siblingModulePath(moduleUrl, "runner")).toBe("/repo/packages/cli/src/tui/runner.ts")
  })

  test("runs directly when the CLI itself is already running in Bun", () => {
    expect(tuiLaunchPlan({ isBunRuntime: true })).toEqual({
      _tag: "direct",
      args: []
    })
  })
})
