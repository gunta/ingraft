import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

import { NodeServices } from "@effect/platform-node"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"

import { GitMetadataLive } from "../src/services/git-metadata.ts"
import { GitLive } from "../src/services/git.ts"
import { LocalState, LocalStateLive } from "../src/services/local-state.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import {
  listVendored,
  parseVendoredCommits,
  parseVendoredLog,
  parseVendoredLogWithDiagnostics
} from "../src/domain/vendor-state.ts"

describe("vendor state parsing", () => {
  test("parses vendored records from isomorphic-git commit objects", () => {
    const timestamp = Date.parse("2026-05-13T00:00:00.000Z") / 1000
    const commits = [
      {
        oid: "iso-sha",
        message: [
          "vendor: add effect (https://github.com/Effect-TS/effect.git@main) [subtree]",
          "",
          "git-subtree-dir: vendor/effect",
          "vendor-source-url: https://github.com/Effect-TS/effect.git",
          "vendor-source-ref: main",
          "vendor-strategy: subtree",
          "vendor-action: upsert",
          "vendor-sync-package: effect"
        ].join("\n"),
        timestamp
      }
    ]

    expect(parseVendoredCommits(commits)).toEqual([
      {
        name: "effect",
        prefix: "vendor/effect",
        url: "https://github.com/Effect-TS/effect.git",
        ref: "main",
        strategy: "subtree",
        filter: {
          exclude: [],
          excludeDirs: [],
          excludeExtensions: [],
          include: [],
          includeDirs: [],
          maxFileSizeBytes: null
        },
        syncPackage: "effect",
        sha: "iso-sha",
        date: "2026-05-13T00:00:00.000Z"
      }
    ])
  })

  test("parses the newest vendored record per prefix from git log output", () => {
    const log = [
      [
        "new-sha",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main"
      ].join("\x00"),
      [
        "old-sha",
        "2026-05-12T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)).toEqual([
      {
        name: "effect",
        prefix: "vendor/effect",
        url: "https://github.com/Effect-TS/effect.git",
        ref: "main",
        strategy: "subtree",
        filter: {
          exclude: [],
          excludeDirs: [],
          excludeExtensions: [],
          include: [],
          includeDirs: [],
          maxFileSizeBytes: null
        },
        sha: "new-sha",
        date: "2026-05-13T00:00:00Z"
      }
    ])
  })

  test("parses filter metadata from git trailers", () => {
    const filter = {
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      include: [],
      includeDirs: [],
      maxFileSizeBytes: 1048576
    }
    const log = [
      [
        "sha-filtered",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "subtree",
        "upsert",
        JSON.stringify(filter)
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)[0]?.filter).toEqual(filter)
  })

  test("parses synced package metadata from git trailers", () => {
    const log = [
      [
        "sha-synced",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "3f4cf6f",
        "subtree",
        "upsert",
        "",
        "effect"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)[0]?.syncPackage).toBe("effect")
  })

  test("parses explicit non-subtree strategies from git trailers", () => {
    const log = [
      [
        "sha-submodule",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "submodule",
        "upsert"
      ].join("\x00"),
      [
        "sha-clone",
        "2026-05-13T00:00:00Z",
        "vendor/effect-platform",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "clone-ignore",
        "upsert"
      ].join("\x00"),
      [
        "sha-cache-link",
        "2026-05-13T00:00:00Z",
        "vendor/effect-cache",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "cache-link",
        "upsert"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log).map((repo) => repo.strategy)).toEqual([
      "submodule",
      "cache-link",
      "clone-ignore"
    ])
  })

  test("parses resolved ref metadata for cache-link records", () => {
    const log = [
      [
        "sha-cache-link",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "cache-link",
        "upsert",
        "",
        "",
        "9f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)[0]).toMatchObject({
      prefix: "vendor/effect",
      ref: "main",
      resolvedRef: "9f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e",
      strategy: "cache-link"
    })
  })

  test("excludes repos whose latest trailer record is a remove action", () => {
    const log = [
      [
        "remove-sha",
        "2026-05-14T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "clone-ignore",
        "remove"
      ].join("\x00"),
      [
        "add-sha",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "clone-ignore",
        "upsert"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)).toEqual([])
  })

  test("ignores malformed records instead of creating partial state", () => {
    const log = ["sha\x002026-05-13T00:00:00Z\x00\x00https://example.com/x.git\x00"].join("\x1e")

    expect(parseVendoredLog(log)).toEqual([])
  })

  test("reports schema diagnostics for malformed records", () => {
    const log = ["sha\x002026-05-13T00:00:00Z\x00\x00https://example.com/x.git\x00"].join("\x1e")

    const result = parseVendoredLogWithDiagnostics(log)

    expect(result.repos).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.reason).toContain("prefix")
  })

  test("reports diagnostics for malformed filter metadata", () => {
    const log = [
      [
        "sha-filtered",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "subtree",
        "upsert",
        "{bad json"
      ].join("\x00")
    ].join("\x1e")

    const result = parseVendoredLogWithDiagnostics(log)

    expect(result.repos).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.reason).toContain("filter")
  })
})

describe("listVendored with local state", () => {
  test("includes local-only entries from .git/ingraft/state.json", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ingraft-merge-"))
    const { execSync } = await import("node:child_process")
    execSync("git init -q", { cwd })
    execSync(
      "git config user.email tests@example.com && git config user.name tests",
      { cwd }
    )
    execSync("git commit --allow-empty -m init -q", { cwd })

    mkdirSync(join(cwd, ".git", "ingraft"), { recursive: true })
    writeFileSync(
      join(cwd, ".git", "ingraft", "state.json"),
      JSON.stringify({
        version: 1,
        vendors: [
          {
            name: "effect",
            prefix: "vendor/effect",
            url: "https://github.com/Effect-TS/effect.git",
            ref: "main",
            resolvedRef: "abc",
            strategy: "clone-ignore",
            filter: {
              exclude: [],
              excludeDirs: [],
              excludeExtensions: [],
              include: [],
              includeDirs: [],
              maxFileSizeBytes: null
            },
            addedAt: "2026-05-19T00:00:00.000Z"
          }
        ]
      })
    )

    const repos = await Effect.runPromise(
      listVendored(cwd).pipe(
        Effect.provide(
          Layer.mergeAll(
            LocalStateLive,
            GitMetadataLive,
            GitLive.pipe(Layer.provide(NodeServices.layer)),
            NodeServices.layer,
            RuntimeConfigLive
          )
        )
      )
    )

    expect(
      repos.some((repo) => repo.prefix === "vendor/effect" && repo.localOnly === true)
    ).toBe(true)
  })
})

describe("listVendored fast-path", () => {
  test("returns the LocalState index when HEAD SHA matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ingraft-listvendored-"))
    try {
      spawnSync("git", ["init", "-q", "--initial-branch=main"], { cwd: dir })
      spawnSync(
        "git",
        [
          "-c",
          "user.email=t@t",
          "-c",
          "user.name=T",
          "commit",
          "--allow-empty",
          "-q",
          "-m",
          "init"
        ],
        { cwd: dir }
      )
      const headResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir })
      const headSha = headResult.stdout.toString().trim()

      const layer = Layer.mergeAll(
        LocalStateLive,
        GitMetadataLive,
        GitLive.pipe(Layer.provide(NodeServices.layer)),
        NodeServices.layer,
        RuntimeConfigLive
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const local = yield* LocalState
          yield* local.writeVendorIndex({
            cwd: dir,
            headSha,
            builtAt: new Date().toISOString(),
            repos: [
              {
                name: "effect",
                prefix: "vendor/effect",
                url: "https://github.com/Effect-TS/effect.git",
                ref: "main",
                strategy: "clone-ignore",
                filter: {
                  exclude: [],
                  excludeDirs: [],
                  excludeExtensions: [],
                  include: [],
                  includeDirs: [],
                  maxFileSizeBytes: null
                },
                sha: "deadbeef",
                date: "2026-05-13T00:00:00.000Z"
              }
            ]
          })
          return yield* listVendored(dir)
        }).pipe(Effect.provide(layer))
      )

      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result.some((r) => r.name === "effect")).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
