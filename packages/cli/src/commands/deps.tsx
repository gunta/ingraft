import { Console, Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { Box } from "ink"

import { Header, KeyValues, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { info, ok, warn, withCommandTelemetry } from "../app/log.tsx"
import { InkRenderFailed } from "../domain/errors.ts"
import { type VendoredRepo, listVendored } from "../domain/vendor-state.ts"
import { DEFAULT_VENDOR_STRATEGY, type VendorStrategy } from "../domain/vendor-strategy.ts"
import { PackageVersionSync, type DependencyVendorCandidate } from "../package-sync/service.ts"
import { detectVendoredPackageVersions } from "../package-sync/version-detect.ts"
import {
  findExistingRepo,
  matchedDependencyCandidates,
  packageVersionReport,
  shouldDisplayCandidateVersions,
  vendoredPackageVersionKey,
  type PackageVersionDriftStatus,
  type PackageVersionReport,
  type VendoredPackageVersionMap
} from "../package-sync/version-report.ts"
import { repoRoot } from "../services/git.ts"
import { Prompts, type SelectionChoice } from "../services/prompts.tsx"
import { addImpl } from "./add.tsx"
import { updateImpl } from "./update.tsx"

export interface DepsCommandParams {
  readonly dryRun: boolean
  readonly json: boolean
  readonly strategy: VendorStrategy
  readonly yes: boolean
}

export interface DependencyVendorTask {
  readonly action: "add" | "update"
  readonly existingName: Option.Option<string>
  readonly packageNames: ReadonlyArray<string>
  readonly primaryPackageName: string
  readonly repositoryUrl: string
  readonly suggestedName?: string
  readonly syncPackage: string
  readonly versions: DependencyVendorTaskVersions
}

export type DependencyVersionDriftStatus = PackageVersionDriftStatus
export type DependencyVendorTaskVersions = PackageVersionReport
export { vendoredPackageVersionKey }

const depsJsonOption = Flag.boolean("json").pipe(
  Flag.withDescription("Print dependency vendoring candidates as JSON.")
)

const depsYesOption = Flag.boolean("yes").pipe(
  Flag.withAlias("y"),
  Flag.withDescription("Vendor every matched dependency candidate without prompting.")
)

const depsDryRunOption = Flag.boolean("dry-run").pipe(
  Flag.withDescription("Detect dependency candidates but do not add or update repos.")
)

const depsStrategyOption = Flag.choiceWithValue("strategy", [
  ["subtree", "subtree"],
  ["submodule", "submodule"],
  ["clone-ignore", "clone-ignore"],
  ["clone", "clone-ignore"]
] as const).pipe(
  Flag.withDefault(DEFAULT_VENDOR_STRATEGY),
  Flag.withDescription("Strategy to use for newly vendored dependency source repos.")
)

const candidateLabel = (task: DependencyVendorTask): string =>
  `${task.action === "add" ? "add" : "update"} ${task.packageNames.join(", ")}`

const candidateDescription = (task: DependencyVendorTask): string =>
  task.action === "update"
    ? `${task.repositoryUrl} (${Option.getOrElse(task.existingName, () => "vendored")})`
    : task.repositoryUrl

const asChoice = (task: DependencyVendorTask): SelectionChoice => ({
  description: candidateDescription(task),
  label: candidateLabel(task)
})

export const dependencyVendorTasks = (
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  repos: ReadonlyArray<VendoredRepo>,
  vendoredPackageVersions: VendoredPackageVersionMap = new Map()
): ReadonlyArray<DependencyVendorTask> => {
  const tasks = new Map<string, DependencyVendorTask>()
  for (const candidate of matchedDependencyCandidates(candidates)) {
    const repositoryUrl = candidate.repositoryUrl
    if (!repositoryUrl) continue
    const existing = findExistingRepo(candidate, repos)
    const key = existing === undefined ? `add:${repositoryUrl}` : `update:${existing.name}`
    const previous = tasks.get(key)
    if (previous) {
      const preferCandidate = shouldDisplayCandidateVersions(candidate, existing)
      tasks.set(key, {
        ...previous,
        packageNames: [...previous.packageNames, candidate.packageName],
        ...(preferCandidate
          ? {
              primaryPackageName: candidate.packageName,
              syncPackage: candidate.syncPackage,
              versions: packageVersionReport({
                candidate,
                existing,
                vendoredPackageVersions
              })
            }
          : {})
      })
      continue
    }
    const task = {
      action: existing === undefined ? "add" : "update",
      existingName: existing === undefined ? Option.none() : Option.some(existing.name),
      packageNames: [candidate.packageName],
      primaryPackageName: candidate.packageName,
      repositoryUrl,
      syncPackage: candidate.syncPackage,
      versions: packageVersionReport({
        candidate,
        existing,
        vendoredPackageVersions
      })
    } satisfies Omit<DependencyVendorTask, "suggestedName">
    tasks.set(
      key,
      candidate.suggestedName === undefined
        ? task
        : { ...task, suggestedName: candidate.suggestedName }
    )
  }
  return [...tasks.values()]
}

interface DepsSummaryProps {
  readonly candidateCount: number
  readonly matchedCount: number
  readonly tasks: ReadonlyArray<DependencyVendorTask>
  readonly taskCount: number
}

const DepsSummary = ({ candidateCount, matchedCount, taskCount, tasks }: DepsSummaryProps) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="dependency scan" />
    <Section title="Summary">
      <KeyValues
        entries={[
          { label: "Packages found", value: String(candidateCount) },
          { label: "Repository metadata", value: String(matchedCount) },
          { label: "Vendoring tasks", value: String(taskCount) }
        ]}
      />
    </Section>
    <Section title="Version drift">
      <Table
        columns={[
          { header: "Package", value: (task: DependencyVendorTask) => task.primaryPackageName },
          { header: "Local", value: (task) => task.versions.local },
          { header: "Vendor", value: (task) => task.versions.vendor },
          { header: "Remote", value: (task) => task.versions.remote },
          { header: "Status", value: (task) => task.versions.status }
        ]}
        empty="No package-backed vendoring tasks detected."
        rows={tasks}
      />
    </Section>
  </Box>
)

const taskToJson = (task: DependencyVendorTask) => ({
  action: task.action,
  existingName: Option.getOrNull(task.existingName),
  packageNames: task.packageNames,
  primaryPackageName: task.primaryPackageName,
  repositoryUrl: task.repositoryUrl,
  suggestedName: task.suggestedName,
  syncPackage: task.syncPackage,
  versions: task.versions
})

const runTask = (strategy: VendorStrategy, task: DependencyVendorTask) => {
  if (task.action === "update") {
    return updateImpl({
      all: false,
      name: task.existingName
    })
  }
  return addImpl({
    cloudflareArtifact: false,
    cloudflareArtifactDepth: Option.none(),
    cloudflareArtifactName: Option.none(),
    exclude: [],
    excludeDirs: [],
    excludeExtensions: [],
    maxFileSize: Option.none(),
    name: Option.none(),
    prefix: Option.none(),
    ref: Option.none(),
    release: Option.none(),
    repo: task.repositoryUrl,
    strategy,
    syncPackage: Option.some(task.syncPackage),
    tag: Option.none()
  })
}

export const depsImpl = ({ dryRun, json, strategy, yes }: DepsCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const pkgSync = yield* PackageVersionSync
    const candidates = yield* pkgSync.scan(cwd)
    const repos = yield* listVendored(cwd)
    const vendoredPackageVersions = yield* detectVendoredPackageVersions(cwd, candidates, repos)
    const tasks = dependencyVendorTasks(candidates, repos, vendoredPackageVersions)

    if (json) {
      yield* Console.log(JSON.stringify({ candidates, tasks: tasks.map(taskToJson) }, null, 2))
      return
    }

    yield* Effect.tryPromise({
      try: () =>
        renderInkOnce(
          <DepsSummary
            candidateCount={candidates.length}
            matchedCount={matchedDependencyCandidates(candidates).length}
            tasks={tasks}
            taskCount={tasks.length}
          />
        ),
      catch: (cause) => new InkRenderFailed({ view: "DepsView", cause })
    })
    if (dryRun) return
    if (tasks.length === 0) {
      yield* warn("No dependency repositories can be vendored from package metadata.")
      return
    }

    const choices = tasks.map(asChoice)
    const selected = yes
      ? tasks
      : yield* Effect.gen(function* () {
          const prompts = yield* Prompts
          return yield* prompts.selectMany({
            choices,
            message: "Select packages to vendor/update (comma/range, all, none):"
          })
        }).pipe(
          Effect.map((selectedChoices) =>
            selectedChoices.flatMap((choice: SelectionChoice) => {
              const index = choices.indexOf(choice)
              const task = tasks[index]
              return index === -1 || task === undefined ? [] : [task]
            })
          )
        )

    if (selected.length === 0) {
      yield* info("No dependency vendoring tasks selected.")
      return
    }

    yield* Effect.forEach(selected, (task) => runTask(strategy, task), {
      concurrency: 1
    })
    yield* ok(`Processed ${selected.length} dependency vendoring task(s).`)
  }).pipe(withCommandTelemetry("deps"))

export const depsCmd = Command.make(
  "deps",
  {
    dryRun: depsDryRunOption,
    json: depsJsonOption,
    strategy: depsStrategyOption,
    yes: depsYesOption
  },
  depsImpl
).pipe(
  Command.withDescription(
    "Scan project package manifests, match npm and Hex repository metadata, and vendor selected source repos."
  )
)
