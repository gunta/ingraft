import { Effect, Option } from "effect"

import {
  absentReport,
  configuredOrVisibleReport,
  doctorSimpleConfig,
  firstExisting,
  hasVendorPattern,
  mergeManagedIgnoreSection,
  optionalFile,
  report,
  unsupportedReport,
  VENDOR_DIR,
  type MonorepoToolCategory,
  type ToolFileContext
} from "./common.ts"

const CATEGORY = "build-systems"

const BAZEL_TOOL = "Bazel"
const PANTS_TOOL = "Pants"
const BUCK_TOOL = "Buck2"
const GRADLE_TOOL = "Gradle"
const MAVEN_TOOL = "Maven reactor"
const PLEASE_TOOL = "Please"

const BAZEL_MARKERS = [
  "MODULE.bazel",
  "WORKSPACE",
  "WORKSPACE.bazel",
  ".bazelrc",
  ".bazelversion",
  "BUILD.bazel"
] as const
const GRADLE_MARKERS = [
  "settings.gradle",
  "settings.gradle.kts",
  "build.gradle",
  "build.gradle.kts"
] as const
const PLEASE_MARKERS = [".plzconfig"] as const

export const mergeBazelIgnoreText = (content: string): string =>
  mergeManagedIgnoreSection({
    begin: "# vendor-subtree begin",
    content,
    end: "# vendor-subtree end",
    lines: [VENDOR_DIR]
  })

const bazelDetected = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, BAZEL_MARKERS).pipe(Effect.map(Option.isSome))

const doctorBazel = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const detected = yield* bazelDetected(context, cwd)
    const config = yield* optionalFile(context, cwd, ".bazelignore")
    if (!detected && Option.isNone(config)) return absentReport(BAZEL_TOOL)
    if (Option.isNone(config)) {
      return report({
        detected: true,
        ignored: false,
        message: "Bazel detected; .bazelignore can be generated",
        status: "missing",
        tool: BAZEL_TOOL
      })
    }
    const ignored = hasVendorPattern(config.value.content, [VENDOR_DIR])
    return configuredOrVisibleReport({
      configPath: config.value.absolutePath,
      ignored,
      message: ignored ? "vendor ignored by .bazelignore" : "vendor not ignored by .bazelignore",
      tool: BAZEL_TOOL
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

const doctorMaven = (context: ToolFileContext, cwd: string) =>
  optionalFile(context, cwd, "pom.xml").pipe(
    Effect.map((config) =>
      Option.match(config, {
        onNone: () => absentReport(MAVEN_TOOL),
        onSome: (value) => {
          const detected = value.content.includes("<modules>")
          if (!detected) return absentReport(MAVEN_TOOL)
          return unsupportedReport({
            configPath: value.absolutePath,
            message: "Maven reactor detected; no standard vendor ignore config is applied",
            tool: MAVEN_TOOL
          })
        }
      })
    )
  )

const doctorPants = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Pants ignore config",
    context,
    cwd,
    paths: ["pants.toml"],
    tool: PANTS_TOOL,
    visibleMessage: "detected; pants_ignore is reported but not auto-written"
  })

const doctorBuck = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Buck config",
    context,
    cwd,
    paths: [".buckconfig"],
    tool: BUCK_TOOL,
    visibleMessage: "detected; Buck cells/build config is reported but not auto-written"
  })

const doctorGradle = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Gradle settings",
    context,
    cwd,
    paths: GRADLE_MARKERS,
    tool: GRADLE_TOOL,
    visibleMessage: "detected; Gradle project inclusion is reported but not auto-written"
  })

const doctorPlease = (context: ToolFileContext, cwd: string) =>
  doctorSimpleConfig({
    configuredMessage: "vendor appears in Please config",
    context,
    cwd,
    paths: PLEASE_MARKERS,
    tool: PLEASE_TOOL,
    visibleMessage: "detected; Please build config is reported but not auto-written"
  })

export const buildSystemTools: MonorepoToolCategory = {
  name: CATEGORY,
  tools: [
    {
      category: CATEGORY,
      doctor: doctorBazel,
      name: BAZEL_TOOL,
      refresh: refreshBazel
    },
    {
      category: CATEGORY,
      doctor: doctorPants,
      name: PANTS_TOOL
    },
    {
      category: CATEGORY,
      doctor: doctorBuck,
      name: BUCK_TOOL
    },
    {
      category: CATEGORY,
      doctor: doctorGradle,
      name: GRADLE_TOOL
    },
    {
      category: CATEGORY,
      doctor: doctorMaven,
      name: MAVEN_TOOL
    },
    {
      category: CATEGORY,
      doctor: doctorPlease,
      name: PLEASE_TOOL
    }
  ]
}
