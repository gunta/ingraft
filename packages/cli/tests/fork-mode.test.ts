import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import { LiveLayer } from "../src/app/layers.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"

import { readForkMode, writeForkMode } from "../src/domain/fork-mode.ts"

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
      writeForkMode({ cwd, mode: "personal" }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
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
      writeForkMode({ cwd, mode: "contribute" }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
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
