import { FileSystem, Path } from "@effect/platform"
import { Effect, Either, Option, ParseResult, Schema } from "effect"
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

const decodeVendoredRepo = Schema.decodeUnknownEither(VendoredRepoSchema, {
  errors: "all"
})

export interface VendoredLogDiagnostic {
  readonly record: string
  readonly reason: string
}

export interface VendoredLogParseResult {
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly diagnostics: ReadonlyArray<VendoredLogDiagnostic>
}

export const gitLogFormat = [
  "%H",
  "%cI",
  `%(trailers:key=${TRAILER_DIR},valueonly)`,
  `%(trailers:key=${TRAILER_URL},valueonly)`,
  `%(trailers:key=${TRAILER_REF},valueonly)`
].join("%x00")

export const parseVendoredLogWithDiagnostics = (
  stdout: string
): VendoredLogParseResult => {
  const byPrefix = new Map<string, VendoredRepo>()
  const diagnostics: VendoredLogDiagnostic[] = []
  const records = stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0)

  for (const record of records) {
    const [sha, date, prefix, url, ref] = record
      .split("\x00")
      .map((part) => part.trim())
    const name = prefix?.replace(/\/+$/, "").split("/").pop() ?? ""
    const decoded = decodeVendoredRepo({ name, prefix, url, ref, sha, date })
    if (Either.isRight(decoded)) {
      if (!byPrefix.has(decoded.right.prefix)) {
        byPrefix.set(decoded.right.prefix, decoded.right)
      }
    } else {
      diagnostics.push({
        record,
        reason: `Invalid vendored repo record for prefix '${prefix ?? ""}': ${ParseResult.TreeFormatter.formatErrorSync(
          decoded.left
        )}`
      })
    }
  }

  return {
    repos: [...byPrefix.values()].sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics
  }
}

export const parseVendoredLog = (stdout: string): ReadonlyArray<VendoredRepo> =>
  parseVendoredLogWithDiagnostics(stdout).repos

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

    const parsed = parseVendoredLogWithDiagnostics(result.stdout)
    yield* Effect.forEach(
      parsed.diagnostics,
      (diagnostic) => Effect.logDebug(diagnostic.reason),
      { discard: true }
    )
    const present: VendoredRepo[] = []
    for (const repo of parsed.repos) {
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
