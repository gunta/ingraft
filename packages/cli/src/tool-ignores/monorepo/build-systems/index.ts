import type { MonorepoToolCategory } from "../common.ts"
import { bazelTool } from "./bazel.ts"
import { buckTool } from "./buck2.ts"
import { gradleTool } from "./gradle.ts"
import { mavenTool } from "./maven.ts"
import { pantsTool } from "./pants.ts"
import { pleaseTool } from "./please.ts"

export { mergeBazelIgnoreText } from "./bazel.ts"

export const buildSystemTools: MonorepoToolCategory = {
  name: "build-systems",
  tools: [bazelTool, pantsTool, buckTool, gradleTool, mavenTool, pleaseTool]
}
