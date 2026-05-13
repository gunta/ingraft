import { Effect, Option } from "effect"

import {
  configuredOrVisibleReport,
  firstExisting,
  hasVendorPattern,
  mergeManagedIgnoreSection,
  optionalFile,
  report,
  VENDOR_DIR,
  type MonorepoToolDefinition,
  type ToolFileContext
} from "../common.ts"

const CATEGORY = "build-systems"
const TOOL = "Bazel"
const MARKERS = [
  "MODULE.bazel",
  "WORKSPACE",
  "WORKSPACE.bazel",
  ".bazelrc",
  ".bazelversion",
  "BUILD.bazel"
] as const

export const mergeBazelIgnoreText = (content: string): string =>
  mergeManagedIgnoreSection({
    begin: "# vendor-subtree begin",
    content,
    end: "# vendor-subtree end",
    lines: [VENDOR_DIR]
  })

const bazelDetected = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, MARKERS).pipe(Effect.map(Option.isSome))

const doctorBazel = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const detected = yield* bazelDetected(context, cwd)
    const config = yield* optionalFile(context, cwd, ".bazelignore")
    if (!detected && Option.isNone(config)) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }
    if (Option.isNone(config)) {
      return report({
        detected: true,
        ignored: false,
        message: "Bazel detected; .bazelignore can be generated",
        status: "missing",
        tool: TOOL
      })
    }
    const ignored = hasVendorPattern(config.value.content, [VENDOR_DIR])
    return configuredOrVisibleReport({
      configPath: config.value.absolutePath,
      ignored,
      message: ignored ? "vendor ignored by .bazelignore" : "vendor not ignored by .bazelignore",
      tool: TOOL
    })
  })

const refreshBazel = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    if (!(yield* bazelDetected(context, cwd))) return Option.none<string>()
    const target = context.path.resolve(cwd, ".bazelignore")
    const current = yield* context.fs.readFileString(target).pipe(Effect.orElseSucceed(() => ""))
    const next = mergeBazelIgnoreText(current)
    if (next === current) return Option.none<string>()
    yield* context.fs.writeFileString(target, next)
    return Option.some(target)
  })

export const bazelTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorBazel,
  name: TOOL,
  refresh: refreshBazel
}
