import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect } from "effect"

import { withCommandTelemetry } from "../app/log.ts"
import { renderKeyValues, renderSection, renderTable } from "../app/ui.ts"
import { VENDOR_DIR } from "../domain/constants.ts"
import { listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import { repoRoot } from "../services/git.ts"

export interface ListCommandParams {
  readonly json: boolean
}

export interface RenderVendoredListParams {
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly json: boolean
}

const listJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Output machine-readable JSON to stdout.")
)

export const renderVendoredList = ({ json, repos }: RenderVendoredListParams): string => {
  if (json) return JSON.stringify({ vendor_dir: VENDOR_DIR, repos }, null, 2)

  return [
    renderSection({
      title: "Vendor workspace",
      content: renderKeyValues([{ label: "Vendor directory", value: `${VENDOR_DIR}/` }])
    }),
    renderSection({
      title: "Vendored repositories",
      content: renderTable({
        columns: [
          { header: "Name", value: (repo: VendoredRepo) => repo.name },
          { header: "Strategy", value: (repo) => repo.strategy },
          { header: "Path", value: (repo) => repo.prefix },
          { header: "Source", value: (repo) => `${repo.url} @ ${repo.ref}` }
        ],
        empty: "No repositories vendored.",
        rows: repos
      })
    })
  ].join("\n\n")
}

export const listImpl = ({ json }: ListCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const repos = yield* listVendored(cwd)
    yield* Console.log(renderVendoredList({ repos, json }))
  }).pipe(withCommandTelemetry("list"))

export const listCmd = Cli.make("list", { json: listJsonOption }, listImpl).pipe(
  Cli.withDescription("List vendored repositories (derived from git commit trailers).")
)
