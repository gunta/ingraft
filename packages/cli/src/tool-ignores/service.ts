import { Array as Arr, Effect } from "effect"
import { BiomeIgnore } from "./biome.ts"
import { CspellIgnore } from "./cspell.ts"
import { EslintIgnore } from "./eslint.ts"
import { GolangciLintIgnore } from "./golangci-lint.ts"
import { MarkdownlintIgnore } from "./markdownlint.ts"
import { MypyIgnore } from "./mypy.ts"
import { OxlintIgnore } from "./oxlint.ts"
import { PrettierIgnore } from "./prettier.ts"
import { PyrightIgnore } from "./pyright.ts"
import { RuffIgnore } from "./ruff.ts"
import { StylelintIgnore } from "./stylelint.ts"
import { TypeScriptIgnore } from "./typescript.ts"
import { CargoIgnore } from "./cargo.ts"
import { ZigIgnore } from "./zig.ts"

export interface RefreshToolIgnoresParams {
  readonly cwd: string
}

export class ToolIgnores extends Effect.Service<ToolIgnores>()(
  "vendor-subtree/ToolIgnores",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const biome = yield* BiomeIgnore
      const cspell = yield* CspellIgnore
      const eslint = yield* EslintIgnore
      const golangciLint = yield* GolangciLintIgnore
      const markdownlint = yield* MarkdownlintIgnore
      const mypy = yield* MypyIgnore
      const oxlint = yield* OxlintIgnore
      const prettier = yield* PrettierIgnore
      const pyright = yield* PyrightIgnore
      const ruff = yield* RuffIgnore
      const stylelint = yield* StylelintIgnore
      const typescript = yield* TypeScriptIgnore
      const cargo = yield* CargoIgnore
      const zig = yield* ZigIgnore
      const tools = [
        biome,
        cspell,
        eslint,
        golangciLint,
        markdownlint,
        mypy,
        oxlint,
        prettier,
        pyright,
        ruff,
        stylelint,
        typescript,
        cargo,
        zig
      ] as const

      return {
        doctor: ({ cwd }: RefreshToolIgnoresParams) =>
          Effect.all(
            tools.map((tool) => tool.doctor(cwd)),
            { concurrency: tools.length }
          ),
        refresh: ({ cwd }: RefreshToolIgnoresParams) =>
          Effect.all(
            tools.map((tool) => tool.refresh(cwd)),
            { concurrency: tools.length }
          ).pipe(Effect.map(Arr.getSomes))
      }
    })
  }
) {}
