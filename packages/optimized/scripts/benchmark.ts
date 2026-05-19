#!/usr/bin/env bun
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const workspaceRoot = resolve(packageRoot, "../..")
const toolPath = `/opt/homebrew/bin:${process.env.PATH ?? ""}`

const run = (cmd: ReadonlyArray<string>, cwd: string): void => {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    env: {
      ...process.env,
      PATH: toolPath
    },
    stderr: "inherit",
    stdout: "inherit"
  })
  if (result.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} exited with status ${result.exitCode}`)
  }
}

const args = Bun.argv.slice(2)
const hasArg = (name: string): boolean => args.includes(name)
const hasOut = args.some((arg) => arg === "--out" || arg.startsWith("--out="))
const hasOperation = args.some((arg) => arg === "--operation" || arg.startsWith("--operation="))
const writesBaseline = hasArg("--write-baseline")
const dryRun = hasArg("--dry-run")

if (!dryRun) {
  run(["bun", "run", "build"], packageRoot)
}

const benchmarkArgs = [
  "scripts/benchmark.ts",
  ...(hasOperation
    ? []
    : [
        "--operation",
        "cli-deps-json",
        "--operation",
        "optimized-deps-rust-json",
        "--operation",
        "optimized-deps-zig-json"
      ]),
  ...(hasOut || writesBaseline ? [] : ["--out", "benchmarks/results/optimized-deps.json"]),
  ...args
]

run(["bun", ...benchmarkArgs], workspaceRoot)
