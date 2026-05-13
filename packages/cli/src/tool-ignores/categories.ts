import { Array as Arr, Effect } from "effect"

import type { ToolIgnoreIntegration } from "./common.ts"

export interface ToolIgnoreCategory {
  readonly name: string
  readonly tools: ReadonlyArray<ToolIgnoreIntegration>
}

export const doctorToolCategories = (categories: ReadonlyArray<ToolIgnoreCategory>, cwd: string) =>
  Effect.all(
    categories.map((category) =>
      Effect.all(
        category.tools.map((tool) => tool.doctor(cwd)),
        {
          concurrency: category.tools.length
        }
      )
    ),
    { concurrency: categories.length }
  ).pipe(Effect.map(Arr.flatten))

export const refreshToolCategories = (categories: ReadonlyArray<ToolIgnoreCategory>, cwd: string) =>
  Effect.all(
    categories.map((category) =>
      Effect.all(
        category.tools.map((tool) => tool.refresh(cwd)),
        {
          concurrency: category.tools.length
        }
      )
    ),
    { concurrency: categories.length }
  ).pipe(Effect.map((paths) => Arr.getSomes(Arr.flatten(paths))))
