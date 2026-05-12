import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect } from "effect"
import { VENDOR_DIR } from "../constants.ts"
import { repoRoot } from "../git.ts"
import { listVendored } from "../vendor-state.ts"

const listJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Output machine-readable JSON to stdout.")
)

export const listImpl = ({ json }: { readonly json: boolean }) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const repos = yield* listVendored(cwd)
    if (json) {
      yield* Console.log(
        JSON.stringify({ vendor_dir: VENDOR_DIR, repos }, null, 2)
      )
      return
    }

    yield* Console.log(`vendor_dir: ${VENDOR_DIR}/`)
    if (repos.length === 0) {
      yield* Console.log("(no repositories vendored)")
      return
    }

    const nameWidth = Math.max(...repos.map((repo) => repo.name.length))
    const prefixWidth = Math.max(...repos.map((repo) => repo.prefix.length))
    for (const repo of repos) {
      yield* Console.log(
        `  ${repo.name.padEnd(nameWidth)}  ${repo.prefix.padEnd(prefixWidth)}  ${repo.url} @ ${repo.ref}`
      )
    }
  })

export const listCmd = Cli.make("list", { json: listJsonOption }, listImpl).pipe(
  Cli.withDescription(
    "List vendored repositories (derived from git commit trailers)."
  )
)
