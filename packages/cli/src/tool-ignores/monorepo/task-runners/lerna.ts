import { doctorSimpleConfig, type MonorepoToolDefinition, type ToolFileContext } from "../common.ts"

const CATEGORY = "monorepo-task-runners"
const TOOL = "Lerna"

const doctorLerna = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Lerna/Nx config",
    context,
    cwd,
    paths: ["lerna.json"],
    tool: TOOL,
    visibleMessage: "detected; Lerna uses package workspaces and/or nx.json for task inputs"
  })

export const lernaTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorLerna,
  name: TOOL
}
