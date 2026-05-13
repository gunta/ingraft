import { describe, expect, test } from "bun:test"
import { parseSelectionInput } from "../src/services/prompts.ts"

describe("selection prompts", () => {
  test("parses comma separated indexes and ranges", () => {
    expect(parseSelectionInput("1, 3-4", 5)).toEqual([0, 2, 3])
  })

  test("selects every choice for all", () => {
    expect(parseSelectionInput("all", 3)).toEqual([0, 1, 2])
  })

  test("ignores out of range and invalid tokens", () => {
    expect(parseSelectionInput("0, nope, 2, 9", 3)).toEqual([1])
  })
})
