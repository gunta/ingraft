import { doctorSimpleConfig, type MonorepoToolDefinition, type ToolFileContext } from "../common.ts"

const CATEGORY = "build-systems"
const TOOL = "Gradle"
const MARKERS = [
  "settings.gradle",
  "settings.gradle.kts",
  "build.gradle",
  "build.gradle.kts"
] as const

const doctorGradle = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Gradle settings",
    context,
    cwd,
    paths: MARKERS,
    tool: TOOL,
    visibleMessage: "detected; Gradle project inclusion is reported but not auto-written"
  })

export const gradleTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorGradle,
  name: TOOL
}
