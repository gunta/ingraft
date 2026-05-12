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
        sha: "new-sha",
        date: "2026-05-13T00:00:00Z"
      }
    ])
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
})
