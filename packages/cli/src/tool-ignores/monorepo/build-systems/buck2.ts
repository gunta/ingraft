import { doctorSimpleConfig, type MonorepoToolDefinition, type ToolFileContext } from "../common.ts"

const CATEGORY = "build-systems"
const TOOL = "Buck2"

const doctorBuck = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Buck config",
    context,
    cwd,
    paths: [".buckconfig"],
    tool: TOOL,
    visibleMessage: "detected; Buck cells/build config is reported but not auto-written"
  })

export const buckTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorBuck,
  name: TOOL
}
