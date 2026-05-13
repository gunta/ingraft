import { stdin as input, stdout as output } from "node:process"
import { createInterface } from "node:readline/promises"

import { Effect } from "effect"
import { Box } from "ink"

import { Header, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"

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
    yield* Effect.promise(() => renderInkOnce(<ChoicesView choices={choices} />))
    if (!input.isTTY || !output.isTTY) return []

    const answer = yield* Effect.promise(async () => {
      const rl = createInterface({ input, output })
      try {
        return await rl.question(`${message} `)
      } finally {
        rl.close()
      }
    })
    const indexes = parseSelectionInput(answer, choices.length)
    return indexes.map((index) => choices[index]).filter((choice) => choice !== undefined)
  })

export class Prompts extends Effect.Service<Prompts>()("ingraft/Prompts", {
  accessors: true,
  sync: () => ({ selectMany })
}) {}
