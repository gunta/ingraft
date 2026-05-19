import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { BENCHMARK_OPERATIONS } from "../../../scripts/benchmark.ts"

const workspaceRoot = join(import.meta.dir, "../../..")

interface PackageJson {
  readonly name?: string
  readonly scripts?: Record<string, string>
}

const readJson = async <A>(path: string): Promise<A> =>
  JSON.parse(await Bun.file(join(workspaceRoot, path)).text()) as A

describe("optimized deps PoC", () => {
  test("adds a workspace package with Rust and Zig deps-json entrypoints", async () => {
    const rootPackage = await readJson<PackageJson>("package.json")
    const optimizedPackage = await readJson<PackageJson>("packages/optimized/package.json")

    expect(rootPackage.scripts?.["bench:optimized-deps"]).toBe(
      "bun packages/optimized/scripts/benchmark.ts"
    )
    expect(optimizedPackage.name).toBe("ingraft-optimized")
    expect(optimizedPackage.scripts?.["build:rust"]).toContain("cargo build --release")
    expect(optimizedPackage.scripts?.["build:zig"]).toContain("zig build")
    expect(optimizedPackage.scripts?.["deps:rust"]).toContain("ingraft-deps-rust")
    expect(optimizedPackage.scripts?.["deps:zig"]).toContain("ingraft-deps-zig")

    expect(existsSync(join(workspaceRoot, "packages/optimized/rust/Cargo.toml"))).toBe(true)
    expect(existsSync(join(workspaceRoot, "packages/optimized/zig/build.zig"))).toBe(true)
  })

  test("registers TS, Rust, and Zig deps-json benchmark operations", () => {
    const operations = BENCHMARK_OPERATIONS.map(
      (operation) => [operation.name, operation.command] as const
    )

    expect(operations).toContainEqual([
      "cli-deps-json",
      "bun packages/cli/scripts/vendor.ts deps --json"
    ])
    expect(operations).toContainEqual([
      "optimized-deps-rust-json",
      "packages/optimized/rust/target/release/ingraft-deps-rust --root ."
    ])
    expect(operations).toContainEqual([
      "optimized-deps-zig-json",
      "packages/optimized/zig/zig-out/bin/ingraft-deps-zig --root ."
    ])
  })
})
