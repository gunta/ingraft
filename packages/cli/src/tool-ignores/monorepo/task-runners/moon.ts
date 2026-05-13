import { Effect, Option } from "effect"

import {
  absentReport,
  firstExistingFile,
  mergeYamlArrayItemsAtPath,
  unsupportedReport,
  writeMerged,
  yamlPathHasAnyArrayValue,
  type MonorepoToolDefinition,
  type SettingsMergeResult,
  type ToolFileContext
} from "../common.ts"

const CATEGORY = "monorepo-task-runners"
const TOOL = "moon"
const VENDOR_IGNORE = "vendor/**"
const WORKSPACE_CONFIGS = [".moon/workspace.yml", ".moon/workspace.yaml"] as const

export const mergeMoonWorkspaceText = (text = "{}\n"): SettingsMergeResult =>
  mergeYamlArrayItemsAtPath({
    items: [VENDOR_IGNORE],
    path: ["hasher", "ignorePatterns"],
    text
  })

const moonWorkspace = (context: ToolFileContext, cwd: string) =>
  firstExistingFile(context, cwd, WORKSPACE_CONFIGS)

const doctorMoon = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* moonWorkspace(context, cwd)
    const moonDir = yield* context.fs.exists(context.path.resolve(cwd, ".moon"))
    if (Option.isNone(config) && !moonDir) return absentReport(TOOL)
    if (Option.isNone(config)) {
      return unsupportedReport({
        message: "detected .moon directory but no workspace YAML found",
        tool: TOOL
      })
    }
    const ignored = yamlPathHasAnyArrayValue(
      config.value.content,
      ["hasher", "ignorePatterns"],
      [VENDOR_IGNORE]
    )
    return {
      _tag: "ToolIgnoreReport" as const,
      configPath: config.value.absolutePath,
      detected: true,
      ignored,
      message: ignored
        ? "vendor ignored by hasher.ignorePatterns"
        : "vendor not ignored by hasher.ignorePatterns",
      status: ignored ? ("configured" as const) : ("missing" as const),
      tool: TOOL
    }
  })

const refreshMoon = (context: ToolFileContext, cwd: string) =>
  moonWorkspace(context, cwd).pipe(
    Effect.flatMap((config) =>
      Option.match(config, {
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: (value) =>
          writeMerged(context, value.absolutePath, mergeMoonWorkspaceText(value.content))
      })
    )
  )

export const moonTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorMoon,
  name: TOOL,
  refresh: refreshMoon
}
