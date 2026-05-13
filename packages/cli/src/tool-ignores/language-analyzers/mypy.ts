import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { tomlHasPath } from "../../config/toml.ts"
import {
  firstExisting,
  hasVendorPattern,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "mypy"
const CONFIG_CANDIDATES = ["mypy.ini", ".mypy.ini", "setup.cfg", "pyproject.toml"] as const

const configPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, CONFIG_CANDIDATES)

const configMentionsMypy = (path: string, content: string): Effect.Effect<boolean> =>
  path.endsWith("pyproject.toml")
    ? tomlHasPath(content, ["tool", "mypy"]).pipe(Effect.orElseSucceed(() => false))
    : Effect.sync(() => /^\s*\[mypy[^\]]*\]/m.test(content))

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* configPath(context, cwd)
    if (Option.isNone(config)) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const content = yield* context.fs.readFileString(config.value)
    if (!(yield* configMentionsMypy(config.value, content))) {
      return report({
        configPath: config.value,
        detected: false,
        ignored: false,
        message: "config found but no mypy section",
        status: "absent",
        tool: TOOL
      })
    }

    const ignored = hasVendorPattern(content)
    return report({
      configPath: config.value,
      detected: true,
      ignored,
      message: ignored
        ? "vendor appears in mypy config"
        : "detected; INI/TOML merge is reported but not auto-written",
      status: ignored ? "configured" : "unsupported",
      tool: TOOL
    })
  })

export class MypyIgnore extends Context.Service<MypyIgnore, ToolIgnoreIntegration>()(
  "ingraft/MypyIgnore"
) {}

export const MypyIgnoreLive = Layer.effect(
  MypyIgnore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const context = { fs, path }
    return {
      doctor: (cwd: string) => doctorWith(context, cwd),
      refresh: (_cwd: string) => Effect.succeed(Option.none<string>())
    }
  })
)
