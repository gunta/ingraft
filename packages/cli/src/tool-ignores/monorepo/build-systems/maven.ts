import { Effect, Option } from "effect"

import {
  absentReport,
  optionalFile,
  unsupportedReport,
  type MonorepoToolDefinition,
  type ToolFileContext
} from "../common.ts"

const CATEGORY = "build-systems"
const TOOL = "Maven reactor"

const doctorMaven = (context: ToolFileContext, cwd: string) =>
  optionalFile(context, cwd, "pom.xml").pipe(
    Effect.map((config) =>
      Option.match(config, {
        onNone: () => absentReport(TOOL),
        onSome: (value) => {
          const detected = value.content.includes("<modules>")
          if (!detected) return absentReport(TOOL)
          return unsupportedReport({
            configPath: value.absolutePath,
            message: "Maven reactor detected; no standard vendor ignore config is applied",
            tool: TOOL
          })
        }
      })
    )
  )

export const mavenTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorMaven,
  name: TOOL
}
