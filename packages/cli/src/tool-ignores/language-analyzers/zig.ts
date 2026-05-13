import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"

import { firstExisting, report, type ToolFileContext } from "../common.ts"

const TOOL = "Zig"

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, ["build.zig", "build.zig.zon"])
    if (Option.isNone(config)) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    return report({
      configPath: config.value,
      detected: true,
      ignored: false,
      message: "detected; no standard generated ignore config is applied",
      status: "visible",
      tool: TOOL
    })
  })

export class ZigIgnore extends Effect.Service<ZigIgnore>()("ingraft/ZigIgnore", {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const context = { fs, path }
    return {
      doctor: (cwd: string) => doctorWith(context, cwd),
      refresh: (_cwd: string) => Effect.succeed(Option.none<string>())
    }
  })
}) {}
