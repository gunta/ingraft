import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { Box } from "ink"

import { Header, KeyValues, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { withCommandTelemetry } from "../app/log.tsx"
import { VENDOR_DIR } from "../domain/constants.ts"
import { InkRenderFailed } from "../domain/errors.ts"
import { listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import { relativeTo } from "../project/reports.ts"
import { ProjectFiles } from "../project/service.ts"
import { ProjectSurfaces, type ProjectSurfaceReport } from "../project/surfaces.ts"
import { repoRoot } from "../services/git.ts"
import type { ToolIgnoreReport } from "../tool-ignores/common.ts"
import { ToolIgnores } from "../tool-ignores/service.ts"

export interface DoctorCommandParams {
  readonly fix: boolean
  readonly json: boolean
}

export interface DoctorReportData {
  readonly cwd: string
  readonly agentFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly editorFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repositoryFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly toolReports: ReadonlyArray<ToolIgnoreReport>
}

export interface FixDoctorParams {
  readonly cwd: string
  readonly repos: ReadonlyArray<VendoredRepo>
}

const doctorJsonOption = Flag.boolean("json").pipe(
  Flag.withDescription("Output machine-readable JSON to stdout.")
)

const doctorFixOption = Flag.boolean("fix").pipe(
  Flag.withDescription(
    "Repair generated agent docs, repository hygiene files, editor settings, and detected tool ignores before reporting."
  )
)

const renderConfigPath = (cwd: string, path: string | undefined): string =>
  path === undefined ? "-" : relativeTo({ root: cwd, path })

const surfaceColumns = (cwd: string) => [
  { header: "Name", value: (report: ProjectSurfaceReport) => report.name },
  { header: "Status", value: (report: ProjectSurfaceReport) => report.status },
  { header: "Path", value: (report: ProjectSurfaceReport) => renderConfigPath(cwd, report.path) },
  { header: "Message", value: (report: ProjectSurfaceReport) => report.message }
]

const DoctorView = ({
  agentFiles,
  cwd,
  editorFiles,
  repos,
  repositoryFiles,
  toolReports
}: DoctorReportData) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="doctor" />
    <Section title="Workspace">
      <KeyValues
        entries={[
          { label: "Vendor directory", value: `${VENDOR_DIR}/` },
          { label: "Workspace", value: cwd }
        ]}
      />
    </Section>
    <Section title="Durable source routes">
      <Table
        columns={[
          { header: "Name", value: (repo: VendoredRepo) => repo.name },
          { header: "Strategy", value: (repo: VendoredRepo) => repo.strategy },
          { header: "Path", value: (repo: VendoredRepo) => repo.prefix },
          { header: "Ref", value: (repo: VendoredRepo) => repo.ref }
        ]}
        empty="No durable source routes."
        rows={repos}
      />
    </Section>
    <Section title="Agent files">
      <Table columns={surfaceColumns(cwd)} empty="No agent files detected." rows={agentFiles} />
    </Section>
    <Section title="Editor files">
      <Table columns={surfaceColumns(cwd)} empty="No editor files detected." rows={editorFiles} />
    </Section>
    <Section title="Repository files">
      <Table
        columns={surfaceColumns(cwd)}
        empty="No repository hygiene files detected."
        rows={repositoryFiles}
      />
    </Section>
    <Section title="Tool ignores">
      <Table
        columns={[
          { header: "Tool", value: (report: ToolIgnoreReport) => report.tool },
          { header: "Status", value: (report: ToolIgnoreReport) => report.status },
          {
            header: "Config",
            value: (report: ToolIgnoreReport) => renderConfigPath(cwd, report.configPath)
          },
          { header: "Message", value: (report: ToolIgnoreReport) => report.message }
        ]}
        empty="No tool ignore checks were run."
        rows={toolReports}
      />
    </Section>
  </Box>
)

export const fixDoctor = ({ cwd, repos }: FixDoctorParams) =>
  Effect.gen(function* () {
    const projectFiles = yield* ProjectFiles
    yield* projectFiles.refresh({
      commitMessage: "vendor: repair project vendor files",
      cwd,
      editorSettings: true,
      repos
    })
  })

export const doctorImpl = ({ fix, json }: DoctorCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const initialRepos = yield* listVendored(cwd)
    if (fix) yield* fixDoctor({ cwd, repos: initialRepos })
    const repos = fix ? yield* listVendored(cwd) : initialRepos
    const projectSurfaces = yield* ProjectSurfaces
    const toolIgnores = yield* ToolIgnores
    const surfaces = yield* projectSurfaces.doctor({ cwd, repos })
    const toolReports = yield* toolIgnores.doctor({ cwd })

    if (json) {
      yield* Console.log(
        JSON.stringify(
          {
            vendor_dir: VENDOR_DIR,
            repos,
            agent_files: surfaces.agentFiles,
            editor_files: surfaces.editorFiles,
            repository_files: surfaces.repositoryFiles,
            tool_ignores: toolReports
          },
          null,
          2
        )
      )
      return
    }

    yield* Effect.tryPromise({
      try: () =>
        renderInkOnce(
          <DoctorView
            cwd={cwd}
            repos={repos}
            agentFiles={surfaces.agentFiles}
            editorFiles={surfaces.editorFiles}
            repositoryFiles={surfaces.repositoryFiles}
            toolReports={toolReports}
          />
        ),
      catch: (cause) => new InkRenderFailed({ view: "DoctorView", cause })
    })
  }).pipe(withCommandTelemetry("doctor"))

export const doctorCmd = Command.make(
  "doctor",
  {
    fix: doctorFixOption,
    json: doctorJsonOption
  },
  doctorImpl
).pipe(
  Command.withDescription(
    "Inspect repository context routes and detected formatter, linter, editor, and monorepo tool status."
  )
)
