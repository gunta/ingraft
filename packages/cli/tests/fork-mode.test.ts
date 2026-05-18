import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { readForkMode, writeForkMode, detectFork } from "../src/domain/fork-mode.ts"
import { GitHubCli } from "../src/services/gh.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"
import { GitLive } from "../src/services/git.ts"

const initRepo = () => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-forkmode-"))
  execSync("git init -q", { cwd })
  return cwd
}

describe("fork mode config", () => {
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  test("returns undefined when ingraft.forkMode is unset", async () => {
    const cwd = initRepo()
    process.chdir(cwd)

    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    expect(mode).toBeUndefined()
  })

  test("writes and reads back personal", async () => {
    const cwd = initRepo()
    process.chdir(cwd)

    await Effect.runPromise(
      writeForkMode({ cwd, mode: "personal" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )
    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    expect(mode).toBe("personal")
  })

  test("writes and reads back contribute", async () => {
    const cwd = initRepo()
    process.chdir(cwd)

    await Effect.runPromise(
      writeForkMode({ cwd, mode: "contribute" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )
    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    expect(mode).toBe("contribute")
  })

  test("ignores unrecognized values from git config", async () => {
    const cwd = initRepo()
    process.chdir(cwd)
    execSync("git config ingraft.forkMode garbage", { cwd })

    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    expect(mode).toBeUndefined()
  })
})

describe("fork detection", () => {
  let originalCwd: string
  beforeEach(() => {
    originalCwd = process.cwd()
  })
  afterEach(() => {
    process.chdir(originalCwd)
  })

  test("detects a fork via gh repo view", async () => {
    const cwd = initRepo()
    process.chdir(cwd)

    const stubGh = Layer.succeed(
      GitHubCli,
      GitHubCli.of({
        exec: () =>
          Effect.succeed({
            stdout: JSON.stringify({
              isFork: true,
              parent: { nameWithOwner: "upstream/repo" }
            }),
            stderr: "",
            exitCode: 0
          })
      })
    )

    const result = await Effect.runPromise(
      detectFork({ cwd }).pipe(
        Effect.provide(stubGh),
        Effect.provide(GitLive.pipe(Layer.provide(NodeServices.layer))),
        Effect.provide(NodeServices.layer),
        Effect.provide(GitMetadataLive),
        Effect.provide(RuntimeConfigLive)
      )
    )

    expect(result.isFork).toBe(true)
    expect(result.source).toBe("gh")
    expect(result.source === "gh" ? result.parentNameWithOwner : undefined).toBe("upstream/repo")
  })

  test("falls back to upstream remote when gh is unavailable", async () => {
    const cwd = initRepo()
    process.chdir(cwd)
    execSync("git remote add upstream https://github.com/upstream/repo.git", { cwd })

    const stubGh = Layer.succeed(
      GitHubCli,
      GitHubCli.of({
        exec: () => Effect.succeed({ stdout: "", stderr: "command not found", exitCode: 127 })
      })
    )

    const result = await Effect.runPromise(
      detectFork({ cwd }).pipe(
        Effect.provide(stubGh),
        Effect.provide(GitLive.pipe(Layer.provide(NodeServices.layer))),
        Effect.provide(NodeServices.layer),
        Effect.provide(GitMetadataLive),
        Effect.provide(RuntimeConfigLive)
      )
    )

    expect(result.isFork).toBe(true)
    expect(result.source).toBe("remotes")
  })

  test("returns not-a-fork when no signals match", async () => {
    const cwd = initRepo()
    process.chdir(cwd)

    const stubGh = Layer.succeed(
      GitHubCli,
      GitHubCli.of({
        exec: () => Effect.succeed({ stdout: "", stderr: "command not found", exitCode: 127 })
      })
    )

    const result = await Effect.runPromise(
      detectFork({ cwd }).pipe(
        Effect.provide(stubGh),
        Effect.provide(GitLive.pipe(Layer.provide(NodeServices.layer))),
        Effect.provide(NodeServices.layer),
        Effect.provide(GitMetadataLive),
        Effect.provide(RuntimeConfigLive)
      )
    )

    expect(result.isFork).toBe(false)
    expect(result.source).toBe("none")
  })
})
