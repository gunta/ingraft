#!/usr/bin/env bun
/**
 * Development entrypoint for the standalone vendor-subtree CLI.
 * Published installs use bin/vendor-subtree.ts compiled to dist/.
 */

import { runMain } from "../src/cli.ts"

runMain()
