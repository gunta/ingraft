import type { MonorepoToolCategory } from "../common.ts"
import { packageWorkspacesTool } from "./package-workspaces.ts"
import { pnpmTool } from "./pnpm.ts"
import { rushTool } from "./rush.ts"

export { mergePnpmWorkspaceText } from "./pnpm.ts"

export const packageManagerTools: MonorepoToolCategory = {
  name: "package-managers",
  tools: [pnpmTool, packageWorkspacesTool, rushTool]
}
