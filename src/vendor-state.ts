import { FileSystem, Path } from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import { TRAILER_DIR, TRAILER_REF, TRAILER_URL } from "./constants.ts"
import { git } from "./git.ts"

export const VendoredRepoSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  prefix: Schema.String.pipe(Schema.minLength(1)),
  url: Schema.String.pipe(Schema.minLength(1)),
  ref: Schema.String.pipe(Schema.minLength(1)),
  sha: Schema.String.pipe(Schema.minLength(1)),
  date: Schema.String.pipe(Schema.minLength(1))
})

export type VendoredRepo = typeof VendoredRepoSchema.Type

const decodeVendoredRepo = Schema.decodeUnknownSync(VendoredRepoSchema)

export const gitLogFormat = [
  "%H",
  "%cI",
  `%(trailers:key=${TRAILER_DIR},valueonly)`,
  `%(trailers:key=${TRAILER_URL},valueonly)`,
  `%(trailers:key=${TRAILER_REF},valueonly)`
].join("%x00")

export const parseVendoredLog = (stdout: string): ReadonlyArray<VendoredRepo> => {
  const byPrefix = new Map<string, VendoredRepo>()
  const records = stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0)

  for (const record of records) {
    const [sha, date, prefix, url, ref] = record
      .split("\x00")
      .map((part) => part.trim())
    const name = prefix?.replace(/\/+$/, "").split("/").pop() ?? ""
    try {
      const repo = decodeVendoredRepo({ name, prefix, url, ref, sha, date })
      if (!byPrefix.has(repo.prefix)) byPrefix.set(repo.prefix, repo)
    } catch {
      // Ignore malformed historical commits. They are not valid vendor state.
    }
  }

  return [...byPrefix.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const listVendored = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const result = yield* git(
      [
        "log",
        `--grep=^${TRAILER_URL}:`,
        "--extended-regexp",
        `--format=${gitLogFormat}%x1e`
      ],
      { cwd }
    )

    if (result.exitCode !== 0) return [] as VendoredRepo[]

    const parsed = parseVendoredLog(result.stdout)
    const present: VendoredRepo[] = []
    for (const repo of parsed) {
      const exists = yield* fs.exists(path.resolve(cwd, repo.prefix))
      if (exists) present.push(repo)
    }
    return present
  })

export const findByName = (cwd: string, name: string) =>
  listVendored(cwd).pipe(
    Effect.map((repos) =>
      Option.fromNullable(
        repos.find((repo) => repo.name === name || repo.prefix === name)
      )
    )
  )
