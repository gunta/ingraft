import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { Console, Effect } from "effect"

export interface SelectionChoice {
  readonly description?: string
  readonly label: string
}

export interface SelectManyParams {
  readonly choices: ReadonlyArray<SelectionChoice>
  readonly message: string
}

export const parseSelectionInput = (
  text: string,
  count: number
): ReadonlyArray<number> => {
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

const formatChoices = (choices: ReadonlyArray<SelectionChoice>): string =>
  choices
    .map((choice, index) =>
      choice.description
        ? `${index + 1}. ${choice.label} - ${choice.description}`
        : `${index + 1}. ${choice.label}`
    )
    .join("\n")

const selectMany = ({ choices, message }: SelectManyParams) =>
  Effect.gen(function* () {
    if (choices.length === 0) return []
    yield* Console.log(formatChoices(choices))
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

export class Prompts extends Effect.Service<Prompts>()("vendor-subtree/Prompts", {
  accessors: true,
  sync: () => ({ selectMany })
}) {}
