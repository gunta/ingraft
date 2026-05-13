import { Effect, Option } from "effect"

import {
  absentReport,
  packageManagerName,
  packageWorkspacesIgnoreVendor,
  report,
  rootPackageHasWorkspaces,
  type MonorepoToolDefinition,
  type ToolFileContext
} from "../common.ts"
import { PNPM_VENDOR_EXCLUDE } from "./pnpm.ts"

const CATEGORY = "package-managers"
const TOOL = "package workspaces"

const doctorPackageWorkspaces = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const detected = yield* rootPackageHasWorkspaces(context, cwd)
    if (!detected) return absentReport(TOOL)
    const manager = yield* packageManagerName(context, cwd)
    const ignored = yield* packageWorkspacesIgnoreVendor(context, cwd, PNPM_VENDOR_EXCLUDE)
    const managerName = Option.getOrElse(manager, () => "package manager")
    return report({
      detected: true,
      ignored,
      message: ignored
        ? `vendor excluded from ${managerName} workspace globs`
        : "workspace globs detected; vendor exclusion is reported but not auto-written",
      status: ignored ? "configured" : "visible",
      tool: TOOL
    })
  })

export const packageWorkspacesTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorPackageWorkspaces,
  name: TOOL
}
