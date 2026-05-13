import type { MonorepoToolCategory } from "../common.ts"
import { lageTool } from "./lage.ts"
import { lernaTool } from "./lerna.ts"
import { moonTool } from "./moon.ts"
import { nxTool } from "./nx.ts"
import { turboTool } from "./turbo.ts"

export { mergeMoonWorkspaceText } from "./moon.ts"
export { mergeNxConfigText } from "./nx.ts"
export { mergeTurboConfigText } from "./turbo.ts"

export const taskRunnerTools: MonorepoToolCategory = {
  name: "monorepo-task-runners",
  tools: [turboTool, nxTool, moonTool, lernaTool, lageTool]
}
