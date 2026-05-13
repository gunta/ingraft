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
} from "../src/vendor-filter.ts"

describe("vendor filters", () => {
  test("parses human-readable max file sizes", async () => {
    await expect(Effect.runPromise(parseSizeToBytes("1MB"))).resolves.toBe(
      1_048_576
    )
    await expect(Effect.runPromise(parseSizeToBytes("512kb"))).resolves.toBe(
      524_288
    )
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
      maxFileSizeBytes: 1_048_576
    }

    expect(includedTreePaths({ entries, filter })).toEqual(["src/index.ts"])
  })

  test("round-trips filters through a git trailer value", () => {
    const filter = {
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["jpg", "png"],
      maxFileSizeBytes: 1_048_576
    }

    expect(parseVendorFilterTrailer(formatVendorFilterTrailer(filter))).toEqual(
      filter
    )
    expect(parseVendorFilterTrailer("")).toEqual(EMPTY_VENDOR_FILTER)
  })

  test("normalizes cli options into a typed filter", async () => {
    const filter = await Effect.runPromise(
      vendorFilterFromOptions({
        exclude: [" *.snap "],
        excludeDirs: [" /docs/ "],
        excludeExtensions: [" .PNG "],
        maxFileSize: "1MB"
      })
    )

    expect(filter).toEqual({
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      maxFileSizeBytes: 1_048_576
    })
    expect(hasVendorFilter(filter)).toBe(true)
  })
})
