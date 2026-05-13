import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export interface TuiLaunchPlan {
  readonly _tag: "direct" | "spawn"
  readonly args: ReadonlyArray<string>
  readonly command?: string
}

export interface LaunchTuiOptions {
  readonly args?: ReadonlyArray<string>
  readonly bunCommand?: string
  readonly isBunRuntime?: boolean
  readonly moduleUrl?: string
  readonly spawn?: (command: string, args: ReadonlyArray<string>) => SpawnSyncReturns<Buffer>
}

const moduleExtension = (moduleUrl: string): ".js" | ".ts" =>
  fileURLToPath(moduleUrl).endsWith(".ts") ? ".ts" : ".js"

export const siblingModulePath = (moduleUrl: string, name: string): string =>
  resolve(dirname(fileURLToPath(moduleUrl)), `${name}${moduleExtension(moduleUrl)}`)

export const tuiLaunchPlan = ({
  args = [],
  bunCommand = "bun",
  isBunRuntime = "bun" in process.versions,
  moduleUrl = import.meta.url
}: Omit<LaunchTuiOptions, "spawn"> = {}): TuiLaunchPlan =>
  isBunRuntime
    ? { _tag: "direct", args }
    : {
        _tag: "spawn",
        args: [siblingModulePath(moduleUrl, "runner"), ...args],
        command: bunCommand
      }

export const launchTui = async (options: LaunchTuiOptions = {}): Promise<void> => {
  const plan = tuiLaunchPlan(options)

  if (plan._tag === "direct") {
    const { runTuiApp } = await import("./app.ts")
    await runTuiApp()
    return
  }

  const spawn =
    options.spawn ?? ((command, args) => spawnSync(command, [...args], { stdio: "inherit" }))
  const result = spawn(plan.command ?? "bun", plan.args)
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      console.error(
        "ingraft opens the interactive TUI by default, and the TUI requires Bun. Install Bun or run `ingraft deps` for the non-interactive scanner."
      )
      process.exitCode = 1
      return
    }
    throw result.error
  }

  process.exitCode = typeof result.status === "number" ? result.status : 1
}
