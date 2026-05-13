import { describe, expect, test } from "bun:test"
import { renderDoctorReport } from "../src/commands/doctor.ts"
import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"

describe("vendor doctor", () => {
  test("renders vendored repos and tool ignore status", () => {
    const output = renderDoctorReport({
      cwd: "/workspace",
      repos: [
        {
          name: "effect",
          prefix: "vendor/effect",
          url: "https://github.com/Effect-TS/effect.git",
          ref: "main",
          strategy: "subtree",
          filter: EMPTY_VENDOR_FILTER,
          sha: "sha",
          date: "date"
        }
      ],
      agentFiles: [
        {
          _tag: "ProjectSurfaceReport",
          kind: "agent",
          message: "managed vendor section present",
          name: "AGENTS.md",
          path: "/workspace/AGENTS.md",
          present: true,
          status: "managed"
        }
      ],
      editorFiles: [
        {
          _tag: "ProjectSurfaceReport",
          kind: "editor",
          message: "vendor settings present",
          name: "VS Code settings",
          path: "/workspace/.vscode/settings.json",
          present: true,
          status: "configured"
        }
      ],
      toolReports: [
        {
          _tag: "ToolIgnoreReport",
          configPath: "/workspace/biome.jsonc",
          detected: true,
          ignored: true,
          message: "vendor ignored by files.includes",
          status: "configured",
          tool: "Biome"
        },
        {
          _tag: "ToolIgnoreReport",
          detected: false,
          ignored: false,
          message: "not detected",
          status: "absent",
          tool: "Pyright"
        }
      ],
      json: false
    })

    expect(output).toContain("vendor_dir: vendor/")
    expect(output).toContain("effect")
    expect(output).toContain("agent files:")
    expect(output).toContain("AGENTS.md")
    expect(output).toContain("editor files:")
    expect(output).toContain("VS Code settings")
    expect(output).toContain("Biome")
    expect(output).toContain("configured")
    expect(output).toContain("Pyright")
    expect(output).toContain("absent")
  })

  test("renders project surfaces in json output", () => {
    const output = renderDoctorReport({
      cwd: "/workspace",
      repos: [],
      agentFiles: [
        {
          _tag: "ProjectSurfaceReport",
          kind: "agent",
          message: "managed vendor section present",
          name: "AGENTS.md",
          path: "/workspace/AGENTS.md",
          present: true,
          status: "managed"
        }
      ],
      editorFiles: [],
      toolReports: [],
      json: true
    })

    expect(JSON.parse(output)).toMatchObject({
      agent_files: [
        {
          name: "AGENTS.md",
          present: true,
          status: "managed"
        }
      ],
      editor_files: []
    })
  })
})
