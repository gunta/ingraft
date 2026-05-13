import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { Box } from "ink"

import { Header, KeyValues, Section, Table, type TableColumn } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { withCommandTelemetry } from "../app/log.tsx"
import { VENDOR_DIR } from "../domain/constants.ts"
import { InkRenderFailed } from "../domain/errors.ts"
import { listVendored } from "../domain/vendor-state.ts"
import { PackageVersionSync } from "../package-sync/service.ts"
import { detectVendoredPackageVersions } from "../package-sync/version-detect.ts"
import {
  versionedVendoredRepos,
  type VersionedVendoredRepo
} from "../package-sync/version-report.ts"
import { repoRoot } from "../services/git.ts"

export interface ListCommandParams {
  readonly json: boolean
}

const listJsonOption = Flag.boolean("json").pipe(
  Flag.withDescription("Output machine-readable JSON to stdout.")
)

const versionValue = (
  repo: VersionedVendoredRepo,
  key: "local" | "remote" | "status" | "vendor"
): string => repo.versions?.[key] ?? "-"

const packageNames = (repo: VersionedVendoredRepo): string =>
  repo.packageNames.length === 0 ? "-" : repo.packageNames.join(", ")

const repositoryColumns = [
  { header: "Name", value: (repo: VersionedVendoredRepo) => repo.name },
  { header: "Strategy", value: (repo) => repo.strategy },
  { header: "Path", value: (repo) => repo.prefix },
  { header: "Package", value: packageNames },
  { header: "Local", value: (repo) => versionValue(repo, "local") },
  { header: "Vendor", value: (repo) => versionValue(repo, "vendor") },
  { header: "Remote", value: (repo) => versionValue(repo, "remote") },
  { header: "Status", value: (repo) => versionValue(repo, "status") }
] satisfies ReadonlyArray<TableColumn<VersionedVendoredRepo>>

const ListView = ({ repos }: { readonly repos: ReadonlyArray<VersionedVendoredRepo> }) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="vendored repositories" />
    <Section title="Workspace">
      <KeyValues entries={[{ label: "Vendor directory", value: `${VENDOR_DIR}/` }]} />
    </Section>
    <Section title="Repositories">
      <Table columns={repositoryColumns} empty="No repositories vendored." rows={repos} />
    </Section>
  </Box>
)

export const listImpl = ({ json }: ListCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const rawRepos = yield* listVendored(cwd)
    const pkgSync = yield* PackageVersionSync
    const candidates = yield* pkgSync.scan(cwd)
    const vendoredPackageVersions = yield* detectVendoredPackageVersions(cwd, candidates, rawRepos)
    const repos = versionedVendoredRepos({ candidates, repos: rawRepos, vendoredPackageVersions })
    if (json) {
      yield* Console.log(JSON.stringify({ repos, vendor_dir: VENDOR_DIR }, null, 2))
      return
    }
    yield* Effect.tryPromise({
      try: () => renderInkOnce(<ListView repos={repos} />),
      catch: (cause) => new InkRenderFailed({ view: "ListView", cause })
    })
  }).pipe(withCommandTelemetry("list"))

export const listCmd = Command.make("list", { json: listJsonOption }, listImpl).pipe(
  Command.withDescription("List vendored repositories (derived from git commit trailers).")
)
