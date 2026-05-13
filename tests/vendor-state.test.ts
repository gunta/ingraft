import { describe, expect, test } from "bun:test"
import {
  parseVendoredLog,
  parseVendoredLogWithDiagnostics
} from "../src/vendor-state.ts"

describe("vendor state parsing", () => {
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
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log).map((repo) => repo.strategy)).toEqual([
      "submodule",
      "clone-ignore"
    ])
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
    const log = [
      "sha\x002026-05-13T00:00:00Z\x00\x00https://example.com/x.git\x00"
    ].join("\x1e")

    expect(parseVendoredLog(log)).toEqual([])
  })

  test("reports schema diagnostics for malformed records", () => {
    const log = [
      "sha\x002026-05-13T00:00:00Z\x00\x00https://example.com/x.git\x00"
    ].join("\x1e")

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
