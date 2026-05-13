import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeContext } from "@effect/platform-node"
import { Effect, Option } from "effect"

import {
  detectProjectPackageVersion,
  dependencyCandidateFromMetadata,
  packageJsonDependencies,
  packageSpecFromPackageJson,
  parseBunLockVersion,
  parseNpmPackageMetadata,
  parsePackageLockVersion,
  parsePnpmLockVersion,
  parseYarnLockVersion,
  tagCandidatesForPackageVersion
} from "../src/package-sync/service.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-package-sync-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("package version sync", () => {
  test("reads package.json dependencies across npm dependency sections", () => {
    expect(
      packageJsonDependencies(
        JSON.stringify({
          dependencies: { effect: "^3.21.2" },
          devDependencies: { typescript: "~6.0.3" },
          optionalDependencies: { sharp: "^0.34.0" },
          peerDependencies: { react: "^19.0.0" }
        })
      )
    ).toEqual([
      {
        manifestPath: "package.json",
        name: "effect",
        section: "dependencies",
        spec: "^3.21.2"
      },
      {
        manifestPath: "package.json",
        name: "typescript",
        section: "devDependencies",
        spec: "~6.0.3"
      },
      {
        manifestPath: "package.json",
        name: "sharp",
        section: "optionalDependencies",
        spec: "^0.34.0"
      },
      {
        manifestPath: "package.json",
        name: "react",
        section: "peerDependencies",
        spec: "^19.0.0"
      }
    ])
  })

  test("keeps the source manifest path on scanned dependencies", () => {
    expect(
      packageJsonDependencies(
        JSON.stringify({ dependencies: { "@opentui/core": "^0.2.8" } }),
        "packages/tui/package.json"
      )
    ).toEqual([
      {
        manifestPath: "packages/tui/package.json",
        name: "@opentui/core",
        section: "dependencies",
        spec: "^0.2.8"
      }
    ])
  })

  test("finds the dependency spec in root package.json dependency sections", () => {
    const spec = packageSpecFromPackageJson(
      JSON.stringify({
        dependencies: { effect: "^3.21.2" },
        devDependencies: { typescript: "~5.9.3" }
      }),
      "typescript"
    )

    expect(Option.getOrUndefined(spec)).toBe("~5.9.3")
  })

  test("parses npm metadata needed to resolve source refs", () => {
    const metadata = parseNpmPackageMetadata(
      JSON.stringify({
        version: "3.21.2",
        gitHead: "3f4cf6fb7d204e20d29f936f8f9d9b9ed3f40b23",
        repository: {
          type: "git",
          url: "git+https://github.com/Effect-TS/effect.git"
        }
      })
    )

    expect(metadata).toEqual(
      Option.some({
        version: "3.21.2",
        gitHead: Option.some("3f4cf6fb7d204e20d29f936f8f9d9b9ed3f40b23"),
        repositoryUrl: Option.some("https://github.com/Effect-TS/effect.git")
      })
    )
  })

  test("uses the newest npm metadata entry when a range returns multiple versions", () => {
    const metadata = parseNpmPackageMetadata(
      JSON.stringify([
        {
          version: "24.10.2",
          repository: {
            type: "git",
            url: "https://github.com/DefinitelyTyped/DefinitelyTyped.git"
          }
        },
        {
          version: "24.10.11",
          repository: {
            type: "git",
            url: "https://github.com/DefinitelyTyped/DefinitelyTyped.git"
          }
        }
      ])
    )

    expect(metadata).toEqual(
      Option.some({
        version: "24.10.11",
        gitHead: Option.none(),
        repositoryUrl: Option.some("https://github.com/DefinitelyTyped/DefinitelyTyped.git")
      })
    )
  })

  test("creates a vendoring candidate from npm repository metadata", () => {
    const candidate = dependencyCandidateFromMetadata(
      {
        manifestPath: "packages/cli/package.json",
        name: "@effect/platform",
        section: "dependencies",
        spec: "^0.96.1"
      },
      {
        version: "0.96.1",
        gitHead: Option.some("abc123"),
        repositoryUrl: Option.some("https://github.com/Effect-TS/effect.git")
      }
    )

    expect(candidate).toEqual({
      manifestPath: "packages/cli/package.json",
      packageName: "@effect/platform",
      packageSpec: "^0.96.1",
      repositoryUrl: "https://github.com/Effect-TS/effect.git",
      section: "dependencies",
      source: "npm",
      status: "matched",
      suggestedName: "effect",
      syncPackage: "@effect/platform",
      version: "0.96.1"
    })
  })

  test("prefers package-specific tag candidates before generic version tags", () => {
    expect(tagCandidatesForPackageVersion("@scope/pkg", "1.2.3")).toEqual([
      "@scope/pkg@1.2.3",
      "pkg@1.2.3",
      "v1.2.3",
      "1.2.3"
    ])
  })

  test("deduplicates unscoped package tag candidates", () => {
    expect(tagCandidatesForPackageVersion("effect", "3.21.2")).toEqual([
      "effect@3.21.2",
      "v3.21.2",
      "3.21.2"
    ])
  })

  test("reads exact versions from package-lock.json", () => {
    const version = parsePackageLockVersion(
      JSON.stringify({
        packages: {
          "": { dependencies: { effect: "^3.0.0" } },
          "node_modules/effect": { version: "3.21.2" },
          "node_modules/@types/node": { version: "24.10.2" }
        }
      }),
      "effect"
    )

    expect(Option.getOrUndefined(version)).toBe("3.21.2")
  })

  test("reads exact versions from pnpm-lock.yaml importer entries", () => {
    const version = parsePnpmLockVersion(
      [
        "lockfileVersion: '9.0'",
        "importers:",
        "  .:",
        "    dependencies:",
        "      effect:",
        "        specifier: ^3.0.0",
        "        version: 3.21.2",
        "      '@types/node':",
        "        specifier: ^24.0.0",
        "        version: 24.10.2"
      ].join("\n"),
      "effect"
    )

    expect(Option.getOrUndefined(version)).toBe("3.21.2")
  })

  test("reads exact versions from yarn.lock entries", () => {
    const version = parseYarnLockVersion(
      [
        '"effect@^3.0.0":',
        '  version "3.21.2"',
        '  resolved "https://registry.yarnpkg.com/effect/-/effect-3.21.2.tgz"'
      ].join("\n"),
      "effect"
    )

    expect(Option.getOrUndefined(version)).toBe("3.21.2")
  })

  test("reads exact versions from bun.lock package tuples", () => {
    const version = parseBunLockVersion(
      JSON.stringify({
        lockfileVersion: 1,
        packages: {
          effect: ["effect@3.21.2", "", {}],
          "@types/node": ["@types/node@24.10.2", "", {}]
        }
      }),
      "@types/node"
    )

    expect(Option.getOrUndefined(version)).toBe("24.10.2")
  })

  test("detects the project package version from node_modules before lockfiles", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, "node_modules/effect"), { recursive: true })
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ dependencies: { effect: "^3.0.0" } })
      )
      writeFileSync(
        join(cwd, "package-lock.json"),
        JSON.stringify({
          packages: {
            "node_modules/effect": { version: "3.20.0" }
          }
        })
      )
      writeFileSync(
        join(cwd, "node_modules/effect/package.json"),
        JSON.stringify({ name: "effect", version: "3.21.2" })
      )

      const detected = await Effect.runPromise(
        detectProjectPackageVersion({
          cwd,
          dependency: {
            manifestPath: "package.json",
            name: "effect",
            section: "dependencies",
            spec: "^3.0.0"
          }
        }).pipe(Effect.provide(NodeContext.layer))
      )

      expect(detected.source).toBe("node_modules")
      expect(Option.getOrUndefined(detected.version)).toBe("3.21.2")
      expect(detected.packageSpec).toBe("^3.0.0")
    })
  })
})
