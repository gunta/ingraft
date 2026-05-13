import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { tomlHasPath, tomlPathHasAnyArrayValue } from "../../config/toml.ts"
import {
  VENDOR_DIR,
  firstExisting,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Ruff"
const CONFIG_CANDIDATES = ["ruff.toml", ".ruff.toml", "pyproject.toml"] as const
const VENDOR_PATTERNS = [VENDOR_DIR, "vendor/**"] as const

const configMentionsRuff = (path: string, content: string): Effect.Effect<boolean> =>
  path.endsWith("pyproject.toml")
    ? tomlHasPath(content, ["tool", "ruff"]).pipe(Effect.orElseSucceed(() => false))
    : Effect.succeed(true)

const ruffConfigPath = (path: string): ReadonlyArray<string> =>
  path.endsWith("pyproject.toml") ? ["tool", "ruff"] : []

const ruffConfigIgnoresVendor = (path: string, content: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const base = ruffConfigPath(path)
    const exclude = yield* tomlPathHasAnyArrayValue(
      content,
      [...base, "exclude"],
      VENDOR_PATTERNS
    ).pipe(Effect.orElseSucceed(() => false))
    if (exclude) return true
    return yield* tomlPathHasAnyArrayValue(
      content,
      [...base, "extend-exclude"],
      VENDOR_PATTERNS
    ).pipe(Effect.orElseSucceed(() => false))
  })

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, CONFIG_CANDIDATES)
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
    if (!(yield* configMentionsRuff(config.value, content))) {
      return report({
        detected: false,
        ignored: false,
        message: "pyproject.toml found but no [tool.ruff] section",
        status: "absent",
        tool: TOOL
      })
    }

    const ignored = yield* ruffConfigIgnoresVendor(config.value, content)
    return report({
      configPath: config.value,
      detected: true,
      ignored,
      message: ignored
        ? "vendor appears in Ruff config"
        : "detected; TOML merge is reported but not auto-written",
      status: ignored ? "configured" : "unsupported",
      tool: TOOL
    })
  })

export class RuffIgnore extends Context.Service<RuffIgnore, ToolIgnoreIntegration>()(
  "ingraft/RuffIgnore"
) {}

export const RuffIgnoreLive = Layer.effect(
  RuffIgnore,
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
