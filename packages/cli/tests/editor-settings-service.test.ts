import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { EditorSettings } from "../src/editors/service.ts"

describe("editor settings service", () => {
  test("can be replaced by an injected Effect service", async () => {
    const result = await Effect.runPromise(
      EditorSettings.refresh({ cwd: "/workspace" }).pipe(
        Effect.provideService(
          EditorSettings,
          EditorSettings.make({
            refresh: ({ cwd }) => Effect.succeed([`${cwd}/.ignore`])
          })
        )
      )
    )

    expect(result).toEqual(["/workspace/.ignore"])
  })
})
