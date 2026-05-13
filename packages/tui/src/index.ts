#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { Box, Text, createCliRenderer } from "@opentui/core"
import {
  type VendorTuiSnapshot,
  summarizeSnapshot,
  taskRows
} from "./status.ts"

const localCli = resolve(import.meta.dir, "../../cli/scripts/vendor.ts")

const cliCommand = () =>
  Bun.which("vendor-subtree") === null && existsSync(localCli)
    ? { args: [localCli, "deps", "--json"], command: "bun" }
    : { args: ["deps", "--json"], command: "vendor-subtree" }

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

const readSnapshot = (): VendorTuiSnapshot => {
  const command = cliCommand()
  const result = spawnSync(command.command, command.args, {
    encoding: "utf8"
  })
  if (result.status !== 0) {
    return failedSnapshot(result.stderr.trim() || result.stdout.trim())
  }
  try {
    return JSON.parse(result.stdout) as VendorTuiSnapshot
  } catch {
    return failedSnapshot("CLI returned invalid JSON.")
  }
}

const snapshot = readSnapshot()
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 30
})

renderer.root.add(
  Box(
    {
      borderStyle: "rounded",
      flexDirection: "column",
      gap: 1,
      padding: 1
    },
    Text({
      content: "vendor-subtree",
      fg: "#8BD5CA"
    }),
    Text({
      content: summarizeSnapshot(snapshot).join("  |  "),
      fg: "#A6E3A1"
    }),
    Text({
      content:
        taskRows(snapshot).join("\n") ||
        "No package-backed vendoring tasks detected.",
      fg: "#CDD6F4"
    }),
    Text({
      content:
        "Use `vendor-subtree deps` to select packages, or `vendor-subtree deps --yes` to process every matched task.",
      fg: "#F9E2AF"
    })
  )
)
