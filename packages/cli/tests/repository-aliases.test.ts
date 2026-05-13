import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import {
  expandAliasTargetsWith,
  repositoryAliasEntriesFromDatabase
} from "../src/aliases/service.ts"

const database = {
  aliases: [
    {
      alias: "effect",
      targets: ["Effect-TS/effect"]
    },
    {
      alias: "convex",
      targets: ["get-convex/convex-js", "get-convex/convex-helpers"]
    }
  ]
}

describe("repository aliases", () => {
  test("loads entries from the JSON database shape", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(entries).toEqual([
      {
        alias: "effect",
        description: undefined,
        targets: ["Effect-TS/effect"]
      },
      {
        alias: "convex",
        description: undefined,
        targets: ["get-convex/convex-js", "get-convex/convex-helpers"]
      }
    ])
  })

  test("expands aliases before add target classification", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["effect", "zod"])).toEqual([
      {
        alias: "effect",
        input: "effect",
        target: "Effect-TS/effect"
      },
      {
        input: "zod",
        target: "zod"
      }
    ])
  })

  test("expands a single alias into multiple repositories", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["convex"])).toEqual([
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-js"
      },
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-helpers"
      }
    ])
  })

  test("deduplicates repeated alias targets while preserving order", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["effect", "Effect-TS/effect", "convex"])).toEqual([
      {
        alias: "effect",
        input: "effect",
        target: "Effect-TS/effect"
      },
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-js"
      },
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-helpers"
      }
    ])
  })
})
