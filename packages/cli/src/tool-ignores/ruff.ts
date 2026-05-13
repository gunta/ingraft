import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import {
  tomlHasPath,
  tomlPathHasAnyArrayValue
} from "../config/toml.ts"
import {
  VENDOR_DIR,
  firstExisting,
  report,
  type ToolFileContext
} from "./common.ts"

const TOOL = "Ruff"
const CONFIG_CANDIDATES = ["ruff.toml", ".ruff.toml", "pyproject.toml"] as const
const VENDOR_PATTERNS = [VENDOR_DIR, "vendor/**"] as const

const configMentionsRuff = (path: string, content: string): boolean =>
  !path.endsWith("pyproject.toml") || tomlHasPath(content, ["tool", "ruff"])

const ruffConfigPath = (path: string): ReadonlyArray<string> =>
  path.endsWith("pyproject.toml") ? ["tool", "ruff"] : []

const ruffConfigIgnoresVendor = (path: string, content: string): boolean => {
  const base = ruffConfigPath(path)
  return (
    tomlPathHasAnyArrayValue(content, [...base, "exclude"], VENDOR_PATTERNS) ||
    tomlPathHasAnyArrayValue(content, [...base, "extend-exclude"], VENDOR_PATTERNS)
  )
}

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
    if (!configMentionsRuff(config.value, content)) {
      return report({
        detected: false,
        ignored: false,
        message: "pyproject.toml found but no [tool.ruff] section",
        status: "absent",
        tool: TOOL
      })
    }

    const ignored = ruffConfigIgnoresVendor(config.value, content)
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

export class RuffIgnore extends Effect.Service<RuffIgnore>()(
  "vendor-subtree/RuffIgnore",
  {
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
  }
) {}
