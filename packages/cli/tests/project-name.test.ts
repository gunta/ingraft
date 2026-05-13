import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const workspaceRoot = process.cwd()

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Bun.file(join(workspaceRoot, path)).text()) as T

type PackageJson = {
  readonly name: string
}

describe("project naming", () => {
  test("uses vendor-subtree as the project name", async () => {
    const rootPackage = await readJson<PackageJson>("package.json")
    const skillPackage = await readJson<PackageJson>("packages/skill/package.json")
    const rootSkill = await Bun.file(join(workspaceRoot, "SKILL.md")).text()
    const packagedSkill = await Bun.file(join(workspaceRoot, "packages/skill/SKILL.md")).text()

    expect(rootPackage.name).toBe("vendor-subtree")
    expect(skillPackage.name).toBe("@vendor-subtree/skill")
    expect(rootSkill).toContain("name: vendor-subtree")
    expect(packagedSkill).toContain("name: vendor-subtree")

    for (const text of [rootSkill, packagedSkill]) {
      expect(text).not.toContain("vendor-subtree-skill")
    }
  })
})
