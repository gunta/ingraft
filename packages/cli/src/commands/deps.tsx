import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect, Option } from "effect"
import { Box } from "ink"

import { Header, KeyValues, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { info, ok, warn, withCommandTelemetry } from "../app/log.tsx"
import { type VendoredRepo, listVendored } from "../domain/vendor-state.ts"
import { DEFAULT_VENDOR_STRATEGY, type VendorStrategy } from "../domain/vendor-strategy.ts"
import {
  detectVendoredPackageVersion,
  PackageVersionSync,
  type DependencyVendorCandidate
} from "../package-sync/service.ts"
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
  readonly versions: DependencyVendorTaskVersions
}

export type DependencyVersionDriftStatus =
  | "local-vendor-drift"
  | "not-vendored"
  | "remote-drift"
  | "synced"
  | "unknown"

export interface DependencyVendorTaskVersions {
  readonly local: string
  readonly remote: string
  readonly status: DependencyVersionDriftStatus
  readonly vendor: string
}

export type VendoredPackageVersionMap = ReadonlyMap<string, string>
type VendoredPackageVersionEntry = readonly [string, string]

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

export const vendoredPackageVersionKey = (repoName: string, packageName: string): string =>
  `${repoName}\u0000${packageName}`

const packageVersionLabel = (
  packageName: string,
  version: string | undefined,
  source: string
): string => `${packageName}@${version ?? "unknown"} (${source})`

const dependencyVersionStatus = ({
  hasVendor,
  localVersion,
  remoteVersion,
  vendorVersion
}: {
  readonly hasVendor: boolean
  readonly localVersion: string | undefined
  readonly remoteVersion: string | undefined
  readonly vendorVersion: string | undefined
}): DependencyVersionDriftStatus => {
  if (!hasVendor) return "not-vendored"
  if (localVersion === undefined || vendorVersion === undefined) return "unknown"
  if (localVersion !== vendorVersion) return "local-vendor-drift"
  if (remoteVersion !== undefined && remoteVersion !== localVersion) return "remote-drift"
  return "synced"
}

const dependencyVersions = ({
  candidate,
  existing,
  vendoredPackageVersions
}: {
  readonly candidate: DependencyVendorCandidate
  readonly existing: Option.Option<VendoredRepo>
  readonly vendoredPackageVersions: VendoredPackageVersionMap
}): DependencyVendorTaskVersions => {
  const repo = Option.getOrUndefined(existing)
  const localSource =
    candidate.versionSource === undefined || candidate.versionSource === "package-json"
      ? "package.json range"
      : candidate.versionSource
  const vendorVersion =
    repo === undefined
      ? undefined
      : vendoredPackageVersions.get(vendoredPackageVersionKey(repo.name, candidate.packageName))
  return {
    local: packageVersionLabel(candidate.packageName, candidate.version, localSource),
    remote: packageVersionLabel(candidate.packageName, candidate.remoteVersion, "npm latest"),
    status: dependencyVersionStatus({
      hasVendor: repo !== undefined,
      localVersion: candidate.version,
      remoteVersion: candidate.remoteVersion,
      vendorVersion
    }),
    vendor:
      repo === undefined
        ? "not vendored"
        : vendorVersion === undefined
          ? `unknown (ref ${repo.ref})`
          : packageVersionLabel(candidate.packageName, vendorVersion, "vendored source")
  }
}

const shouldDisplayCandidateVersions = (
  candidate: DependencyVendorCandidate,
  existing: Option.Option<VendoredRepo>
): boolean =>
  Option.match(existing, {
    onNone: () => false,
    onSome: (repo) => repo.name === candidate.packageName || repo.syncPackage === candidate.packageName
  })

const detectVendoredPackageVersions = (
  cwd: string,
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  repos: ReadonlyArray<VendoredRepo>
) =>
  Effect.gen(function* () {
    const entries = yield* Effect.forEach(
      matchedCandidates(candidates),
      (candidate) => {
        const existing = findExistingRepo(candidate, repos)
        if (Option.isNone(existing)) {
          return Effect.succeed([] as ReadonlyArray<VendoredPackageVersionEntry>)
        }
        return detectVendoredPackageVersion({
          cwd,
          packageName: candidate.packageName,
          prefix: existing.value.prefix
        }).pipe(
          Effect.map((version) =>
            Option.isSome(version)
              ? ([
                  [
                    vendoredPackageVersionKey(existing.value.name, candidate.packageName),
                    version.value.version
                  ]
                ] as const)
              : ([] as ReadonlyArray<VendoredPackageVersionEntry>)
          ),
          Effect.catchAll(() => Effect.succeed([] as ReadonlyArray<VendoredPackageVersionEntry>))
        )
      },
      { concurrency: 4 }
    )
    return new Map(entries.flat())
  })

export const dependencyVendorTasks = (
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  repos: ReadonlyArray<VendoredRepo>,
  vendoredPackageVersions: VendoredPackageVersionMap = new Map()
): ReadonlyArray<DependencyVendorTask> => {
  const tasks = new Map<string, DependencyVendorTask>()
  for (const candidate of matchedCandidates(candidates)) {
    const repositoryUrl = candidate.repositoryUrl
    if (!repositoryUrl) continue
    const existing = findExistingRepo(candidate, repos)
    const key = Option.isSome(existing) ? `update:${existing.value.name}` : `add:${repositoryUrl}`
    const previous = tasks.get(key)
    if (previous) {
      const preferCandidate = shouldDisplayCandidateVersions(candidate, existing)
      tasks.set(key, {
        ...previous,
        packageNames: [...previous.packageNames, candidate.packageName],
        ...(preferCandidate
          ? {
              primaryPackageName: candidate.packageName,
              versions: dependencyVersions({
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
      action: Option.isSome(existing) ? "update" : "add",
      existingName: Option.map(existing, (repo) => repo.name),
      packageNames: [candidate.packageName],
      primaryPackageName: candidate.packageName,
      repositoryUrl,
      versions: dependencyVersions({
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
    syncPackage: Option.some(task.primaryPackageName),
    tag: Option.none()
  })
}

export const depsImpl = ({ dryRun, json, strategy, yes }: DepsCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const candidates = yield* PackageVersionSync.scan(cwd)
    const repos = yield* listVendored(cwd)
    const vendoredPackageVersions = yield* detectVendoredPackageVersions(cwd, candidates, repos)
    const tasks = dependencyVendorTasks(candidates, repos, vendoredPackageVersions)

    if (json) {
      yield* Console.log(JSON.stringify({ candidates, tasks: tasks.map(taskToJson) }, null, 2))
      return
    }

    yield* Effect.promise(() =>
      renderInkOnce(
        <DepsSummary
          candidateCount={candidates.length}
          matchedCount={matchedCandidates(candidates).length}
          tasks={tasks}
          taskCount={tasks.length}
        />
      )
    )
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
