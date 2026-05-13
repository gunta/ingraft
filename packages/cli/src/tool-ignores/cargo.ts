import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import { tomlPathHasAnyArrayValue } from "../config/toml.ts"
import {
  VENDOR_DIR,
  firstExisting,
  report,
  type ToolFileContext
} from "./common.ts"

const TOOL = "Cargo/Rust"
const VENDOR_PATTERNS = [VENDOR_DIR, "vendor/*"] as const

const cargoManifestIgnoresVendor = (content: string): boolean =>
  tomlPathHasAnyArrayValue(content, ["workspace", "exclude"], VENDOR_PATTERNS) ||
  tomlPathHasAnyArrayValue(content, ["package", "exclude"], VENDOR_PATTERNS)

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, ["Cargo.toml"])
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
    const ignored = cargoManifestIgnoresVendor(content)
    return report({
      configPath: config.value,
      detected: true,
      ignored,
      message: ignored
        ? "vendor appears in Cargo manifest"
        : "detected; no generated Cargo workspace edit is applied",
      status: ignored ? "configured" : "visible",
      tool: TOOL
    })
  })

export class CargoIgnore extends Effect.Service<CargoIgnore>()(
  "vendor-subtree/CargoIgnore",
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
