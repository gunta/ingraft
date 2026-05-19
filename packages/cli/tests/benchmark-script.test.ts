import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const workspaceRoot = process.cwd()

type BenchmarkOperation = {
  readonly command: string
  readonly name: string
  readonly prepare?: string
  readonly suite: string
}

type BenchmarkModule = {
  readonly BENCHMARK_OPERATIONS: ReadonlyArray<BenchmarkOperation>
  readonly benchmarkTable: (
    operations: ReadonlyArray<BenchmarkOperation>,
    current: {
      readonly results: ReadonlyArray<{
        readonly command: string
        readonly mean: number
        readonly stddev: number
      }>
    },
    baseline:
      | {
          readonly results: ReadonlyArray<{
            readonly command: string
            readonly mean: number
            readonly stddev: number
          }>
        }
      | undefined
  ) => string
  readonly buildHyperfineArgs: (options: {
    readonly exportJson: string
    readonly operations: ReadonlyArray<BenchmarkOperation>
    readonly runs: number
    readonly warmup: number
  }) => ReadonlyArray<string>
}

const importBenchmarkModule = async (): Promise<BenchmarkModule> => {
  const path = join(workspaceRoot, "scripts/benchmark.ts")
  expect(await Bun.file(path).exists()).toBe(true)
  return (await import(pathToFileURL(path).href)) as BenchmarkModule
}

describe("benchmark script", () => {
  test("covers non-destructive CLI and TUI operations", async () => {
    const { BENCHMARK_OPERATIONS } = await importBenchmarkModule()
    const names = BENCHMARK_OPERATIONS.filter((operation) => operation.suite !== "optimized").map(
      (operation) => operation.name
    )

    expect(names).toEqual([
      "cli-help",
      "cli-list-json",
      "cli-list-json-cold-index",
      "cli-list-versions-json",
      "cli-deps-json",
      "cli-doctor-json",
      "cli-context-json",
      "tui-full-snapshot"
    ])
    expect(BENCHMARK_OPERATIONS.map((operation) => operation.command).join("\n")).not.toMatch(
      /\b(add|init|refresh|remove|update)\b/
    )
  })

  test("builds hyperfine arguments with names, warmups, runs, preparation, and JSON export", async () => {
    const { BENCHMARK_OPERATIONS, buildHyperfineArgs } = await importBenchmarkModule()
    const args = buildHyperfineArgs({
      exportJson: "benchmarks/results/latest.json",
      operations: BENCHMARK_OPERATIONS,
      runs: 3,
      warmup: 1
    })

    expect(args).toContain("--warmup")
    expect(args).toContain("1")
    expect(args).toContain("--runs")
    expect(args).toContain("3")
    expect(args).toContain("--export-json")
    expect(args).toContain("benchmarks/results/latest.json")
    expect(args).toContain("--command-name")
    expect(args).toContain("cli-list-json-cold-index")
    expect(args).toContain("--prepare")
    expect(args).toContain("rm -f .ingraft/state/index.json")
  })

  test("matches baseline rows by command name when benchmarking a subset", async () => {
    const { benchmarkTable } = await importBenchmarkModule()
    const table = benchmarkTable(
      [
        {
          command: "fast",
          name: "fast",
          suite: "cli"
        }
      ],
      {
        results: [
          {
            command: "fast",
            mean: 1,
            stddev: 0.1
          }
        ]
      },
      {
        results: [
          {
            command: "slow-unrelated",
            mean: 100,
            stddev: 1
          },
          {
            command: "fast",
            mean: 2,
            stddev: 0.2
          }
        ]
      }
    )

    expect(table).toContain("| `fast` | 1.000 s | 100.0 ms | 2.000 s | 2.00x faster |")
  })
})
