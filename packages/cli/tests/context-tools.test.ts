import { describe, expect, test } from "bun:test"

import {
  contextPackPlan,
  contextSourcePlan,
  detectContextToolsFromProject
} from "../src/context-tools/service.ts"

describe("context tools", () => {
  test("detects the curated optional context tools from repo files and dependencies", () => {
    const tools = detectContextToolsFromProject({
      files: ["repomix.config.json", ".cursor/mcp.json"],
      packageJson: JSON.stringify({
        devDependencies: {
          opensrc: "^0.1.0",
          repobase: "^0.2.0"
        }
      })
    })

    expect(
      tools.map((tool) => ({
        id: tool.id,
        detected: tool.detected,
        status: tool.status
      }))
    ).toEqual([
      { id: "repomix", detected: true, status: "configured" },
      { id: "opensrc", detected: true, status: "installed" },
      { id: "repobase", detected: true, status: "installed" }
    ])
  })

  test("builds wrapper commands without adding ingraft config state", () => {
    expect(contextPackPlan({ compress: true, paths: [] })).toEqual({
      command: "npx",
      args: ["-y", "repomix@latest", "vendor", "--compress"],
      label: "Repomix pack"
    })

    expect(contextSourcePlan({ target: "zod" })).toEqual({
      command: "npx",
      args: ["-y", "opensrc@latest", "path", "zod"],
      label: "OpenSrc path"
    })
  })
})
