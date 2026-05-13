import { describe, expect, test } from "bun:test"

import { classifyAddTarget } from "../src/commands/add.ts"

describe("add target parsing", () => {
  test("treats hosted repository inputs as repository targets", () => {
    expect(classifyAddTarget("Effect-TS/effect")).toEqual({
      _tag: "RepositoryTarget",
      input: "Effect-TS/effect",
      url: "https://github.com/Effect-TS/effect.git"
    })
    expect(classifyAddTarget("https://gitlab.com/gitlab-org/cli.git")).toEqual({
      _tag: "RepositoryTarget",
      input: "https://gitlab.com/gitlab-org/cli.git",
      url: "https://gitlab.com/gitlab-org/cli.git"
    })
  })

  test("treats npm package names as package targets", () => {
    expect(classifyAddTarget("zod")).toEqual({
      _tag: "PackageTarget",
      input: "zod",
      packageName: "zod"
    })
    expect(classifyAddTarget("@types/node")).toEqual({
      _tag: "PackageTarget",
      input: "@types/node",
      packageName: "@types/node"
    })
  })
})
