#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

export interface BenchmarkOperation {
  readonly command: string
  readonly name: string
  readonly prepare?: string
  readonly suite: "cli" | "tui"
}

export interface BuildHyperfineArgsOptions {
  readonly exportJson: string
  readonly operations: ReadonlyArray<BenchmarkOperation>
  readonly runs: number
  readonly warmup: number
}

interface HyperfineResult {
  readonly command: string
  readonly max: number
  readonly mean: number
  readonly median: number
  readonly min: number
  readonly stddev: number
}

interface HyperfineJson {
  readonly results: ReadonlyArray<HyperfineResult>
}

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const defaultResultJson = "benchmarks/results/latest.json"
const baselineJson = "benchmarks/baseline.json"

const cli = "bun packages/cli/scripts/vendor.ts"

export const BENCHMARK_OPERATIONS: ReadonlyArray<BenchmarkOperation> = [
  {
    command: `${cli} --help`,
    name: "cli-help",
    suite: "cli"
  },
  {
    command: `${cli} list --json`,
    name: "cli-list-json",
    suite: "cli"
  },
  {
    command: `${cli} list --json`,
    name: "cli-list-json-cold-index",
    prepare: "rm -f .ingraft/state/index.json",
    suite: "cli"
  },
  {
    command: `${cli} list --versions --json`,
    name: "cli-list-versions-json",
    suite: "cli"
  },
  {
    command: `${cli} deps --json`,
    name: "cli-deps-json",
    suite: "cli"
  },
  {
    command: `${cli} doctor --json`,
    name: "cli-doctor-json",
    suite: "cli"
  },
  {
    command: `${cli} context --json`,
    name: "cli-context-json",
    suite: "cli"
  },
  {
    command: "bun scripts/benchmark.ts --probe tui-full-snapshot",
    name: "tui-full-snapshot",
    suite: "tui"
  }
]

export const buildHyperfineArgs = ({
  exportJson,
  operations,
  runs,
  warmup
}: BuildHyperfineArgsOptions): ReadonlyArray<string> => {
  const args: Array<string> = [
    "--warmup",
    String(warmup),
    "--runs",
    String(runs),
    "--export-json",
    exportJson
  ]

  if (operations.some((operation) => operation.prepare !== undefined)) {
    for (const operation of operations) {
      args.push("--prepare", operation.prepare ?? ":")
    }
  }

  for (const operation of operations) {
    args.push("--command-name", operation.name)
  }
  for (const operation of operations) {
    args.push(operation.command)
  }
  return args
}

const resolveHyperfineBinary = (): string => {
  const candidates = [
    join(workspaceRoot, "node_modules/.bin/hyperfine"),
    join(workspaceRoot, "node_modules/.bin/hyperfine.cmd")
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? "hyperfine"
}

const formatDuration = (seconds: number): string =>
  seconds < 1 ? `${(seconds * 1000).toFixed(1)} ms` : `${seconds.toFixed(3)} s`

const markdownPathFor = (jsonPath: string): string =>
  jsonPath.endsWith(".json") ? jsonPath.replace(/\.json$/, ".md") : `${jsonPath}.md`

const readHyperfineJson = async (path: string): Promise<HyperfineJson | undefined> => {
  if (!existsSync(resolve(workspaceRoot, path))) return undefined
  return JSON.parse(await readFile(resolve(workspaceRoot, path), "utf8")) as HyperfineJson
}

const benchmarkTable = (
  operations: ReadonlyArray<BenchmarkOperation>,
  current: HyperfineJson,
  baseline: HyperfineJson | undefined
): string => {
  const lines = [
    "| Operation | Mean | Stddev | Baseline | Change |",
    "|---|---:|---:|---:|---:|"
  ]
  for (const [index, result] of current.results.entries()) {
    const operation = operations[index]
    const name = operation?.name ?? result.command
    const baselineResult = baseline?.results[index]
    const ratio = baselineResult === undefined ? undefined : baselineResult.mean / result.mean
    const change =
      ratio === undefined
        ? "-"
        : ratio >= 1
          ? `${ratio.toFixed(2)}x faster`
          : `${(1 / ratio).toFixed(2)}x slower`
    lines.push(
      [
        `| \`${name}\``,
        formatDuration(result.mean),
        formatDuration(result.stddev),
        baselineResult === undefined ? "-" : formatDuration(baselineResult.mean),
        `${change} |`
      ].join(" | ")
    )
  }
  return lines.join("\n")
}

const writeMarkdownSummary = async ({
  baselinePath,
  exportJson,
  operations
}: {
  readonly baselinePath?: string
  readonly exportJson: string
  readonly operations: ReadonlyArray<BenchmarkOperation>
}): Promise<void> => {
  const current = await readHyperfineJson(exportJson)
  if (current === undefined) return
  const baseline =
    baselinePath === undefined || baselinePath === exportJson
      ? undefined
      : await readHyperfineJson(baselinePath)
  const lines = [
    "# ingraft Benchmarks",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Run with:",
    "",
    "```sh",
    "bun run bench",
    "```",
    "",
    benchmarkTable(operations, current, baseline),
    ""
  ]
  await writeFile(resolve(workspaceRoot, markdownPathFor(exportJson)), lines.join("\n"))
}

const runHyperfine = async ({
  exportJson,
  operations,
  runs,
  warmup
}: BuildHyperfineArgsOptions): Promise<void> => {
  await mkdir(dirname(resolve(workspaceRoot, exportJson)), { recursive: true })
  const result = Bun.spawnSync({
    cmd: [resolveHyperfineBinary(), ...buildHyperfineArgs({ exportJson, operations, runs, warmup })],
    cwd: workspaceRoot,
    stderr: "inherit",
    stdout: "inherit"
  })
  if (result.exitCode !== 0) {
    throw new Error(`hyperfine exited with status ${result.exitCode}`)
  }
}

const operationSelection = (names: string | ReadonlyArray<string> | undefined) => {
  if (names === undefined) return BENCHMARK_OPERATIONS
  const wanted = new Set(Array.isArray(names) ? names : [names])
  const operations = BENCHMARK_OPERATIONS.filter((operation) => wanted.has(operation.name))
  const missing = [...wanted].filter(
    (name) => !BENCHMARK_OPERATIONS.some((operation) => operation.name === name)
  )
  if (missing.length > 0) throw new Error(`Unknown benchmark operation: ${missing.join(", ")}`)
  return operations
}

const runTuiSnapshotProbe = async (): Promise<void> => {
  const [{ Effect }, { LiveLayer }, { listVendored }, { PackageVersionSync }, versionDetect, git, tui, meta] =
    await Promise.all([
      import("../packages/cli/node_modules/effect/dist/index.js"),
      import("../packages/cli/src/app/layers.ts"),
      import("../packages/cli/src/domain/vendor-state.ts"),
      import("../packages/cli/src/package-sync/service.ts"),
      import("../packages/cli/src/package-sync/version-detect.ts"),
      import("../packages/cli/src/services/git.ts"),
      import("../packages/cli/src/tui/cli-adapter.ts"),
      import("../packages/cli/src/services/git-metadata.ts")
    ])
  const program = Effect.gen(function* () {
    const pkgSync = yield* PackageVersionSync
    return yield* tui.streamSnapshotWith(
      {
        detectVendoredVersions: (cwd, candidates, repos) =>
          versionDetect.detectVendoredPackageVersions(cwd, candidates, repos).pipe(Effect.orDie),
        listDependencies: (cwd) => pkgSync.listDependencies(cwd).pipe(Effect.orDie),
        listRepos: (cwd) => listVendored(cwd).pipe(Effect.orDie),
        root: git.repoRoot.pipe(Effect.orDie),
        scanDependency: (cwd, dependency) =>
          pkgSync.scanDependency(cwd, dependency).pipe(Effect.orDie)
      },
      () => undefined
    )
  })
  await Effect.runPromise(program.pipe(Effect.provide(LiveLayer), Effect.provide(meta.GitMetadataLive)))
}

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      "dry-run": { type: "boolean" },
      "list": { type: "boolean" },
      "operation": { multiple: true, type: "string" },
      "out": { type: "string" },
      "probe": { type: "string" },
      "quick": { type: "boolean" },
      "runs": { type: "string" },
      "warmup": { type: "string" },
      "write-baseline": { type: "boolean" }
    }
  })

  if (values.probe === "tui-full-snapshot") {
    await runTuiSnapshotProbe()
    return
  }
  if (values.probe !== undefined) throw new Error(`Unknown benchmark probe: ${values.probe}`)

  const operations = operationSelection(values.operation)
  if (values.list === true) {
    for (const operation of operations) {
      console.log(`${operation.name}\t${operation.command}`)
    }
    return
  }

  const quick = values.quick === true
  const runs = Number(values.runs ?? (quick ? 3 : 8))
  const warmup = Number(values.warmup ?? (quick ? 1 : 2))
  const exportJson = values["write-baseline"] === true ? baselineJson : (values.out ?? defaultResultJson)

  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer")
  if (!Number.isInteger(warmup) || warmup < 0) throw new Error("--warmup must be a non-negative integer")
  if (operations.length === 0) throw new Error("No benchmark operations selected")

  if (values["dry-run"] === true) {
    console.log([resolveHyperfineBinary(), ...buildHyperfineArgs({ exportJson, operations, runs, warmup })].join(" "))
    return
  }

  await runHyperfine({ exportJson, operations, runs, warmup })
  await writeMarkdownSummary({
    baselinePath: values["write-baseline"] === true ? undefined : baselineJson,
    exportJson,
    operations
  })
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
