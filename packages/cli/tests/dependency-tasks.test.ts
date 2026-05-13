import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import { dependencyVendorTasks, vendoredPackageVersionKey } from "../src/commands/deps.tsx"
import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import type { DependencyVendorCandidate } from "../src/package-sync/service.ts"

const matched = (packageName: string, repositoryUrl: string): DependencyVendorCandidate => ({
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
  version: "1.0.0",
  versionSource: "bun-lock",
  remoteVersion: "1.1.0"
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
})
