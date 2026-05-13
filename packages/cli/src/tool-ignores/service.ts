import { Effect } from "effect"

import { BiomeIgnore } from "./biome.ts"
import { CargoIgnore } from "./cargo.ts"
import {
  doctorToolCategories,
  refreshToolCategories,
  type ToolIgnoreCategory
} from "./categories.ts"
import { CspellIgnore } from "./cspell.ts"
import { EslintIgnore } from "./eslint.ts"
import { GolangciLintIgnore } from "./golangci-lint.ts"
import { MarkdownlintIgnore } from "./markdownlint.ts"
import { MonorepoTools } from "./monorepo.ts"
import { MypyIgnore } from "./mypy.ts"
import { OxlintIgnore } from "./oxlint.ts"
import { PrettierIgnore } from "./prettier.ts"
import { PyrightIgnore } from "./pyright.ts"
import { RuffIgnore } from "./ruff.ts"
import { StylelintIgnore } from "./stylelint.ts"
import { TypeScriptIgnore } from "./typescript.ts"
import { ZigIgnore } from "./zig.ts"

export interface RefreshToolIgnoresParams {
  readonly cwd: string
}

export class ToolIgnores extends Effect.Service<ToolIgnores>()("vendor-subtree/ToolIgnores", {
  accessors: true,
  effect: Effect.gen(function* () {
    const biome = yield* BiomeIgnore
    const cspell = yield* CspellIgnore
    const eslint = yield* EslintIgnore
    const golangciLint = yield* GolangciLintIgnore
    const markdownlint = yield* MarkdownlintIgnore
    const monorepo = yield* MonorepoTools
    const mypy = yield* MypyIgnore
    const oxlint = yield* OxlintIgnore
    const prettier = yield* PrettierIgnore
    const pyright = yield* PyrightIgnore
    const ruff = yield* RuffIgnore
    const stylelint = yield* StylelintIgnore
    const typescript = yield* TypeScriptIgnore
    const cargo = yield* CargoIgnore
    const zig = yield* ZigIgnore
    const toolCategories = [
      {
        name: "linters-and-formatters",
        tools: [
          biome,
          cspell,
          eslint,
          golangciLint,
          markdownlint,
          oxlint,
          prettier,
          ruff,
          stylelint
        ]
      },
      {
        name: "language-analyzers",
        tools: [mypy, pyright, typescript, cargo, zig]
      }
    ] as const satisfies ReadonlyArray<ToolIgnoreCategory>

    return {
      doctor: ({ cwd }: RefreshToolIgnoresParams) =>
        Effect.all([doctorToolCategories(toolCategories, cwd), monorepo.doctor(cwd)], {
          concurrency: 2
        }).pipe(
          Effect.map(([toolReports, monorepoReports]) => [...toolReports, ...monorepoReports])
        ),
      refresh: ({ cwd }: RefreshToolIgnoresParams) =>
        Effect.all([refreshToolCategories(toolCategories, cwd), monorepo.refresh(cwd)], {
          concurrency: 2
        }).pipe(Effect.map(([toolPaths, monorepoPaths]) => [...toolPaths, ...monorepoPaths]))
    }
  })
}) {}
