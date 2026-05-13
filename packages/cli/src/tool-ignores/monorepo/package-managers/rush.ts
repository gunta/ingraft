import { doctorSimpleConfig, type MonorepoToolDefinition, type ToolFileContext } from "../common.ts"

const CATEGORY = "package-managers"
const TOOL = "Rush"

const doctorRush = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Rush config",
    context,
    cwd,
    paths: ["rush.json"],
    tool: TOOL,
    visibleMessage:
      "detected; per-project rush-project.json ignores are reported but not auto-written"
  })

export const rushTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorRush,
  name: TOOL
}
