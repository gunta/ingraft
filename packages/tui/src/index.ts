#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const cli = resolve(import.meta.dir, "../../cli/scripts/vendor.ts")
const result = spawnSync("bun", [cli, "tui"], { stdio: "inherit" })

process.exit(result.status ?? 1)
