import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"

import { buildSystemTools } from "./build-systems/index.ts"
import {
  type MonorepoToolCategory,
  type MonorepoToolDefinition,
  type ToolFileContext
} from "./common.ts"
import { packageManagerTools } from "./package-managers/index.ts"
import { taskRunnerTools } from "./task-runners/index.ts"

const categories = [
  packageManagerTools,
  taskRunnerTools,
  buildSystemTools
] as const satisfies ReadonlyArray<MonorepoToolCategory>

const categoryTools = categories.flatMap((category) => category.tools)

const hasRefresh = (
  tool: MonorepoToolDefinition
): tool is MonorepoToolDefinition & {
  readonly refresh: NonNullable<MonorepoToolDefinition["refresh"]>
} => tool.refresh !== undefined

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.all(
    categoryTools.map((tool) => tool.doctor(context, cwd)),
    {
      concurrency: categoryTools.length
    }
  )

const refreshWith = (context: ToolFileContext, cwd: string) => {
  const refreshableTools = categoryTools.filter(hasRefresh)
  return Effect.all(
    refreshableTools.map((tool) => tool.refresh(context, cwd)),
    { concurrency: refreshableTools.length }
  ).pipe(
    Effect.map((paths) =>
      paths.flatMap(
        Option.match({
          onNone: () => [],
          onSome: (path) => [path]
        })
      )
    )
  )
}

export class MonorepoTools extends Effect.Service<MonorepoTools>()("ingraft/MonorepoTools", {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const context = { fs, path }
    return {
      doctor: (cwd: string) => doctorWith(context, cwd),
      refresh: (cwd: string) => refreshWith(context, cwd)
    }
  })
}) {}
