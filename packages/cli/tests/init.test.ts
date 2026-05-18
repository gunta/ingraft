import { execSync } from "node:child_process"
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { NodeServices } from "@effect/platform-node"

import { LiveLayer } from "../src/app/layers.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"
import { GitHubCliLive } from "../src/services/gh.ts"
import { initImpl } from "../src/commands/init.tsx"
import { readForkMode } from "../src/domain/fork-mode.ts"
import { initBareUpstream, initLocalRepo } from "./helpers/local-vendor-fixture.ts"

const GhLive = GitHubCliLive.pipe(Layer.provide(NodeServices.layer))

describe("ingraft init", () => {
  let originalCwd: string
  beforeEach(() => {
    originalCwd = process.cwd()
  })
  afterEach(() => {
    process.chdir(originalCwd)
  })

  test("does not prompt when stdin is not a TTY (test runner is non-interactive)", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    execSync(`git remote add upstream ${upstream}`, { cwd })
    process.chdir(cwd)

    await Effect.runPromise(
      initImpl.pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive), Effect.provide(GhLive))
    )

    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )

    expect(mode).toBeUndefined()
  })
})
