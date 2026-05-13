import { Effect, Option } from "effect"

import { VENDOR_GLOB } from "../../common.ts"
import {
  absentReport,
  mergeYamlArrayItemsAtPath,
  optionalFile,
  report,
  writeMerged,
  yamlPathHasAnyArrayValue,
  type MonorepoToolDefinition,
  type SettingsMergeResult,
  type ToolFileContext
} from "../common.ts"

const CATEGORY = "package-managers"
const TOOL = "pnpm workspaces"

export const PNPM_VENDOR_EXCLUDE = `!${VENDOR_GLOB}`

export const mergePnpmWorkspaceText = (text = "{}\n"): SettingsMergeResult =>
  mergeYamlArrayItemsAtPath({
    items: [PNPM_VENDOR_EXCLUDE],
    path: ["packages"],
    requireExistingArray: true,
    text
  })

const doctorPnpm = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* optionalFile(context, cwd, "pnpm-workspace.yaml")
    if (Option.isNone(config)) return absentReport(TOOL)
    const ignored = yamlPathHasAnyArrayValue(
      config.value.content,
      ["packages"],
      [PNPM_VENDOR_EXCLUDE]
    )
    return report({
      configPath: config.value.absolutePath,
      detected: true,
      ignored,
      message: ignored
        ? "vendor excluded from workspace package discovery"
        : "vendor not excluded from workspace package discovery",
      status: ignored ? "configured" : "missing",
      tool: TOOL
    })
  })

const refreshPnpm = (context: ToolFileContext, cwd: string) =>
  optionalFile(context, cwd, "pnpm-workspace.yaml").pipe(
    Effect.flatMap((config) =>
      Option.match(config, {
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: (value) =>
          writeMerged(context, value.absolutePath, mergePnpmWorkspaceText(value.content))
      })
    )
  )

export const pnpmTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorPnpm,
  name: TOOL,
  refresh: refreshPnpm
}
