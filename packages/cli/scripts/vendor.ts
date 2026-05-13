#!/usr/bin/env bun
/**
 * Development entrypoint for the standalone ingraft CLI.
 * Published installs use bin/ingraft.ts compiled to dist/.
 */

import { runMain } from "../src/cli.tsx"

runMain()
