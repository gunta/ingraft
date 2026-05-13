import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import type { CommandPlan } from "./dashboard.ts"
import type { VendorTuiSnapshot } from "./status.ts"

interface CliInvocation {
  readonly args: ReadonlyArray<string>
  readonly command: string
}

export interface SnapshotResult {
  readonly message: string
  readonly snapshot: VendorTuiSnapshot
}

const localCli = resolve(import.meta.dir, "../../cli/scripts/vendor.ts")

const cliInvocation = (args: ReadonlyArray<string>): CliInvocation =>
  Bun.which("vendor-subtree") === null && existsSync(localCli)
    ? { args: [localCli, ...args], command: "bun" }
    : { args, command: "vendor-subtree" }

const failedSnapshot = (message: string): VendorTuiSnapshot => ({
  candidates: [],
  tasks: [
    {
      action: "add",
      existingName: null,
      packageNames: ["vendor-subtree deps --json failed"],
      primaryPackageName: "vendor-subtree",
      repositoryUrl: message,
      suggestedName: "CLI unavailable"
    }
  ]
})

export const readSnapshot = (): SnapshotResult => {
  const command = cliInvocation(["deps", "--json"])
  const result = spawnSync(command.command, command.args, {
    encoding: "utf8"
  })
  if (result.status !== 0) {
    const output = result.stderr.trim() || result.stdout.trim()
    return {
      message: output || "Dependency scan failed.",
      snapshot: failedSnapshot(output || "Dependency scan failed.")
    }
  }
  try {
    return {
      message: "Dependency snapshot refreshed.",
      snapshot: JSON.parse(result.stdout) as VendorTuiSnapshot
    }
  } catch {
    return {
      message: "CLI returned invalid JSON.",
      snapshot: failedSnapshot("CLI returned invalid JSON.")
    }
  }
}

export const runCommandPlan = (plan: CommandPlan): string => {
  const command = cliInvocation(plan.args)
  const result = spawnSync(command.command, command.args, {
    encoding: "utf8"
  })
  const output = (result.stderr.trim() || result.stdout.trim()).split("\n").slice(-4)
  const suffix = output.length > 0 ? `: ${output.join(" | ")}` : ""
  return result.status === 0 ? `OK ${plan.label}${suffix}` : `FAIL ${plan.label}${suffix}`
}
