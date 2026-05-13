import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect } from "effect"
import { VENDOR_DIR } from "../domain/constants.ts"
import { repoRoot } from "../services/git.ts"
import { withCommandTelemetry } from "../app/log.ts"
import { relativeTo } from "../project/reports.ts"
import { ProjectSurfaces, type ProjectSurfaceReport } from "../project/surfaces.ts"
import { ToolIgnores } from "../tool-ignores/service.ts"
import type { ToolIgnoreReport } from "../tool-ignores/common.ts"
import { listVendored, type VendoredRepo } from "../domain/vendor-state.ts"

export interface DoctorCommandParams {
  readonly json: boolean
}

export interface RenderDoctorReportParams {
  readonly cwd: string
  readonly json: boolean
  readonly agentFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly editorFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly toolReports: ReadonlyArray<ToolIgnoreReport>
}

const doctorJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Output machine-readable JSON to stdout.")
)

const renderConfigPath = (cwd: string, path: string | undefined): string =>
  path === undefined ? "-" : relativeTo({ root: cwd, path })

const renderToolLine = (cwd: string, report: ToolIgnoreReport): string =>
  `  ${report.tool.padEnd(10)} ${report.status.padEnd(11)} ${renderConfigPath(
    cwd,
    report.configPath
  ).padEnd(24)} ${report.message}`

const renderRepoLines = (repos: ReadonlyArray<VendoredRepo>): ReadonlyArray<string> =>
  repos.length === 0
    ? ["  (no repositories vendored)"]
    : repos.map(
        (repo) =>
          `  ${repo.name.padEnd(16)} ${repo.strategy.padEnd(12)} ${repo.prefix} @ ${repo.ref}`
      )

const renderSurfaceLines = (
  cwd: string,
  reports: ReadonlyArray<ProjectSurfaceReport>
): ReadonlyArray<string> =>
  reports.map(
    (report) =>
      `  ${report.name.padEnd(22)} ${report.status.padEnd(11)} ${renderConfigPath(
        cwd,
        report.path
      ).padEnd(34)} ${report.message}`
  )

export const renderDoctorReport = ({
  agentFiles,
  cwd,
  editorFiles,
  json,
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
        tool_ignores: toolReports
      },
      null,
      2
    )
  }

  return [
    `vendor_dir: ${VENDOR_DIR}/`,
    `workspace: ${cwd}`,
    "",
    "vendored repositories:",
    ...renderRepoLines(repos),
    "",
    "agent files:",
    ...renderSurfaceLines(cwd, agentFiles),
    "",
    "editor files:",
    ...renderSurfaceLines(cwd, editorFiles),
    "",
    "tool ignores:",
    ...toolReports.map((entry) => renderToolLine(cwd, entry))
  ].join("\n")
}

export const doctorImpl = ({ json }: DoctorCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const repos = yield* listVendored(cwd)
    const surfaces = yield* ProjectSurfaces.doctor({ cwd })
    const toolReports = yield* ToolIgnores.doctor({ cwd })
    yield* Console.log(
      renderDoctorReport({
        cwd,
        json,
        repos,
        agentFiles: surfaces.agentFiles,
        editorFiles: surfaces.editorFiles,
        toolReports
      })
    )
  }).pipe(withCommandTelemetry("doctor"))

export const doctorCmd = Cli.make(
  "doctor",
  { json: doctorJsonOption },
  doctorImpl
).pipe(
  Cli.withDescription(
    "Inspect vendored repositories and detected formatter/linter ignore status."
  )
)
