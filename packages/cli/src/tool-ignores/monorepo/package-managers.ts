import { Effect, Option } from "effect"

import { VENDOR_GLOB } from "../common.ts"
import {
  absentReport,
  doctorSimpleConfig,
  mergeYamlArrayItemsAtPath,
  optionalFile,
  packageManagerName,
  packageWorkspacesIgnoreVendor,
  report,
  rootPackageHasWorkspaces,
  writeMerged,
  yamlPathHasAnyArrayValue,
  type MonorepoToolCategory,
  type SettingsMergeResult,
  type ToolFileContext
} from "./common.ts"

const CATEGORY = "package-managers"

const PNPM_TOOL = "pnpm workspaces"
const PACKAGE_WORKSPACES_TOOL = "package workspaces"
const RUSH_TOOL = "Rush"

const PNPM_VENDOR_EXCLUDE = `!${VENDOR_GLOB}`

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
    if (Option.isNone(config)) return absentReport(PNPM_TOOL)
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
      tool: PNPM_TOOL
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

const doctorPackageWorkspaces = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const detected = yield* rootPackageHasWorkspaces(context, cwd)
    if (!detected) return absentReport(PACKAGE_WORKSPACES_TOOL)
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
      tool: PACKAGE_WORKSPACES_TOOL
    })
  })

const doctorRush = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Rush config",
    context,
    cwd,
    paths: ["rush.json"],
    tool: RUSH_TOOL,
    visibleMessage:
      "detected; per-project rush-project.json ignores are reported but not auto-written"
  })

export const packageManagerTools: MonorepoToolCategory = {
  name: CATEGORY,
  tools: [
    {
      category: CATEGORY,
      doctor: doctorPnpm,
      name: PNPM_TOOL,
      refresh: refreshPnpm
    },
    {
      category: CATEGORY,
      doctor: doctorPackageWorkspaces,
      name: PACKAGE_WORKSPACES_TOOL
    },
    {
      category: CATEGORY,
      doctor: doctorRush,
      name: RUSH_TOOL
    }
  ]
}
