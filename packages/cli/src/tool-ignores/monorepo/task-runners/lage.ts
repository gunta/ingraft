import { doctorSimpleConfig, type MonorepoToolDefinition, type ToolFileContext } from "../common.ts"

const CATEGORY = "monorepo-task-runners"
const TOOL = "Lage"
const CONFIGS = ["lage.config.js", "lage.config.cjs", "lage.config.mjs", "lage.config.ts"] as const

const doctorLage = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Lage config",
    context,
    cwd,
    paths: CONFIGS,
    tool: TOOL,
    visibleMessage: "detected; source Lage configs are reported but not auto-written"
  })

export const lageTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorLage,
  name: TOOL
}
