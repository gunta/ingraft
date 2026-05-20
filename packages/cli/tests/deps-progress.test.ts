import { describe, expect, test } from "bun:test"

import { dependencyScanDetail } from "../src/commands/deps.tsx"
import type { PackageDependency } from "../src/package-sync/service.ts"

const dependency = (name: string): PackageDependency => ({
  ecosystem: "npm",
  manifestPath: "package.json",
  name,
  section: "dependencies",
  spec: "^1.0.0"
})

describe("deps progress", () => {
  test("names the current dependency in scanning progress", () => {
    expect(dependencyScanDetail(dependency("effect"), 0, 18)).toBe("effect (1/18)")
    expect(dependencyScanDetail(dependency("@effect/platform-bun"), 1, 18)).toBe(
      "@effect/platform-bun (2/18)"
    )
  })
})
