import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import { dependencyVendorTasks, vendoredPackageVersionKey } from "../src/commands/deps.tsx"
import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import type { DependencyVendorCandidate } from "../src/package-sync/service.ts"

const matched = (
  packageName: string,
  repositoryUrl: string,
  version = "1.0.0",
  remoteVersion = "1.1.0"
): DependencyVendorCandidate => ({
  manifestPath: "package.json",
  packageName,
  packageSpec: "^1.0.0",
  repositoryUrl,
  section: "dependencies",
  source: "npm",
  status: "matched",
  suggestedName:
    repositoryUrl
      .split("/")
      .at(-1)
      ?.replace(/\.git$/, "") ?? "repo",
  syncPackage: packageName,
  version,
  versionSource: "bun-lock",
  remoteVersion
})

describe("dependency vendoring tasks", () => {
  test("deduplicates packages that resolve to the same source repo", () => {
    expect(
      dependencyVendorTasks(
        [
          matched("effect", "https://github.com/Effect-TS/effect.git"),
          matched("@effect/platform", "https://github.com/Effect-TS/effect.git")
        ],
        []
      )
    ).toEqual([
      {
        action: "add",
        existingName: Option.none(),
        packageNames: ["effect", "@effect/platform"],
        primaryPackageName: "effect",
        repositoryUrl: "https://github.com/Effect-TS/effect.git",
        suggestedName: "effect",
        versions: {
          local: "effect@1.0.0 (bun-lock)",
          remote: "effect@1.1.0 (npm latest)",
          status: "not-vendored",
          vendor: "not vendored"
        }
      }
    ])
  })

  test("plans an update when the repo is already vendored", () => {
    expect(
      dependencyVendorTasks(
        [matched("effect", "https://github.com/Effect-TS/effect.git")],
        [
          {
            date: "today",
            filter: EMPTY_VENDOR_FILTER,
            name: "effect",
            prefix: "vendor/effect",
            ref: "main",
            sha: "abc",
            strategy: "subtree",
            syncPackage: "effect",
            url: "https://github.com/Effect-TS/effect.git"
          }
        ],
        new Map([[vendoredPackageVersionKey("effect", "effect"), "0.9.0"]])
      )
    ).toEqual([
      {
        action: "update",
        existingName: Option.some("effect"),
        packageNames: ["effect"],
        primaryPackageName: "effect",
        repositoryUrl: "https://github.com/Effect-TS/effect.git",
        suggestedName: "effect",
        versions: {
          local: "effect@1.0.0 (bun-lock)",
          remote: "effect@1.1.0 (npm latest)",
          status: "local-vendor-drift",
          vendor: "effect@0.9.0 (vendored source)"
        }
      }
    ])
  })

  test("uses the repo-named package as the displayed version for grouped updates", () => {
    expect(
      dependencyVendorTasks(
        [
          matched("@effect/cli", "https://github.com/Effect-TS/effect.git", "0.75.1", "0.75.1"),
          matched("effect", "https://github.com/Effect-TS/effect.git", "3.21.2", "3.21.2")
        ],
        [
          {
            date: "today",
            filter: EMPTY_VENDOR_FILTER,
            name: "effect",
            prefix: "vendor/effect",
            ref: "main",
            sha: "abc",
            strategy: "subtree",
            url: "https://github.com/Effect-TS/effect.git"
          }
        ],
        new Map([[vendoredPackageVersionKey("effect", "effect"), "3.21.2"]])
      )[0]?.versions
    ).toEqual({
      local: "effect@3.21.2 (bun-lock)",
      remote: "effect@3.21.2 (npm latest)",
      status: "synced",
      vendor: "effect@3.21.2 (vendored source)"
    })
  })
})
