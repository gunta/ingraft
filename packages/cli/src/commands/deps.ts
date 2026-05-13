import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect, Option } from "effect"

import { info, ok, warn, withCommandTelemetry } from "../app/log.ts"
import { renderKeyValues, renderSection } from "../app/ui.ts"
import { type VendoredRepo, listVendored } from "../domain/vendor-state.ts"
import { DEFAULT_VENDOR_STRATEGY, type VendorStrategy } from "../domain/vendor-strategy.ts"
import { PackageVersionSync, type DependencyVendorCandidate } from "../package-sync/service.ts"
import { repoRoot } from "../services/git.ts"
import { Prompts, type SelectionChoice } from "../services/prompts.ts"
import { addImpl } from "./add.ts"
import { updateImpl } from "./update.ts"

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
}

const depsJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Print dependency vendoring candidates as JSON.")
)

const depsYesOption = Options.boolean("yes").pipe(
  Options.withAlias("y"),
  Options.withDescription("Vendor every matched dependency candidate without prompting.")
)

const depsDryRunOption = Options.boolean("dry-run").pipe(
  Options.withDescription("Detect dependency candidates but do not add or update repos.")
)

const depsStrategyOption = Options.choiceWithValue("strategy", [
  ["subtree", "subtree"],
  ["submodule", "submodule"],
  ["clone-ignore", "clone-ignore"],
  ["clone", "clone-ignore"]
] as const).pipe(
  Options.withDefault(DEFAULT_VENDOR_STRATEGY),
  Options.withDescription("Strategy to use for newly vendored dependency source repos.")
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

const matchedCandidates = (candidates: ReadonlyArray<DependencyVendorCandidate>) =>
  candidates.filter((candidate) => candidate.status === "matched" && candidate.repositoryUrl)

const findExistingRepo = (
  candidate: DependencyVendorCandidate,
  repos: ReadonlyArray<VendoredRepo>
): Option.Option<VendoredRepo> =>
  Option.fromNullable(
    repos.find(
      (repo) => repo.syncPackage === candidate.packageName || repo.url === candidate.repositoryUrl
    )
  )

export const dependencyVendorTasks = (
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  repos: ReadonlyArray<VendoredRepo>
): ReadonlyArray<DependencyVendorTask> => {
  const tasks = new Map<string, DependencyVendorTask>()
  for (const candidate of matchedCandidates(candidates)) {
    const repositoryUrl = candidate.repositoryUrl
    if (!repositoryUrl) continue
    const existing = findExistingRepo(candidate, repos)
    const key = Option.isSome(existing) ? `update:${existing.value.name}` : `add:${repositoryUrl}`
    const previous = tasks.get(key)
    if (previous) {
      tasks.set(key, {
        ...previous,
        packageNames: [...previous.packageNames, candidate.packageName]
      })
      continue
    }
    const task = {
      action: Option.isSome(existing) ? "update" : "add",
      existingName: Option.map(existing, (repo) => repo.name),
      packageNames: [candidate.packageName],
      primaryPackageName: candidate.packageName,
      repositoryUrl
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

const printSummary = (
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  tasks: ReadonlyArray<DependencyVendorTask>
) =>
  Console.log(
    renderSection({
      title: "Dependency scan",
      content: renderKeyValues([
        { label: "Packages found", value: String(candidates.length) },
        {
          label: "Repository metadata",
          value: String(matchedCandidates(candidates).length)
        },
        { label: "Vendoring tasks", value: String(tasks.length) }
      ])
    })
  )

const taskToJson = (task: DependencyVendorTask) => ({
  action: task.action,
  existingName: Option.getOrNull(task.existingName),
  packageNames: task.packageNames,
  primaryPackageName: task.primaryPackageName,
  repositoryUrl: task.repositoryUrl,
  suggestedName: task.suggestedName
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
    syncPackage: Option.some(task.primaryPackageName),
    tag: Option.none()
  })
}

export const depsImpl = ({ dryRun, json, strategy, yes }: DepsCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const candidates = yield* PackageVersionSync.scan(cwd)
    const repos = yield* listVendored(cwd)
    const tasks = dependencyVendorTasks(candidates, repos)

    if (json) {
      yield* Console.log(JSON.stringify({ candidates, tasks: tasks.map(taskToJson) }, null, 2))
      return
    }

    yield* printSummary(candidates, tasks)
    if (dryRun) return
    if (tasks.length === 0) {
      yield* warn("No dependency repositories can be vendored from package metadata.")
      return
    }

    const choices = tasks.map(asChoice)
    const selected = yes
      ? tasks
      : yield* Prompts.selectMany({
          choices,
          message: "Select packages to vendor/update (comma/range, all, none):"
        }).pipe(
          Effect.map((selectedChoices) =>
            selectedChoices.flatMap((choice) => {
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

export const depsCmd = Cli.make(
  "deps",
  {
    dryRun: depsDryRunOption,
    json: depsJsonOption,
    strategy: depsStrategyOption,
    yes: depsYesOption
  },
  depsImpl
).pipe(
  Cli.withDescription(
    "Scan project package manifests, match npm repository metadata, and vendor selected source repos."
  )
)
