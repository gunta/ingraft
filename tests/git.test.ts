import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { Git, detectDefaultBranch } from "../src/git.ts"

describe("git service", () => {
  test("detects a default branch through an injectable Git service", async () => {
    const result = await Effect.runPromise(
      detectDefaultBranch("https://example.com/repo.git").pipe(
        Effect.provideService(
          Git,
          Git.make({
            exec: (args) => {
              expect(args).toEqual([
                "ls-remote",
                "--symref",
                "https://example.com/repo.git",
                "HEAD"
              ])
              return Effect.succeed({
                stdout: "ref: refs/heads/trunk\tHEAD\n",
                stderr: "",
                exitCode: 0
              })
            }
          })
        )
      )
    )

    expect(Option.getOrUndefined(result)).toBe("trunk")
  })
})
