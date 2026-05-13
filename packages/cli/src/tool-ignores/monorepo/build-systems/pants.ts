import { doctorSimpleConfig, type MonorepoToolDefinition, type ToolFileContext } from "../common.ts"

const CATEGORY = "build-systems"
const TOOL = "Pants"

const doctorPants = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Pants ignore config",
    context,
    cwd,
    paths: ["pants.toml"],
    tool: TOOL,
    visibleMessage: "detected; pants_ignore is reported but not auto-written"
  })

export const pantsTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorPants,
  name: TOOL
}
