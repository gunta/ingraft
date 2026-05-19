import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const workspaceRoot = join(import.meta.dir, "../../..")

interface Candidate {
  readonly packageName: string
  readonly remoteVersion?: string
  readonly repositoryUrl?: string
  readonly status: string
  readonly version?: string
  readonly versionSource?: string
}

interface Task {
  readonly action: string
  readonly existingName?: string
  readonly packageNames: ReadonlyArray<string>
  readonly primaryPackageName: string
  readonly repositoryUrl: string
  readonly versions: {
    readonly local: string
    readonly remote: string
    readonly status: string
    readonly vendor: string
  }
}

interface DepsOutput {
  readonly candidates: ReadonlyArray<Candidate>
  readonly tasks: ReadonlyArray<Task>
}

const parseOutput = (command: string, args: ReadonlyArray<string>) => {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8"
  })
  expect(result.status).toBe(0)
  return JSON.parse(result.stdout) as DepsOutput
}

const matchedCount = (output: DepsOutput) =>
  output.candidates.filter((candidate) => candidate.status === "matched").length

const updateCount = (output: DepsOutput) =>
  output.tasks.filter((task) => task.action === "update").length

const effectTask = (output: DepsOutput) =>
  output.tasks.find((task) => task.packageNames.includes("effect"))

const nativeBinaries = [
  {
    args: ["--root", "."],
    command: "packages/optimized/rust/target/release/ingraft-deps-rust"
  },
  {
    args: ["--root", "."],
    command: "packages/optimized/zig/zig-out/bin/ingraft-deps-zig"
  }
] as const

const nativeParityTest = nativeBinaries.every((binary) =>
  existsSync(join(workspaceRoot, binary.command))
)
  ? test
  : test.skip

describe("optimized deps parity", () => {
  nativeParityTest(
    "Rust and Zig resolve the same npm metadata and dependency tasks as TypeScript",
    () => {
      const typescript = parseOutput("bun", ["packages/cli/scripts/vendor.ts", "deps", "--json"])
      const typescriptEffect = typescript.candidates.find(
        (candidate) => candidate.packageName === "effect"
      )
      const typescriptEffectTask = effectTask(typescript)

      expect(typescriptEffect).toMatchObject({
        repositoryUrl: "https://github.com/Effect-TS/effect-smol.git",
        status: "matched",
        version: "4.0.0-beta.66",
        versionSource: "bun-lock"
      })
      expect(typescriptEffectTask).toMatchObject({
        action: "update",
        existingName: "effect-smol",
        primaryPackageName: "@effect/platform-bun",
        repositoryUrl: "https://github.com/Effect-TS/effect-smol.git",
        versions: {
          local: "@effect/platform-bun@4.0.0-beta.66 (bun-lock)",
          remote: "@effect/platform-bun@0.89.0 (npm latest)",
          status: "remote-drift",
          vendor: "@effect/platform-bun@4.0.0-beta.66 (vendored source)"
        }
      })

      for (const { args, command } of nativeBinaries) {
        const output = parseOutput(command, args)
        const effect = output.candidates.find((candidate) => candidate.packageName === "effect")

        expect(output.candidates.length).toBe(typescript.candidates.length)
        expect(output.tasks.length).toBe(typescript.tasks.length)
        expect(matchedCount(output)).toBe(matchedCount(typescript))
        expect(updateCount(output)).toBe(updateCount(typescript))
        expect(effectTask(output)).toEqual(typescriptEffectTask)

        expect(effect).toMatchObject({
          repositoryUrl: "https://github.com/Effect-TS/effect-smol.git",
          status: "matched",
          version: "4.0.0-beta.66",
          versionSource: "bun-lock"
        })
        expect(effect?.remoteVersion).toMatch(/^\d+\.\d+\.\d+/)
      }
    },
    60_000
  )
})
