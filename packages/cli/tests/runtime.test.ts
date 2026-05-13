import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"

describe("runtime config service", () => {
  test("can be injected with argv, cwd, and exit behavior", async () => {
    const runtime = RuntimeConfig.make({
      argv: ["bun", "vendor.ts", "list"],
      cwd: "/workspace",
      exit: (code) => Effect.dieMessage(`exit ${code}`)
    })

    const result = await Effect.runPromise(
      RuntimeConfig.pipe(
        Effect.map((config) => ({
          argv: config.argv,
          cwd: config.cwd
        })),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(result).toEqual({
      argv: ["bun", "vendor.ts", "list"],
      cwd: "/workspace"
    })
  })
})
