import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect } from "effect"

import { withCommandTelemetry } from "../app/log.ts"
import { renderKeyValues, renderSection, renderTable } from "../app/ui.ts"
import { VENDOR_DIR } from "../domain/constants.ts"
import { listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import { relativeTo } from "../project/reports.ts"
import { ProjectSurfaces, type ProjectSurfaceReport } from "../project/surfaces.ts"
import { repoRoot } from "../services/git.ts"
import type { ToolIgnoreReport } from "../tool-ignores/common.ts"
import { ToolIgnores } from "../tool-ignores/service.ts"

export interface DoctorCommandParams {
  readonly json: boolean
}

export interface RenderDoctorReportParams {
  readonly cwd: string
  readonly json: boolean
  readonly agentFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly editorFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repositoryFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly toolReports: ReadonlyArray<ToolIgnoreReport>
}

const doctorJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Output machine-readable JSON to stdout.")
)

const renderConfigPath = (cwd: string, path: string | undefined): string =>
  path === undefined ? "-" : relativeTo({ root: cwd, path })

export const renderDoctorReport = ({
  agentFiles,
  cwd,
  editorFiles,
  json,
  repositoryFiles,
  repos,
  toolReports
}: RenderDoctorReportParams): string => {
  if (json) {
    return JSON.stringify(
      {
        vendor_dir: VENDOR_DIR,
        repos,
        agent_files: agentFiles,
        editor_files: editorFiles,
        repository_files: repositoryFiles,
        tool_ignores: toolReports
      },
      null,
      2
    )
  }

  return [
    renderSection({
      title: "Workspace",
      content: renderKeyValues([
        { label: "Vendor directory", value: `${VENDOR_DIR}/` },
        { label: "Workspace", value: cwd }
      ])
    }),
    renderSection({
      title: "Vendored repositories",
      content: renderTable({
        columns: [
          { header: "Name", value: (repo: VendoredRepo) => repo.name },
          { header: "Strategy", value: (repo) => repo.strategy },
          { header: "Path", value: (repo) => repo.prefix },
          { header: "Ref", value: (repo) => repo.ref }
        ],
        empty: "No repositories vendored.",
        rows: repos
      })
    }),
    renderSection({
      title: "Agent files",
      content: renderTable({
        columns: [
          { header: "Name", value: (report: ProjectSurfaceReport) => report.name },
          { header: "Status", value: (report) => report.status },
          { header: "Path", value: (report) => renderConfigPath(cwd, report.path) },
          { header: "Message", value: (report) => report.message }
        ],
        empty: "No agent files detected.",
        rows: agentFiles
      })
    }),
    renderSection({
      title: "Editor files",
      content: renderTable({
        columns: [
          { header: "Name", value: (report: ProjectSurfaceReport) => report.name },
          { header: "Status", value: (report) => report.status },
          { header: "Path", value: (report) => renderConfigPath(cwd, report.path) },
          { header: "Message", value: (report) => report.message }
        ],
        empty: "No editor files detected.",
        rows: editorFiles
      })
    }),
    renderSection({
      title: "Repository files",
      content: renderTable({
        columns: [
          { header: "Name", value: (report: ProjectSurfaceReport) => report.name },
          { header: "Status", value: (report) => report.status },
          { header: "Path", value: (report) => renderConfigPath(cwd, report.path) },
          { header: "Message", value: (report) => report.message }
        ],
        empty: "No repository hygiene files detected.",
        rows: repositoryFiles
      })
    }),
    renderSection({
      title: "Tool ignores",
      content: renderTable({
        columns: [
          { header: "Tool", value: (report: ToolIgnoreReport) => report.tool },
          { header: "Status", value: (report) => report.status },
          {
            header: "Config",
            value: (report) => renderConfigPath(cwd, report.configPath)
          },
          { header: "Message", value: (report) => report.message }
        ],
        empty: "No tool ignore checks were run.",
        rows: toolReports
      })
    })
  ].join("\n\n")
}

export const doctorImpl = ({ json }: DoctorCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const repos = yield* listVendored(cwd)
    const surfaces = yield* ProjectSurfaces.doctor({ cwd, repos })
    const toolReports = yield* ToolIgnores.doctor({ cwd })
    yield* Console.log(
      renderDoctorReport({
        cwd,
        json,
        repos,
        agentFiles: surfaces.agentFiles,
        editorFiles: surfaces.editorFiles,
        repositoryFiles: surfaces.repositoryFiles,
        toolReports
      })
    )
  }).pipe(withCommandTelemetry("doctor"))

export const doctorCmd = Cli.make("doctor", { json: doctorJsonOption }, doctorImpl).pipe(
  Cli.withDescription(
    "Inspect vendored repositories and detected formatter, linter, editor, and monorepo tool status."
  )
)
