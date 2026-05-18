import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import {
  EMPTY_VENDOR_FILTER,
  formatVendorFilterTrailer,
  hasVendorFilter,
  includedTreePaths,
  parseGitTreeEntries,
  parseSizeToBytes,
  parseVendorFilterTrailer,
  vendorFilterFromOptions
} from "../src/domain/vendor-filter.ts"

describe("vendor filters", () => {
  test("parses human-readable max file sizes", async () => {
    await expect(Effect.runPromise(parseSizeToBytes("1MB"))).resolves.toBe(1_048_576)
    await expect(Effect.runPromise(parseSizeToBytes("512kb"))).resolves.toBe(524_288)
    await expect(Effect.runPromise(parseSizeToBytes("42"))).resolves.toBe(42)

    const failure = await Effect.runPromise(parseSizeToBytes("big").pipe(Effect.flip))
    expect(failure._tag).toBe("InvalidVendorFilter")
  })

  test("keeps only tree files that pass extension directory glob and size filters", () => {
    const entries = parseGitTreeEntries(
      [
        "100644 blob a 12\tsrc/index.ts",
        "100644 blob b 99\tREADME.md",
        "100644 blob c 2000000\tsrc/big-fixture.json",
        "100644 blob d 33\tassets/logo.png",
        "100644 blob e 44\tdocs/guide.md",
        "100644 blob f 55\tsrc/snapshot.snap"
      ].join("\n")
    )
    const filter = {
      exclude: ["*.snap"],
      excludeDirs: ["docs", "assets"],
      excludeExtensions: ["md", "png"],
      include: [],
      includeDirs: [],
      maxFileSizeBytes: 1_048_576
    }

    expect(includedTreePaths({ entries, filter })).toEqual(["src/index.ts"])
  })

  test("round-trips filters through a git trailer value", () => {
    const filter = {
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["jpg", "png"],
      include: [],
      includeDirs: [],
      maxFileSizeBytes: 1_048_576
    }

    expect(parseVendorFilterTrailer(formatVendorFilterTrailer(filter))).toEqual(filter)
    expect(parseVendorFilterTrailer("")).toEqual(EMPTY_VENDOR_FILTER)
  })

  test("normalizes cli options into a typed filter", async () => {
    const filter = await Effect.runPromise(
      vendorFilterFromOptions({
        exclude: [" *.snap "],
        excludeDirs: [" /docs/ "],
        excludeExtensions: [" .PNG "],
        include: [],
        includeDirs: [],
        maxFileSize: "1MB"
      })
    )

    expect(filter).toEqual({
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      include: [],
      includeDirs: [],
      maxFileSizeBytes: 1_048_576
    })
    expect(hasVendorFilter(filter)).toBe(true)
  })

  test("normalizes include and include-dir cli options", async () => {
    const filter = await Effect.runPromise(
      vendorFilterFromOptions({
        exclude: [],
        excludeDirs: [],
        excludeExtensions: [],
        include: [" src/**/*.ts "],
        includeDirs: [" /packages/effect/ "],
        maxFileSize: null
      })
    )

    expect(filter).toEqual({
      exclude: [],
      excludeDirs: [],
      excludeExtensions: [],
      include: ["src/**/*.ts"],
      includeDirs: ["packages/effect"],
      maxFileSizeBytes: null
    })
    expect(hasVendorFilter(filter)).toBe(true)
  })

  test("includedTreePaths keeps only files inside includeDirs", () => {
    const entries = parseGitTreeEntries(
      [
        "100644 blob a 12\tsrc/index.ts",
        "100644 blob b 99\tpackages/effect/src/effect.ts",
        "100644 blob c 100\tpackages/other/src/other.ts",
        "100644 blob d 80\tdocs/guide.md"
      ].join("\n")
    )
    const filter = {
      exclude: [],
      excludeDirs: [],
      excludeExtensions: [],
      include: [],
      includeDirs: ["packages/effect"],
      maxFileSizeBytes: null
    }

    expect(includedTreePaths({ entries, filter })).toEqual([
      "packages/effect/src/effect.ts"
    ])
  })

  test("includedTreePaths intersects include with exclude (allow-list then deny-list)", () => {
    const entries = parseGitTreeEntries(
      [
        "100644 blob a 10\tsrc/index.ts",
        "100644 blob b 10\tsrc/index.snap",
        "100644 blob c 10\tpackages/effect/src/effect.ts",
        "100644 blob d 10\tpackages/effect/docs/readme.md"
      ].join("\n")
    )
    const filter = {
      exclude: ["*.snap"],
      excludeDirs: ["packages/effect/docs"],
      excludeExtensions: [],
      include: ["src/**/*.ts"],
      includeDirs: ["packages/effect"],
      maxFileSizeBytes: null
    }

    expect(includedTreePaths({ entries, filter })).toEqual([
      "packages/effect/src/effect.ts",
      "src/index.ts"
    ])
  })

  test("hasVendorFilter is true when only include or includeDirs is set", () => {
    expect(
      hasVendorFilter({
        exclude: [],
        excludeDirs: [],
        excludeExtensions: [],
        include: ["src/**/*.ts"],
        includeDirs: [],
        maxFileSizeBytes: null
      })
    ).toBe(true)

    expect(
      hasVendorFilter({
        exclude: [],
        excludeDirs: [],
        excludeExtensions: [],
        include: [],
        includeDirs: ["packages/effect"],
        maxFileSizeBytes: null
      })
    ).toBe(true)
  })

  test("parseVendorFilterTrailer accepts legacy JSON without include fields", () => {
    const legacy = JSON.stringify({
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      maxFileSizeBytes: 1_048_576
    })

    expect(parseVendorFilterTrailer(legacy)).toEqual({
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      include: [],
      includeDirs: [],
      maxFileSizeBytes: 1_048_576
    })
  })

  test("formatVendorFilterTrailer round-trips include/includeDirs", () => {
    const filter = {
      exclude: [],
      excludeDirs: [],
      excludeExtensions: [],
      include: ["src/**/*.ts"],
      includeDirs: ["packages/effect"],
      maxFileSizeBytes: null
    }

    expect(parseVendorFilterTrailer(formatVendorFilterTrailer(filter))).toEqual(filter)
  })
})
