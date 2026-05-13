import { Effect, Option } from "effect"

import { VENDOR_GLOB } from "../common.ts"
import {
  absentReport,
  completeMerge,
  doctorSimpleConfig,
  ensureArrayItemsAtPath,
  firstExistingFile,
  initialSettingsState,
  isRecord,
  jsoncConfigReport,
  mergeYamlArrayItemsAtPath,
  packageHasDependency,
  parseSettings,
  unsupportedReport,
  writeMerged,
  yamlPathHasAnyArrayValue,
  type MonorepoToolCategory,
  type SettingsMergeResult,
  type ToolFileContext
} from "./common.ts"

const CATEGORY = "monorepo-task-runners"

const TURBO_TOOL = "Turborepo"
const NX_TOOL = "Nx"
const MOON_TOOL = "moon"
const LERNA_TOOL = "Lerna"
const LAGE_TOOL = "Lage"

const TURBO_VENDOR_INPUT = `!$TURBO_ROOT$/${VENDOR_GLOB}`
const NX_VENDOR_INPUT = `!{workspaceRoot}/${VENDOR_GLOB}`
const MOON_VENDOR_IGNORE = VENDOR_GLOB

const TURBO_CONFIGS = ["turbo.json", "turbo.jsonc"] as const
const MOON_WORKSPACE_CONFIGS = [".moon/workspace.yml", ".moon/workspace.yaml"] as const
const LAGE_CONFIGS = [
  "lage.config.js",
  "lage.config.cjs",
  "lage.config.mjs",
  "lage.config.ts"
] as const

export const mergeTurboConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "turbo.json", text })
  if (parsed._tag === "Invalid") return parsed
  const tasks = parsed.value.tasks
  if (!isRecord(tasks)) return { _tag: "Unchanged" }

  const state = Object.entries(tasks).reduce(
    (current, [taskName, task]) => {
      if (!isRecord(task)) return current
      const fallback = Array.isArray(task.inputs) ? [] : ["$TURBO_DEFAULT$"]
      return ensureArrayItemsAtPath({
        fallback,
        items: [TURBO_VENDOR_INPUT],
        path: ["tasks", taskName, "inputs"],
        state: current
      })
    },
    initialSettingsState(parsed.source, parsed.value)
  )

  return completeMerge(state)
}

export const mergeNxConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "nx.json", text })
  if (parsed._tag === "Invalid") return parsed
  return completeMerge(
    ensureArrayItemsAtPath({
      fallback: ["{projectRoot}/**/*"],
      items: [NX_VENDOR_INPUT],
      path: ["namedInputs", "default"],
      state: initialSettingsState(parsed.source, parsed.value)
    })
  )
}

export const mergeMoonWorkspaceText = (text = "{}\n"): SettingsMergeResult =>
  mergeYamlArrayItemsAtPath({
    items: [MOON_VENDOR_IGNORE],
    path: ["hasher", "ignorePatterns"],
    text
  })

const turboConfig = (context: ToolFileContext, cwd: string) =>
  firstExistingFile(context, cwd, TURBO_CONFIGS)

const doctorTurbo = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* turboConfig(context, cwd)
    const dependency = yield* packageHasDependency(context, cwd, ["turbo"])
    if (Option.isNone(config) && !dependency) return absentReport(TURBO_TOOL)
    if (Option.isNone(config)) {
      return unsupportedReport({
        message: "detected in package.json but no turbo.json/turbo.jsonc found",
        tool: TURBO_TOOL
      })
    }
    return jsoncConfigReport({
      config: config.value,
      ignored: config.value.content.includes(TURBO_VENDOR_INPUT),
      missingMessage: "vendor not excluded from task inputs",
      tool: TURBO_TOOL
    })
  })

const refreshTurbo = (context: ToolFileContext, cwd: string) =>
  turboConfig(context, cwd).pipe(
    Effect.flatMap((config) =>
      Option.match(config, {
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: (value) =>
          writeMerged(context, value.absolutePath, mergeTurboConfigText(value.content))
      })
    )
  )

const doctorNx = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExistingFile(context, cwd, ["nx.json"])
    const dependency = yield* packageHasDependency(context, cwd, ["nx"])
    if (Option.isNone(config) && !dependency) return absentReport(NX_TOOL)
    if (Option.isNone(config)) {
      return unsupportedReport({
        message: "detected in package.json but no nx.json found",
        tool: NX_TOOL
      })
    }
    return jsoncConfigReport({
      config: config.value,
      ignored: config.value.content.includes(NX_VENDOR_INPUT),
      missingMessage: "vendor not excluded from namedInputs.default",
      tool: NX_TOOL
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

const moonWorkspace = (context: ToolFileContext, cwd: string) =>
  firstExistingFile(context, cwd, MOON_WORKSPACE_CONFIGS)

const doctorMoon = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* moonWorkspace(context, cwd)
    const moonDir = yield* context.fs.exists(context.path.resolve(cwd, ".moon"))
    if (Option.isNone(config) && !moonDir) return absentReport(MOON_TOOL)
    if (Option.isNone(config)) {
      return unsupportedReport({
        message: "detected .moon directory but no workspace YAML found",
        tool: MOON_TOOL
      })
    }
    const ignored = yamlPathHasAnyArrayValue(
      config.value.content,
      ["hasher", "ignorePatterns"],
      [MOON_VENDOR_IGNORE]
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
      tool: MOON_TOOL
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

const doctorLerna = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Lerna/Nx config",
    context,
    cwd,
    paths: ["lerna.json"],
    tool: LERNA_TOOL,
    visibleMessage: "detected; Lerna uses package workspaces and/or nx.json for task inputs"
  })

const doctorLage = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Lage config",
    context,
    cwd,
    paths: LAGE_CONFIGS,
    tool: LAGE_TOOL,
    visibleMessage: "detected; source Lage configs are reported but not auto-written"
  })

export const taskRunnerTools: MonorepoToolCategory = {
  name: CATEGORY,
  tools: [
    {
      category: CATEGORY,
      doctor: doctorTurbo,
      name: TURBO_TOOL,
      refresh: refreshTurbo
    },
    {
      category: CATEGORY,
      doctor: doctorNx,
      name: NX_TOOL,
      refresh: refreshNx
    },
    {
      category: CATEGORY,
      doctor: doctorMoon,
      name: MOON_TOOL,
      refresh: refreshMoon
    },
    {
      category: CATEGORY,
      doctor: doctorLerna,
      name: LERNA_TOOL
    },
    {
      category: CATEGORY,
      doctor: doctorLage,
      name: LAGE_TOOL
    }
  ]
}
