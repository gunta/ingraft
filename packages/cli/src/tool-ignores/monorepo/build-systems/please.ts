import { doctorSimpleConfig, type MonorepoToolDefinition, type ToolFileContext } from "../common.ts"

const CATEGORY = "build-systems"
const TOOL = "Please"
const MARKERS = [".plzconfig"] as const

const doctorPlease = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Please config",
    context,
    cwd,
    paths: MARKERS,
    tool: TOOL,
    visibleMessage: "detected; Please build config is reported but not auto-written"
  })

export const pleaseTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorPlease,
  name: TOOL
}
