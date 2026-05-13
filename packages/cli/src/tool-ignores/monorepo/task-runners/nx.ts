import { Effect, Option } from "effect"

import {
  absentReport,
  completeMerge,
  ensureArrayItemsAtPath,
  firstExistingFile,
  initialSettingsState,
  jsoncConfigReport,
  packageHasDependency,
  parseSettings,
  unsupportedReport,
  writeMerged,
  type MonorepoToolDefinition,
  type SettingsMergeResult,
  type ToolFileContext
} from "../common.ts"

const CATEGORY = "monorepo-task-runners"
const TOOL = "Nx"
const VENDOR_INPUT = "!{workspaceRoot}/vendor/**"

export const mergeNxConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "nx.json", text })
  if (parsed._tag === "Invalid") return parsed
  return completeMerge(
    ensureArrayItemsAtPath({
      fallback: ["{projectRoot}/**/*"],
      items: [VENDOR_INPUT],
      path: ["namedInputs", "default"],
      state: initialSettingsState(parsed.source, parsed.value)
    })
  )
}

const doctorNx = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExistingFile(context, cwd, ["nx.json"])
    const dependency = yield* packageHasDependency(context, cwd, ["nx"])
    if (Option.isNone(config) && !dependency) return absentReport(TOOL)
    if (Option.isNone(config)) {
      return unsupportedReport({
        message: "detected in package.json but no nx.json found",
        tool: TOOL
      })
    }
    return jsoncConfigReport({
      config: config.value,
      ignored: config.value.content.includes(VENDOR_INPUT),
      missingMessage: "vendor not excluded from namedInputs.default",
      tool: TOOL
    })
  })

const refreshNx = (context: ToolFileContext, cwd: string) =>
  firstExistingFile(context, cwd, ["nx.json"]).pipe(
    Effect.flatMap((config) =>
      Option.match(config, {
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: (value) =>
          writeMerged(context, value.absolutePath, mergeNxConfigText(value.content))
      })
    )
  )

export const nxTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorNx,
  name: TOOL,
  refresh: refreshNx
}
