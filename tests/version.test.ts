import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { Git } from "../src/git.ts"
import { RepositoryHosts } from "../src/repository-hosts.ts"
import { RuntimeConfig } from "../src/runtime.ts"
import {
  resolveVersion,
  versionSelectorFromOptions
} from "../src/version.ts"

describe("version selectors", () => {
  const runtime = RuntimeConfig.make({
    argv: ["bun", "vendor.ts"],
    colors: false,
    cwd: "/workspace",
    exit: (code) => Effect.dieMessage(`exit ${code}`)
  })

  test("rejects ambiguous version selectors", async () => {
    const failure = await Effect.runPromise(
      versionSelectorFromOptions({
        ref: Option.some("main"),
        tag: Option.some("v1.0.0"),
        release: Option.none()
      }).pipe(Effect.flip)
    )

    expect(failure._tag).toBe("VersionSelectorConflict")
  })

  test("resolves provider releases to tags", async () => {
    const result = await Effect.runPromise(
      resolveVersion({
        url: "https://github.com/Effect-TS/effect.git",
        selector: { _tag: "Release", value: "latest" }
      }).pipe(
        Effect.provideService(
          RepositoryHosts,
          RepositoryHosts.make({
            clone: () => Effect.succeed(Option.none()),
            defaultBranch: () => Effect.succeed(Option.none()),
            identify: () => Effect.succeed(Option.none()),
            releaseTag: () => Effect.succeed(Option.some("v3.21.2"))
          })
        ),
        Effect.provideService(
          Git,
          Git.make({
            exec: () => Effect.dieMessage("git tag fallback should not run")
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("v3.21.2")
  })

  test("falls back to git tags for named releases on generic hosts", async () => {
    const result = await Effect.runPromise(
      resolveVersion({
        url: "https://example.com/org/repo.git",
        selector: { _tag: "Release", value: "v1.2.3" }
      }).pipe(
        Effect.provideService(
          RepositoryHosts,
          RepositoryHosts.make({
            clone: () => Effect.succeed(Option.none()),
            defaultBranch: () => Effect.succeed(Option.none()),
            identify: () => Effect.succeed(Option.none()),
            releaseTag: () => Effect.succeed(Option.none())
          })
        ),
        Effect.provideService(
          Git,
          Git.make({
            exec: (args) => {
              expect(args).toEqual([
                "ls-remote",
                "--tags",
                "https://example.com/org/repo.git",
                "refs/tags/v1.2.3"
              ])
              return Effect.succeed({
                stdout: "abc\trefs/tags/v1.2.3\n",
                stderr: "",
                exitCode: 0
              })
            }
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("v1.2.3")
  })
})
