import { Args, Command as Cli, Options } from "@effect/cli"
import { Console, Effect } from "effect"

import {
  contextPackPlan,
  contextSourcePlan,
  detectContextTools,
  formatContextCommandPlan,
  runContextCommandPlan,
  type ContextToolReport
} from "../context-tools/service.ts"
import { repoRoot } from "../services/git.ts"

export interface ContextToolsCommandParams {
  readonly json: boolean
}

export interface ContextPackCommandParams {
  readonly compress: boolean
  readonly paths: ReadonlyArray<string>
}

export interface ContextSourceCommandParams {
  readonly target: string
}

const contextJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Output machine-readable JSON to stdout.")
)

const contextCompressOption = Options.boolean("compress").pipe(
  Options.withDescription("Ask Repomix to use Tree-sitter compression.")
)

const contextPackPathsArg = Args.text({ name: "path" }).pipe(
  Args.withDescription("Path to pack. Defaults to vendor/."),
  Args.repeated
)

const contextSourceTargetArg = Args.text({ name: "target" }).pipe(
  Args.withDescription("OpenSrc package or repository target, for example zod or pypi:requests.")
)

const statusLabel = (tool: ContextToolReport): string => (tool.detected ? tool.status : "available")

const renderSection = ({ content, title }: { readonly content: string; readonly title: string }) =>
  `== ${title} ==\n${content}`

const renderKeyValues = (
  entries: ReadonlyArray<{ readonly label: string; readonly value: string }>
) => {
  const width = entries.reduce((max, entry) => Math.max(max, entry.label.length), 0)
  return entries.map((entry) => `${entry.label.padEnd(width)}  ${entry.value}`).join("\n")
}

const renderToolTable = (tools: ReadonlyArray<ContextToolReport>) => {
  if (tools.length === 0) return "No optional context tools configured."
  return tools
    .map((tool) => {
      const evidence = tool.evidence.length === 0 ? "-" : tool.evidence.join(", ")
      return `${tool.name.padEnd(8)} ${statusLabel(tool).padEnd(10)} ${tool.command.padEnd(32)} ${evidence}`
    })
    .join("\n")
}

const renderContextTools = (tools: ReadonlyArray<ContextToolReport>): string =>
  [
    renderSection({
      title: "Context tools",
      content: renderKeyValues([
        { label: "State model", value: "git-native vendor metadata" },
        { label: "Curated wrappers", value: "Repomix, OpenSrc, Repobase" }
      ])
    }),
    renderSection({
      title: "Optional tools",
      content: [
        "Tool     Status     Command                          Evidence",
        renderToolTable(tools)
      ].join("\n")
    })
  ].join("\n\n")

export const contextToolsImpl = ({ json }: ContextToolsCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const tools = yield* detectContextTools({ cwd })
    if (json) {
      yield* Console.log(JSON.stringify({ tools }, null, 2))
      return
    }
    yield* Console.log(renderContextTools(tools))
  })

export const contextPackImpl = ({ compress, paths }: ContextPackCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const plan = contextPackPlan({ compress, paths })
    yield* Console.log(`Running ${plan.label}: ${formatContextCommandPlan(plan)}`)
    yield* runContextCommandPlan({ cwd, plan })
  })

export const contextSourceImpl = ({ target }: ContextSourceCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const plan = contextSourcePlan({ target })
    yield* runContextCommandPlan({ cwd, plan })
  })

const contextToolsCmd = Cli.make(
  "tools",
  {
    json: contextJsonOption
  },
  contextToolsImpl
).pipe(Cli.withDescription("Detect curated optional context tools in this repository."))

const contextPackCmd = Cli.make(
  "pack",
  {
    compress: contextCompressOption,
    paths: contextPackPathsArg
  },
  contextPackImpl
).pipe(Cli.withDescription("Run Repomix against vendor/ or selected paths."))

const contextSourceCmd = Cli.make(
  "source",
  {
    target: contextSourceTargetArg
  },
  contextSourceImpl
).pipe(Cli.withDescription("Run OpenSrc and print the cached source path for a package or repo."))

export const contextCmd = Cli.make("context", {}, () => contextToolsImpl({ json: false })).pipe(
  Cli.withDescription(
    "Detect or run curated optional context tools that complement vendored source."
  ),
  Cli.withSubcommands([contextToolsCmd, contextPackCmd, contextSourceCmd])
)
