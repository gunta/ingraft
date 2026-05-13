import { describe, expect, test } from "bun:test"

import { renderHeading, renderKeyValues, renderNotice, renderTable } from "../src/app/ui.ts"

describe("CLI UI primitives", () => {
  test("renders compact section headings", () => {
    expect(renderHeading("Dependency scan", { colors: false })).toBe(
      "Dependency scan\n---------------"
    )
  })

  test("aligns key-value rows without colors", () => {
    const output = renderKeyValues([
      { label: "Vendor directory", value: "vendor/" },
      { label: "Workspace", value: "/repo" }
    ])

    expect(output).toContain("Vendor directory  vendor/")
    expect(output).toContain("Workspace         /repo")
  })

  test("renders tables with headers and empty state", () => {
    interface RepoRow {
      readonly name: string
      readonly strategy: string
    }

    const table = renderTable<RepoRow>({
      columns: [
        { header: "Name", value: (row) => row.name },
        { header: "Strategy", value: (row) => row.strategy }
      ],
      empty: "No repositories vendored.",
      rows: [{ name: "effect", strategy: "subtree" }]
    })

    expect(table).toContain("Name    Strategy")
    expect(table).toContain("effect  subtree")
    expect(
      renderTable({
        columns: [{ header: "Name", value: (row: { name: string }) => row.name }],
        empty: "No repositories vendored.",
        rows: []
      })
    ).toBe("No repositories vendored.")
  })

  test("colorizes notices when requested", () => {
    expect(
      renderNotice({
        kind: "error",
        message: "merge conflict",
        title: "Git command failed",
        options: { colors: true }
      })
    ).toContain("\x1b[31m")
  })
})
