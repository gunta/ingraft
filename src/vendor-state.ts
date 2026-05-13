import { FileSystem, Path } from "@effect/platform"
import { Effect, Either, Option, ParseResult, Schema } from "effect"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_FILTER,
  TRAILER_REF,
  TRAILER_STRATEGY,
  TRAILER_URL
} from "./constants.ts"
import { git } from "./git.ts"
import {
  DEFAULT_VENDOR_STRATEGY,
  VendorActionSchema,
  VendorStrategySchema
} from "./vendor-strategy.ts"
import {
  EMPTY_VENDOR_FILTER,
  parseVendorFilterTrailer,
  VendorFilterSchema,
  type VendorFilter
} from "./vendor-filter.ts"

export const VendoredRepoSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  prefix: Schema.String.pipe(Schema.minLength(1)),
  url: Schema.String.pipe(Schema.minLength(1)),
  ref: Schema.String.pipe(Schema.minLength(1)),
  strategy: VendorStrategySchema,
  filter: VendorFilterSchema,
  sha: Schema.String.pipe(Schema.minLength(1)),
  date: Schema.String.pipe(Schema.minLength(1))
})

export type VendoredRepo = typeof VendoredRepoSchema.Type

const VendoredLogRecordSchema = Schema.Struct({
  ...VendoredRepoSchema.fields,
  action: VendorActionSchema
})

interface ActiveVendoredLogRecord {
  readonly _tag: "Active"
  readonly repo: VendoredRepo
}

interface RemovedVendoredLogRecord {
  readonly _tag: "Removed"
  readonly prefix: string
}

type StoredVendoredLogRecord =
  | ActiveVendoredLogRecord
  | RemovedVendoredLogRecord

type VendoredLogRecord = typeof VendoredLogRecordSchema.Type

const decodeVendoredRecord = Schema.decodeUnknownEither(VendoredLogRecordSchema, {
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

export interface FindVendoredRepoParams {
  readonly cwd: string
  readonly name: string
}

interface VendoredLogRecordFields {
  readonly action: string
  readonly date: string
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly sha: string
  readonly strategy: string
  readonly url: string
  readonly filter: VendorFilter
}

export const gitLogFormat = [
  "%H",
  "%cI",
  `%(trailers:key=${TRAILER_DIR},valueonly)`,
  `%(trailers:key=${TRAILER_URL},valueonly)`,
  `%(trailers:key=${TRAILER_REF},valueonly)`,
  `%(trailers:key=${TRAILER_STRATEGY},valueonly)`,
  `%(trailers:key=${TRAILER_ACTION},valueonly)`,
  `%(trailers:key=${TRAILER_FILTER},valueonly)`
].join("%x00")

interface VendoredLogAccumulator {
  readonly byPrefix: ReadonlyMap<string, StoredVendoredLogRecord>
  readonly diagnostics: ReadonlyArray<VendoredLogDiagnostic>
}

const nonEmptyRecords = (stdout: string): ReadonlyArray<string> =>
  stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0)

const recordPart = (
  parts: ReadonlyArray<string>,
  index: number
): string => parts[index]?.trim() ?? ""

const repoFromRecord = (record: string): VendoredLogRecordFields => {
  const parts = record.split("\x00")
  const sha = recordPart(parts, 0)
  const date = recordPart(parts, 1)
  const prefix = recordPart(parts, 2)
  const url = recordPart(parts, 3)
  const ref = recordPart(parts, 4)
  const rawStrategy = recordPart(parts, 5)
  const rawAction = recordPart(parts, 6)
  const rawFilter = recordPart(parts, 7)
  const name = prefix.replace(/\/+$/, "").split("/").pop() ?? ""
  const strategy = rawStrategy === "" ? DEFAULT_VENDOR_STRATEGY : rawStrategy
  const action = rawAction === "" ? "upsert" : rawAction
  const filter =
    rawFilter === "" ? EMPTY_VENDOR_FILTER : parseVendorFilterTrailer(rawFilter)
  return { action, date, filter, name, prefix, ref, sha, strategy, url }
}

const diagnosticFromRecord = (
  record: string,
  error: ParseResult.ParseError
): VendoredLogDiagnostic => {
  const { prefix } = repoFromRecord(record)
  return {
    record,
    reason: `Invalid vendored repo record for prefix '${prefix ?? ""}': ${ParseResult.TreeFormatter.formatErrorSync(
      error
    )}`
  }
}

const rememberRepo = (
  byPrefix: ReadonlyMap<string, StoredVendoredLogRecord>,
  record: VendoredLogRecord
): ReadonlyMap<string, StoredVendoredLogRecord> => {
  if (byPrefix.has(record.prefix)) return byPrefix

  const stored: StoredVendoredLogRecord =
    record.action === "remove"
      ? { _tag: "Removed", prefix: record.prefix }
      : {
          _tag: "Active",
          repo: {
            date: record.date,
            name: record.name,
            prefix: record.prefix,
            ref: record.ref,
            filter: record.filter,
            sha: record.sha,
            strategy: record.strategy,
            url: record.url
          }
        }
  return new Map([...byPrefix, [record.prefix, stored]])
}

const appendRecord = (
  state: VendoredLogAccumulator,
  record: string
): VendoredLogAccumulator =>
  Either.match(decodeVendoredRecord(repoFromRecord(record)), {
    onRight: (repo) => ({
      ...state,
      byPrefix: rememberRepo(state.byPrefix, repo)
    }),
    onLeft: (error) => ({
      ...state,
      diagnostics: [...state.diagnostics, diagnosticFromRecord(record, error)]
    })
  })

export const parseVendoredLogWithDiagnostics = (
  stdout: string
): VendoredLogParseResult => {
  const { byPrefix, diagnostics } = nonEmptyRecords(stdout).reduce(appendRecord, {
    byPrefix: new Map<string, StoredVendoredLogRecord>(),
    diagnostics: []
  })

  return {
    repos: [...byPrefix.values()]
      .flatMap((record) => (record._tag === "Active" ? [record.repo] : []))
      .sort((a, b) => a.name.localeCompare(b.name)),
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
    return yield* Effect.filter(parsed.repos, (repo) =>
      repo.strategy === "clone-ignore"
        ? Effect.succeed(true)
        : fs.exists(path.resolve(cwd, repo.prefix))
    )
  })

export const findByName = ({ cwd, name }: FindVendoredRepoParams) =>
  listVendored(cwd).pipe(
    Effect.map((repos) =>
      Option.fromNullable(
        repos.find((repo) => repo.name === name || repo.prefix === name)
      )
    )
  )
