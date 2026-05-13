import { stdin as input, stdout as output } from "node:process"
import { createInterface } from "node:readline/promises"

import { Context, Effect, Layer } from "effect"
import { Box } from "ink"

import { Header, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { InkRenderFailed, PromptInputFailed } from "../domain/errors.ts"

export interface SelectionChoice {
  readonly description?: string
  readonly label: string
}

export interface SelectManyParams {
  readonly choices: ReadonlyArray<SelectionChoice>
  readonly message: string
}

export const parseSelectionInput = (text: string, count: number): ReadonlyArray<number> => {
  const normalized = text.trim().toLowerCase()
  if (normalized === "" || normalized === "none" || normalized === "n") return []
  if (normalized === "all" || normalized === "*") {
    return Array.from({ length: count }, (_value, index) => index)
  }

  const selected = new Set<number>()
  for (const token of normalized.split(/[,\s]+/)) {
    const range = token.match(/^(\d+)-(\d+)$/)
    if (range?.[1] && range[2]) {
      const start = Number.parseInt(range[1], 10)
      const end = Number.parseInt(range[2], 10)
      for (let value = start; value <= end; value += 1) {
        if (value >= 1 && value <= count) selected.add(value - 1)
      }
      continue
    }
    const value = Number.parseInt(token, 10)
    if (Number.isInteger(value) && value >= 1 && value <= count) {
      selected.add(value - 1)
    }
  }
  return [...selected].sort((a, b) => a - b)
}

const ChoicesView = ({ choices }: { readonly choices: ReadonlyArray<SelectionChoice> }) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="select" />
    <Section title="Choices">
      <Table
        columns={[
          { header: "#", value: (_choice: SelectionChoice, index: number) => String(index + 1) },
          { header: "Task", value: (choice: SelectionChoice) => choice.label },
          { header: "Source", value: (choice: SelectionChoice) => choice.description ?? "-" }
        ]}
        empty="No choices available."
        rows={choices}
      />
    </Section>
  </Box>
)

const selectMany = ({ choices, message }: SelectManyParams) =>
  Effect.gen(function* () {
    if (choices.length === 0) return []
    yield* Effect.tryPromise({
      try: () => renderInkOnce(<ChoicesView choices={choices} />),
      catch: (cause) => new InkRenderFailed({ view: "ChoicesView", cause })
    })
    if (!input.isTTY || !output.isTTY) return []

    const answer = yield* Effect.tryPromise({
      try: async () => {
        const rl = createInterface({ input, output })
        try {
          return await rl.question(`${message} `)
        } finally {
          rl.close()
        }
      },
      catch: (cause) => new PromptInputFailed({ cause })
    })
    const indexes = parseSelectionInput(answer, choices.length)
    return indexes.map((index) => choices[index]).filter((choice) => choice !== undefined)
  })

export interface PromptsShape {
  readonly selectMany: (
    params: SelectManyParams
  ) => Effect.Effect<ReadonlyArray<SelectionChoice>, InkRenderFailed | PromptInputFailed>
}

export class Prompts extends Context.Service<Prompts, PromptsShape>()("ingraft/Prompts") {}

export const PromptsLive = Layer.sync(Prompts, () => ({ selectMany }))
