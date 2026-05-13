import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect } from "effect"
import { Box } from "ink"

import { Header, KeyValues, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { withCommandTelemetry } from "../app/log.tsx"
import { VENDOR_DIR } from "../domain/constants.ts"
import { listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import { repoRoot } from "../services/git.ts"

export interface ListCommandParams {
  readonly json: boolean
}

const listJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Output machine-readable JSON to stdout.")
)

const ListView = ({ repos }: { readonly repos: ReadonlyArray<VendoredRepo> }) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="vendored repositories" />
    <Section title="Workspace">
      <KeyValues entries={[{ label: "Vendor directory", value: `${VENDOR_DIR}/` }]} />
    </Section>
    <Section title="Repositories">
      <Table
        columns={[
          { header: "Name", value: (repo: VendoredRepo) => repo.name },
          { header: "Strategy", value: (repo) => repo.strategy },
          { header: "Path", value: (repo) => repo.prefix },
          { header: "Source", value: (repo) => `${repo.url} @ ${repo.ref}` }
        ]}
        empty="No repositories vendored."
        rows={repos}
      />
    </Section>
  </Box>
)

export const listImpl = ({ json }: ListCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const repos = yield* listVendored(cwd)
    if (json) {
      yield* Console.log(JSON.stringify({ repos, vendor_dir: VENDOR_DIR }, null, 2))
      return
    }
    yield* Effect.promise(() => renderInkOnce(<ListView repos={repos} />))
  }).pipe(withCommandTelemetry("list"))

export const listCmd = Cli.make("list", { json: listJsonOption }, listImpl).pipe(
  Cli.withDescription("List vendored repositories (derived from git commit trailers).")
)
