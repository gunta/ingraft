# Local-Only Vendoring + Include Filters + Fork-Mode Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local-only vendoring first-class in `ingraft` so users can vendor specific directories from a remote repo into a local folder without ever touching the host repo's tracked history. Add positive `--include` filters, a `--local-only` modifier on `clone-ignore`/`cache-link` strategies, and a fork-mode default that flips the implicit choice based on whether the user marked the repo as `personal` or `contribute`.

**Architecture:** Three coordinated changes ship as one bundled PR.

1. **Filter extension.** `VendorFilter` gains `include` (globs) and `includeDirs` (path prefixes). `includedTreePaths` becomes allow-list then deny-list. Sparse-checkout plumbing already exists in `checkoutFilteredRepo`/`materializeFilteredRepo`; we just feed it the new positive selection.
2. **Local-only modifier.** A new `--local-only` flag (alias `--no-commit`) is valid only with `clone-ignore` and `cache-link`. When set, three things flip together: the ignore block is written to `.git/info/exclude` (untracked, per-clone) instead of `.gitignore`; metadata commits are skipped; per-vendor metadata is persisted in `.git/ingraft/state.json` (also untracked). `listVendored` merges trailer-sourced and state-sourced entries by prefix.
3. **Fork mode default.** `git config ingraft.forkMode = personal | contribute` is the source of truth. When `personal`, `--local-only` becomes the implicit default and the strategy auto-selects `clone-ignore`. `init` prompts interactively on a fork when unset. `doctor` warns when committed vendor trailers exist on a fork in personal mode (leak risk). GitHub Desktop's preference is read only as a seed for the prompt default (stretch, fail-quiet).

**Tech Stack:** TypeScript, Effect (with `effect/unstable/cli`, `effect/unstable/process`, `FileSystem`, `Path`), Ink + React for command rendering, isomorphic-git via `GitMetadata`, Bun for the test runner (`bun:test`). All code follows the Effect dependency-injection patterns established in `packages/cli/src`.

---

## File Structure

**New files**

- `packages/cli/src/domain/local-state.ts` — Reader/writer for `.git/ingraft/state.json`. Atomic write via temp-file rename.
- `packages/cli/src/domain/fork-mode.ts` — `ForkMode` type, getter/setter against `git config`, detection helpers.
- `packages/cli/src/services/github-desktop.ts` — Stretch. Read `~/Library/Application Support/GitHub Desktop/repositories.json` and surface a preference hint. Fail-quiet on any schema drift.
- `packages/cli/tests/local-state.test.ts`
- `packages/cli/tests/fork-mode.test.ts`
- `packages/cli/tests/info-exclude.test.ts` — Behavior tests for `.git/info/exclude` writer (extends `gitignore.test.ts`).
- `packages/cli/tests/github-desktop.test.ts` — Stretch.

**Modified files**

- `packages/cli/src/domain/vendor-filter.ts` — Add `include`/`includeDirs` to `VendorFilter`, params, schema, helpers, serialization.
- `packages/cli/src/domain/vendor-state.ts` — Add `localOnly` field to `VendoredRepoSchema`; merge trailer + local-state in `listVendored`.
- `packages/cli/src/domain/errors.ts` — Add `InvalidLocalOnlyStrategy` error tag for `--local-only` with `subtree`/`submodule`. Register handler in `cli.tsx`.
- `packages/cli/src/project/gitignore.ts` — Parameterize `updateGitignore` with `target: "gitignore" | "info-exclude"`; rename the exported helper to keep both call sites readable.
- `packages/cli/src/commands/add.tsx` — New flags + branch on `localOnly` in `addCloneIgnore`/`addCacheLink`. Apply `forkMode` default to derive implicit `--local-only`.
- `packages/cli/src/commands/update.tsx` — Read `localOnly` from `VendoredRepo`; skip the commit when set.
- `packages/cli/src/commands/remove.tsx` — Branch on `localOnly`; mutate `.git/info/exclude` + state.json instead of `.gitignore` + commits.
- `packages/cli/src/commands/init.tsx` — Add interactive first-run prompt for `forkMode` if a fork is detected and unset.
- `packages/cli/src/commands/doctor.tsx` — Add a fork-mode hygiene section to the JSON output and the Ink view.
- `packages/cli/src/cli.tsx` — Register the new `InvalidLocalOnlyStrategy` tag in the `catchTags` handler. Add fork-mode-related layers if needed.
- `packages/cli/tests/vendor-filter.test.ts` — Tests for include/includeDirs + round-trip + back-compat.
- `packages/cli/tests/vendor-state.test.ts` — Tests for local-state merge.
- `packages/cli/tests/gitignore.test.ts` — Tests for the new `target` parameter.
- `packages/cli/tests/update.test.ts` — Local-only update path.
- `SKILL.md`, `README.md`, `packages/cli/README.md` — User-facing docs.

**Untouched (by design)**

- `packages/cli/src/domain/vendor-strategy.ts` — strategy enum is stable; `--local-only` is a modifier not a strategy.
- `packages/cli/src/project/filtered-checkout.ts` — `includedTreePaths` returns the path list; the consumer only needs the new positive selection to be respected, which `includedTreePaths` already handles once we update its filter logic.
- `packages/cli/src/project/cache-link.ts` — `cache-link` doesn't write to `.gitignore` itself; the caller does. We branch in the caller.

---

## Conventions used across tasks

- Tests use `bun:test` (`describe`, `test`, `expect`) and Effect's `Effect.runPromise`/`Effect.runPromiseExit`, matching the pattern in `packages/cli/tests/vendor-filter.test.ts`.
- Effect services are provided per-test via `Effect.provideService(Service, Service.of({...}))` — see `packages/cli/tests/git.test.ts:11` for the pattern.
- All trailer/state writes default missing optionals to `undefined` (not present) on the read side, so old data parses unchanged.
- New flag descriptions follow the existing tone in `add.tsx`: imperative, ends with a period, mentions repeatability or scope when relevant.
- Run from repo root unless otherwise stated: `bun run test`, `bun run typecheck`, `bun run build`.

### Shared test scaffolding

Several integration tests in Tasks 6, 7, 8, and 12 share the same setup. Create `packages/cli/tests/helpers/local-vendor-fixture.ts` once and import it in each test file:

```typescript
import { execSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Option } from "effect"

import type { AddCommandParams } from "../../src/commands/add.tsx"
import type { VendorStrategy } from "../../src/domain/vendor-strategy.ts"

export const initLocalRepo = (): string => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-local-"))
  execSync("git init -q -b main", { cwd })
  execSync("git config user.email tests@example.com && git config user.name tests", { cwd })
  execSync("git commit --allow-empty -m init -q", { cwd })
  return cwd
}

export const initBareUpstream = (): string => {
  const upstream = mkdtempSync(join(tmpdir(), "ingraft-upstream-"))
  execSync("git init -q -b main", { cwd: upstream })
  execSync("git config user.email up@example.com && git config user.name up", { cwd: upstream })
  writeFileSync(join(upstream, "README.md"), "hello\n")
  execSync("git add README.md && git commit -m seed -q", { cwd: upstream })
  return upstream
}

export const advanceUpstream = (upstream: string, file: string, content: string): void => {
  writeFileSync(join(upstream, file), content)
  execSync(`git add ${file} && git commit -m bump -q`, { cwd: upstream })
}

export const defaultAddParams = (overrides: Partial<AddCommandParams>): AddCommandParams => ({
  repo: overrides.repo ?? "",
  ref: overrides.ref ?? Option.none(),
  tag: overrides.tag ?? Option.none(),
  release: overrides.release ?? Option.none(),
  syncPackage: overrides.syncPackage ?? Option.none(),
  cloudflareArtifact: overrides.cloudflareArtifact ?? false,
  cloudflareArtifactDepth: overrides.cloudflareArtifactDepth ?? Option.none(),
  cloudflareArtifactName: overrides.cloudflareArtifactName ?? Option.none(),
  exclude: overrides.exclude ?? [],
  excludeDirs: overrides.excludeDirs ?? [],
  excludeExtensions: overrides.excludeExtensions ?? [],
  include: overrides.include ?? [],
  includeDirs: overrides.includeDirs ?? [],
  maxFileSize: overrides.maxFileSize ?? Option.none(),
  prefix: overrides.prefix ?? Option.none(),
  name: overrides.name ?? Option.none(),
  strategy: overrides.strategy ?? ("clone-ignore" satisfies VendorStrategy),
  localOnly: overrides.localOnly ?? false
})

export const setForkMode = (cwd: string, mode: "personal" | "contribute"): void => {
  execSync(`git config ingraft.forkMode ${mode}`, { cwd })
}
```

All later tasks reference `initLocalRepo`, `initBareUpstream`, `defaultAddParams`, and `setForkMode` from this file. Create the helper at the start of Task 6.

---

## Task 1: Add `include`/`includeDirs` to `VendorFilter`

**Files:**

- Modify: `packages/cli/src/domain/vendor-filter.ts` (extend interface, schema, helpers, predicate)
- Test: `packages/cli/tests/vendor-filter.test.ts`

- [ ] **Step 1.1: Write failing tests for the extended filter shape**

Append to `packages/cli/tests/vendor-filter.test.ts`:

```typescript
test("normalizes include and include-dir cli options", async () => {
  const filter = await Effect.runPromise(
    vendorFilterFromOptions({
      exclude: [],
      excludeDirs: [],
      excludeExtensions: [],
      include: [" src/**/*.ts "],
      includeDirs: [" /packages/effect/ "],
      maxFileSize: null
    })
  )

  expect(filter).toEqual({
    exclude: [],
    excludeDirs: [],
    excludeExtensions: [],
    include: ["src/**/*.ts"],
    includeDirs: ["packages/effect"],
    maxFileSizeBytes: null
  })
  expect(hasVendorFilter(filter)).toBe(true)
})

test("includedTreePaths keeps only files inside includeDirs", () => {
  const entries = parseGitTreeEntries(
    [
      "100644 blob a 12\tsrc/index.ts",
      "100644 blob b 99\tpackages/effect/src/effect.ts",
      "100644 blob c 100\tpackages/other/src/other.ts",
      "100644 blob d 80\tdocs/guide.md"
    ].join("\n")
  )
  const filter = {
    exclude: [],
    excludeDirs: [],
    excludeExtensions: [],
    include: [],
    includeDirs: ["packages/effect"],
    maxFileSizeBytes: null
  }

  expect(includedTreePaths({ entries, filter })).toEqual(["packages/effect/src/effect.ts"])
})

test("includedTreePaths intersects include with exclude (allow-list then deny-list)", () => {
  const entries = parseGitTreeEntries(
    [
      "100644 blob a 10\tsrc/index.ts",
      "100644 blob b 10\tsrc/index.snap",
      "100644 blob c 10\tpackages/effect/src/effect.ts",
      "100644 blob d 10\tpackages/effect/docs/readme.md"
    ].join("\n")
  )
  const filter = {
    exclude: ["*.snap"],
    excludeDirs: ["packages/effect/docs"],
    excludeExtensions: [],
    include: ["src/**/*.ts"],
    includeDirs: ["packages/effect"],
    maxFileSizeBytes: null
  }

  expect(includedTreePaths({ entries, filter })).toEqual([
    "packages/effect/src/effect.ts",
    "src/index.ts"
  ])
})

test("hasVendorFilter is true when only include or includeDirs is set", () => {
  expect(
    hasVendorFilter({
      exclude: [],
      excludeDirs: [],
      excludeExtensions: [],
      include: ["src/**/*.ts"],
      includeDirs: [],
      maxFileSizeBytes: null
    })
  ).toBe(true)

  expect(
    hasVendorFilter({
      exclude: [],
      excludeDirs: [],
      excludeExtensions: [],
      include: [],
      includeDirs: ["packages/effect"],
      maxFileSizeBytes: null
    })
  ).toBe(true)
})

test("parseVendorFilterTrailer accepts legacy JSON without include fields", () => {
  const legacy = JSON.stringify({
    exclude: ["*.snap"],
    excludeDirs: ["docs"],
    excludeExtensions: ["png"],
    maxFileSizeBytes: 1_048_576
  })

  expect(parseVendorFilterTrailer(legacy)).toEqual({
    exclude: ["*.snap"],
    excludeDirs: ["docs"],
    excludeExtensions: ["png"],
    include: [],
    includeDirs: [],
    maxFileSizeBytes: 1_048_576
  })
})

test("formatVendorFilterTrailer round-trips include/includeDirs", () => {
  const filter = {
    exclude: [],
    excludeDirs: [],
    excludeExtensions: [],
    include: ["src/**/*.ts"],
    includeDirs: ["packages/effect"],
    maxFileSizeBytes: null
  }

  expect(parseVendorFilterTrailer(formatVendorFilterTrailer(filter))).toEqual(filter)
})
```

- [ ] **Step 1.2: Run the new tests to confirm they fail**

Run: `bun test packages/cli/tests/vendor-filter.test.ts`
Expected: failures referencing `include`/`includeDirs` (TypeScript errors on the unknown property names, or runtime mismatches once it compiles).

- [ ] **Step 1.3: Extend `VendorFilter`, params, and `EMPTY_VENDOR_FILTER`**

Edit `packages/cli/src/domain/vendor-filter.ts`. Replace the existing interfaces and constant:

```typescript
export interface VendorFilter {
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly include: ReadonlyArray<string>
  readonly includeDirs: ReadonlyArray<string>
  readonly maxFileSizeBytes: number | null
}

export interface VendorFilterOptionParams {
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly include: ReadonlyArray<string>
  readonly includeDirs: ReadonlyArray<string>
  readonly maxFileSize: string | null
}

export const EMPTY_VENDOR_FILTER: VendorFilter = {
  exclude: [],
  excludeDirs: [],
  excludeExtensions: [],
  include: [],
  includeDirs: [],
  maxFileSizeBytes: null
}
```

- [ ] **Step 1.4: Update the schema with optional new fields (backward compatible)**

Replace `VendorFilterSchema` in the same file:

```typescript
export const VendorFilterSchema = Schema.Struct({
  exclude: Schema.Array(Schema.String),
  excludeDirs: Schema.Array(Schema.String),
  excludeExtensions: Schema.Array(Schema.String),
  include: Schema.optional(Schema.Array(Schema.String)),
  includeDirs: Schema.optional(Schema.Array(Schema.String)),
  maxFileSizeBytes: Schema.NullOr(Schema.Number)
})
```

Update `parseVendorFilterTrailer` so missing optionals decode as `[]`:

```typescript
export const parseVendorFilterTrailer = (value: string): VendorFilter => {
  if (value.trim().length === 0) return EMPTY_VENDOR_FILTER
  const decoded = Schema.decodeUnknownSync(VendorFilterSchema)(JSON.parse(value))
  return {
    exclude: decoded.exclude,
    excludeDirs: decoded.excludeDirs,
    excludeExtensions: decoded.excludeExtensions,
    include: decoded.include ?? [],
    includeDirs: decoded.includeDirs ?? [],
    maxFileSizeBytes: decoded.maxFileSizeBytes
  }
}
```

- [ ] **Step 1.5: Update `vendorFilterFromOptions` to normalize include fields**

Replace the function in the same file:

```typescript
export const vendorFilterFromOptions = ({
  exclude,
  excludeDirs,
  excludeExtensions,
  include,
  includeDirs,
  maxFileSize
}: VendorFilterOptionParams) =>
  Effect.gen(function* () {
    const normalizedExclude = yield* normalizedList(exclude, normalizePathLike)
    const normalizedDirs = yield* normalizedList(excludeDirs, normalizePathLike)
    const normalizedExtensions = yield* normalizedList(excludeExtensions, normalizeExtension)
    const normalizedInclude = yield* normalizedList(include, normalizePathLike)
    const normalizedIncludeDirs = yield* normalizedList(includeDirs, normalizePathLike)
    const maxFileSizeBytes =
      maxFileSize === null || maxFileSize.trim().length === 0
        ? null
        : yield* parseSizeToBytes(maxFileSize)

    return {
      exclude: normalizedExclude,
      excludeDirs: normalizedDirs,
      excludeExtensions: normalizedExtensions,
      include: normalizedInclude,
      includeDirs: normalizedIncludeDirs,
      maxFileSizeBytes
    } satisfies VendorFilter
  })
```

- [ ] **Step 1.6: Update `hasVendorFilter` to consider include fields**

Replace the predicate:

```typescript
export const hasVendorFilter = (filter: VendorFilter): boolean =>
  filter.exclude.length > 0 ||
  filter.excludeDirs.length > 0 ||
  filter.excludeExtensions.length > 0 ||
  filter.include.length > 0 ||
  filter.includeDirs.length > 0 ||
  filter.maxFileSizeBytes !== null
```

- [ ] **Step 1.7: Add allow-list semantics to `includedTreePaths`**

Add a helper above `isExcluded` (around line 165) and update the include logic:

```typescript
const inIncludedDir = (relativePath: string, includeDirs: ReadonlyArray<string>): boolean =>
  includeDirs.some((dir) => relativePath === dir || relativePath.startsWith(`${dir}/`))

const isIncluded = (entry: GitTreeEntry, filter: VendorFilter): boolean => {
  if (filter.include.length === 0 && filter.includeDirs.length === 0) return true
  if (inIncludedDir(entry.path, filter.includeDirs)) return true
  return matchesAnyGlob(entry.path, filter.include)
}
```

Replace `includedTreePaths`:

```typescript
export const includedTreePaths = ({
  entries,
  filter
}: IncludedTreePathsParams): ReadonlyArray<string> =>
  entries
    .filter(
      (entry) => entry.path.length > 0 && isIncluded(entry, filter) && !isExcluded(entry, filter)
    )
    .map((entry) => entry.path)
    .sort((a, b) => a.localeCompare(b))
```

- [ ] **Step 1.8: Run the suite to confirm tests pass**

Run: `bun test packages/cli/tests/vendor-filter.test.ts`
Expected: all previously failing tests now pass.

- [ ] **Step 1.9: Run the full test suite to catch any breakages**

Run: `bun run test`
Expected: full green. If `vendor-state.test.ts` complains about missing `include`/`includeDirs` keys in expected snapshots, that's covered in Task 4 — fix only the compile-time errors for now (likely none; the schema additions are optional).

- [ ] **Step 1.10: Commit**

```bash
git add packages/cli/src/domain/vendor-filter.ts packages/cli/tests/vendor-filter.test.ts
git commit -m "feat(filter): support positive include/include-dir selection in VendorFilter"
```

---

## Task 2: Parameterize `updateGitignore` for `.git/info/exclude`

**Files:**

- Modify: `packages/cli/src/project/gitignore.ts`
- Modify: `packages/cli/tests/gitignore.test.ts`
- Create: `packages/cli/tests/info-exclude.test.ts`

- [ ] **Step 2.1: Write failing test for the new `target` parameter writing to `.git/info/exclude`**

Create `packages/cli/tests/info-exclude.test.ts`:

```typescript
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { updateIgnoreFile } from "../src/project/gitignore.ts"

const makeRepo = () => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-info-exclude-"))
  mkdirSync(join(cwd, ".git", "info"), { recursive: true })
  return cwd
}

describe("updateIgnoreFile (info-exclude target)", () => {
  test("writes the sentineled block to .git/info/exclude", async () => {
    const cwd = makeRepo()

    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: ["vendor/effect"], target: "info-exclude" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )

    const target = join(cwd, ".git", "info", "exclude")
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(target, "utf-8")).toContain("# ingraft: clone-ignore begin")
    expect(readFileSync(target, "utf-8")).toContain("/vendor/effect/")
  })

  test("preserves unrelated content in .git/info/exclude", async () => {
    const cwd = makeRepo()
    const target = join(cwd, ".git", "info", "exclude")
    writeFileSync(target, "# pre-existing comment\nlocal-cache/\n")

    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: ["vendor/zod"], target: "info-exclude" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )

    const content = readFileSync(target, "utf-8")
    expect(content).toContain("# pre-existing comment")
    expect(content).toContain("local-cache/")
    expect(content).toContain("/vendor/zod/")
  })

  test("removes the block when prefixes is empty", async () => {
    const cwd = makeRepo()

    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: ["vendor/effect"], target: "info-exclude" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )
    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: [], target: "info-exclude" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )

    const target = join(cwd, ".git", "info", "exclude")
    if (!existsSync(target)) return // acceptable: file was removed
    const content = readFileSync(target, "utf-8")
    expect(content).not.toContain("# ingraft: clone-ignore begin")
  })
})
```

- [ ] **Step 2.2: Run it to confirm it fails**

Run: `bun test packages/cli/tests/info-exclude.test.ts`
Expected: failure — `updateIgnoreFile` is not exported yet.

- [ ] **Step 2.3: Parameterize `gitignore.ts` with a `target` field**

Replace `packages/cli/src/project/gitignore.ts` with:

```typescript
import { Array as Arr, Effect, FileSystem, Option, Path } from "effect"

export const GITIGNORE_CLONE_BEGIN = "# ingraft: clone-ignore begin"
export const GITIGNORE_CLONE_END = "# ingraft: clone-ignore end"

export type IgnoreTarget = "gitignore" | "info-exclude"

export interface MergeGitignoreTextParams {
  readonly content: string
  readonly prefixes: ReadonlyArray<string>
}

export interface UpdateIgnoreParams {
  readonly cwd: string
  readonly prefixes: ReadonlyArray<string>
  readonly target: IgnoreTarget
}

export interface UpdateGitignoreParams {
  readonly cwd: string
  readonly prefixes: ReadonlyArray<string>
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const normalizePrefix = (prefix: string): string => prefix.replace(/^\/+/, "").replace(/\/+$/, "")

const ignoredPrefix = (prefix: string): string => `/${normalizePrefix(prefix)}/`

const uniqueIgnoredPrefixes = (prefixes: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.dedupe(prefixes.map(ignoredPrefix)).sort((a, b) => a.localeCompare(b))

const sectionRegex = new RegExp(
  `(?:^|\\n)${escapeRegex(GITIGNORE_CLONE_BEGIN)}[\\s\\S]*?${escapeRegex(GITIGNORE_CLONE_END)}\\n?`
)

const renderSection = (prefixes: ReadonlyArray<string>): string =>
  [GITIGNORE_CLONE_BEGIN, ...uniqueIgnoredPrefixes(prefixes), GITIGNORE_CLONE_END].join("\n")

const trimTrailingBlankLines = (content: string): string => content.replace(/\n+$/g, "")

const targetRelativePath = (target: IgnoreTarget): ReadonlyArray<string> =>
  target === "gitignore" ? [".gitignore"] : [".git", "info", "exclude"]

export const mergeGitignoreText = ({ content, prefixes }: MergeGitignoreTextParams): string => {
  const normalized = trimTrailingBlankLines(content)
  if (prefixes.length === 0) {
    const next = normalized.replace(sectionRegex, "").replace(/\n{3,}/g, "\n\n")
    return next === "" ? "" : `${trimTrailingBlankLines(next)}\n`
  }

  const section = renderSection(prefixes)
  const next = sectionRegex.test(normalized)
    ? normalized.replace(sectionRegex, `\n${section}`)
    : [normalized, section].filter((part) => part.length > 0).join("\n\n")

  return `${trimTrailingBlankLines(next)}\n`
}

export const updateIgnoreFile = ({ cwd, prefixes, target }: UpdateIgnoreParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const relativeSegments = targetRelativePath(target)
    const absoluteTarget = path.resolve(cwd, ...relativeSegments)
    const content = (yield* fs.exists(absoluteTarget))
      ? yield* fs.readFileString(absoluteTarget)
      : ""
    const next = mergeGitignoreText({ content, prefixes })

    if (next === content) return Option.none<string>()
    if (next === "") {
      yield* fs.remove(absoluteTarget, { force: true })
      return Option.some(absoluteTarget)
    }

    yield* fs.makeDirectory(path.dirname(absoluteTarget), { recursive: true }).pipe(Effect.ignore)
    yield* fs.writeFileString(absoluteTarget, next)
    return Option.some(absoluteTarget)
  })

export const updateGitignore = ({ cwd, prefixes }: UpdateGitignoreParams) =>
  updateIgnoreFile({ cwd, prefixes, target: "gitignore" })
```

- [ ] **Step 2.4: Re-run gitignore and info-exclude tests**

Run: `bun test packages/cli/tests/gitignore.test.ts packages/cli/tests/info-exclude.test.ts`
Expected: both pass. The existing `updateGitignore` calls continue to work unchanged.

- [ ] **Step 2.5: Run full suite as a sanity check**

Run: `bun run test`
Expected: green.

- [ ] **Step 2.6: Commit**

```bash
git add packages/cli/src/project/gitignore.ts packages/cli/tests/gitignore.test.ts packages/cli/tests/info-exclude.test.ts
git commit -m "feat(gitignore): parameterize updateIgnoreFile with gitignore|info-exclude target"
```

---

## Task 3: Local-only state store at `.git/ingraft/state.json`

**Files:**

- Create: `packages/cli/src/domain/local-state.ts`
- Create: `packages/cli/tests/local-state.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `packages/cli/tests/local-state.test.ts`:

```typescript
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import {
  type LocalVendorEntry,
  readLocalVendorState,
  removeLocalVendorEntry,
  upsertLocalVendorEntry
} from "../src/domain/local-state.ts"

const makeRepo = () => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-local-state-"))
  mkdirSync(join(cwd, ".git"), { recursive: true })
  return cwd
}

const sampleEntry = (overrides: Partial<LocalVendorEntry> = {}): LocalVendorEntry => ({
  name: "effect",
  prefix: "vendor/effect",
  url: "https://github.com/Effect-TS/effect.git",
  ref: "main",
  resolvedRef: "abc123def456",
  strategy: "clone-ignore",
  filter: {
    exclude: [],
    excludeDirs: [],
    excludeExtensions: [],
    include: [],
    includeDirs: [],
    maxFileSizeBytes: null
  },
  syncPackage: undefined,
  addedAt: "2026-05-19T10:00:00.000Z",
  ...overrides
})

describe("local-state store", () => {
  test("returns an empty list when state file is missing", async () => {
    const cwd = makeRepo()

    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )

    expect(result).toEqual([])
  })

  test("upsert writes a new entry and reads it back", async () => {
    const cwd = makeRepo()
    const entry = sampleEntry()

    await Effect.runPromise(
      upsertLocalVendorEntry({ cwd, entry }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )
    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )

    expect(result).toEqual([entry])
    const raw = JSON.parse(readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8"))
    expect(raw.version).toBe(1)
    expect(raw.vendors).toHaveLength(1)
  })

  test("upsert replaces an existing entry with the same prefix", async () => {
    const cwd = makeRepo()
    const first = sampleEntry({ ref: "main", resolvedRef: "aaa111" })
    const second = sampleEntry({ ref: "v1.0.0", resolvedRef: "bbb222" })

    await Effect.runPromise(
      upsertLocalVendorEntry({ cwd, entry: first }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )
    await Effect.runPromise(
      upsertLocalVendorEntry({ cwd, entry: second }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )
    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )

    expect(result).toEqual([second])
  })

  test("remove drops the entry for a given prefix", async () => {
    const cwd = makeRepo()
    const a = sampleEntry({ name: "effect", prefix: "vendor/effect" })
    const b = sampleEntry({
      name: "zod",
      prefix: "vendor/zod",
      url: "https://github.com/colinhacks/zod.git"
    })

    await Effect.runPromise(
      Effect.flatMap(upsertLocalVendorEntry({ cwd, entry: a }), () =>
        upsertLocalVendorEntry({ cwd, entry: b })
      ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )
    await Effect.runPromise(
      removeLocalVendorEntry({ cwd, prefix: "vendor/effect" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )
    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )

    expect(result.map((entry) => entry.name)).toEqual(["zod"])
  })
})
```

- [ ] **Step 3.2: Run it to confirm failure**

Run: `bun test packages/cli/tests/local-state.test.ts`
Expected: module-not-found / import errors.

- [ ] **Step 3.3: Implement `local-state.ts`**

Create `packages/cli/src/domain/local-state.ts`:

```typescript
import { Effect, FileSystem, Path, Schema } from "effect"

import { VendorFilterSchema, type VendorFilter } from "./vendor-filter.ts"
import { VendorStrategySchema, type VendorStrategy } from "./vendor-strategy.ts"

const STATE_VERSION = 1
const STATE_RELATIVE_PATH = [".git", "ingraft", "state.json"] as const

export interface LocalVendorEntry {
  readonly name: string
  readonly prefix: string
  readonly url: string
  readonly ref: string
  readonly resolvedRef: string | undefined
  readonly strategy: VendorStrategy
  readonly filter: VendorFilter
  readonly syncPackage: string | undefined
  readonly addedAt: string
}

const LocalVendorEntrySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  prefix: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  url: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  ref: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  resolvedRef: Schema.optional(Schema.String),
  strategy: VendorStrategySchema,
  filter: VendorFilterSchema,
  syncPackage: Schema.optional(Schema.String),
  addedAt: Schema.String.pipe(Schema.check(Schema.isMinLength(1)))
})

const LocalStateSchema = Schema.Struct({
  version: Schema.Number,
  vendors: Schema.Array(LocalVendorEntrySchema)
})

export interface ReadLocalVendorStateParams {
  readonly cwd: string
}

export interface UpsertLocalVendorEntryParams {
  readonly cwd: string
  readonly entry: LocalVendorEntry
}

export interface RemoveLocalVendorEntryParams {
  readonly cwd: string
  readonly prefix: string
}

const statePath = (cwd: string, path: Path.Path): string =>
  path.resolve(cwd, ...STATE_RELATIVE_PATH)

const decodeState = Schema.decodeUnknownSync(LocalStateSchema)

const normalizeEntry = (entry: LocalVendorEntry): LocalVendorEntry => ({
  name: entry.name,
  prefix: entry.prefix.replace(/\/+$/, ""),
  url: entry.url,
  ref: entry.ref,
  resolvedRef: entry.resolvedRef,
  strategy: entry.strategy,
  filter: entry.filter,
  syncPackage: entry.syncPackage,
  addedAt: entry.addedAt
})

const writeStateAtomic = (params: {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly entries: ReadonlyArray<LocalVendorEntry>
}) =>
  Effect.gen(function* () {
    const target = statePath(params.cwd, params.path)
    yield* params.fs
      .makeDirectory(params.path.dirname(target), { recursive: true })
      .pipe(Effect.ignore)
    const tmp = `${target}.tmp`
    const body = `${JSON.stringify({ version: STATE_VERSION, vendors: params.entries }, null, 2)}\n`
    yield* params.fs.writeFileString(tmp, body)
    yield* params.fs.rename(tmp, target)
  })

export const readLocalVendorState = ({ cwd }: ReadLocalVendorStateParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = statePath(cwd, path)
    if (!(yield* fs.exists(target))) return [] as ReadonlyArray<LocalVendorEntry>
    const raw = yield* fs.readFileString(target)
    try {
      const decoded = decodeState(JSON.parse(raw))
      return decoded.vendors.map(normalizeEntry)
    } catch {
      return [] as ReadonlyArray<LocalVendorEntry>
    }
  })

export const upsertLocalVendorEntry = ({ cwd, entry }: UpsertLocalVendorEntryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const existing = yield* readLocalVendorState({ cwd })
    const normalized = normalizeEntry(entry)
    const next = [
      ...existing.filter((stored) => stored.prefix !== normalized.prefix),
      normalized
    ].sort((a, b) => a.prefix.localeCompare(b.prefix))
    yield* writeStateAtomic({ cwd, fs, path, entries: next })
  })

export const removeLocalVendorEntry = ({ cwd, prefix }: RemoveLocalVendorEntryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const existing = yield* readLocalVendorState({ cwd })
    const target = prefix.replace(/\/+$/, "")
    const next = existing.filter((stored) => stored.prefix !== target)
    if (next.length === existing.length) return
    if (next.length === 0) {
      const file = statePath(cwd, path)
      if (yield* fs.exists(file)) yield* fs.remove(file, { force: true })
      return
    }
    yield* writeStateAtomic({ cwd, fs, path, entries: next })
  })
```

- [ ] **Step 3.4: Run the local-state tests**

Run: `bun test packages/cli/tests/local-state.test.ts`
Expected: all four tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add packages/cli/src/domain/local-state.ts packages/cli/tests/local-state.test.ts
git commit -m "feat(local-state): add .git/ingraft/state.json reader/writer"
```

---

## Task 4: Add `localOnly` to `VendoredRepo` and merge sources in `listVendored`

**Files:**

- Modify: `packages/cli/src/domain/vendor-state.ts`
- Modify: `packages/cli/tests/vendor-state.test.ts`

- [ ] **Step 4.1: Write failing test for merged sources**

Append to `packages/cli/tests/vendor-state.test.ts`:

```typescript
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { listVendored } from "../src/domain/vendor-state.ts"

describe("listVendored with local state", () => {
  test("includes local-only entries from .git/ingraft/state.json", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ingraft-merge-"))
    mkdirSync(join(cwd, ".git", "ingraft"), { recursive: true })
    writeFileSync(
      join(cwd, ".git", "ingraft", "state.json"),
      JSON.stringify({
        version: 1,
        vendors: [
          {
            name: "effect",
            prefix: "vendor/effect",
            url: "https://github.com/Effect-TS/effect.git",
            ref: "main",
            resolvedRef: "abc",
            strategy: "clone-ignore",
            filter: {
              exclude: [],
              excludeDirs: [],
              excludeExtensions: [],
              include: [],
              includeDirs: [],
              maxFileSizeBytes: null
            },
            addedAt: "2026-05-19T00:00:00.000Z"
          }
        ]
      })
    )
    // Initialize as a git repo so repoRoot / listVendored read it
    const { execSync } = await import("node:child_process")
    execSync("git init -q", { cwd })

    const repos = await Effect.runPromise(
      listVendored(cwd).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    expect(repos.some((repo) => repo.prefix === "vendor/effect" && repo.localOnly === true)).toBe(
      true
    )
  })
})
```

- [ ] **Step 4.2: Run to confirm failure**

Run: `bun test packages/cli/tests/vendor-state.test.ts`
Expected: failure — `localOnly` field is unknown.

- [ ] **Step 4.3: Extend `VendoredRepoSchema` with optional `localOnly`**

In `packages/cli/src/domain/vendor-state.ts`, update the schema:

```typescript
export const VendoredRepoSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  prefix: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  url: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  ref: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  resolvedRef: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  strategy: VendorStrategySchema,
  filter: VendorFilterSchema,
  syncPackage: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  sha: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  date: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  localOnly: Schema.optionalKey(Schema.Boolean)
})
```

The trailer-derived `VendoredLogRecord` also needs `localOnly: Schema.optional(Schema.Boolean)` if you reuse `VendoredRepoSchema.fields`. Audit `VendoredLogRecordSchema` for compatibility; default reads to `undefined` (falsy).

- [ ] **Step 4.4: Implement the merge in `listVendored`**

At the top of `vendor-state.ts`, import the local-state module:

```typescript
import { readLocalVendorState } from "./local-state.ts"
```

Replace the existing `listVendored` with a merging implementation:

```typescript
export const listVendored = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const gitMetadata = yield* GitMetadata
    const parsed = yield* gitMetadata.listCommits(cwd).pipe(
      Effect.map(parseVendoredCommitsWithDiagnostics),
      Effect.catch(() => listVendoredWithGit(cwd))
    )
    yield* Effect.forEach(parsed.diagnostics, (diagnostic) => Effect.logDebug(diagnostic.reason), {
      discard: true
    })
    const trailerRepos = yield* Effect.filter(parsed.repos, (repo) =>
      repo.strategy === "clone-ignore" || repo.strategy === "cache-link"
        ? Effect.succeed(true)
        : fs.exists(path.resolve(cwd, repo.prefix))
    )
    const localEntries = yield* readLocalVendorState({ cwd })
    const trailerByPrefix = new Map(trailerRepos.map((repo) => [repo.prefix, repo] as const))
    const localRepos = localEntries
      .filter((entry) => !trailerByPrefix.has(entry.prefix))
      .map<VendoredRepo>((entry) => ({
        name: entry.name,
        prefix: entry.prefix,
        url: entry.url,
        ref: entry.ref,
        ...(entry.resolvedRef === undefined ? {} : { resolvedRef: entry.resolvedRef }),
        strategy: entry.strategy,
        filter: entry.filter,
        ...(entry.syncPackage === undefined ? {} : { syncPackage: entry.syncPackage }),
        sha: "local-only",
        date: entry.addedAt,
        localOnly: true
      }))
    return [...trailerRepos, ...localRepos].sort((a, b) => a.name.localeCompare(b.name))
  })
```

- [ ] **Step 4.5: Run the suite to confirm**

Run: `bun test packages/cli/tests/vendor-state.test.ts`
Expected: the new test passes; existing tests still pass (existing snapshots may need `localOnly: undefined` — if the schema uses `optionalKey`, undefined values are omitted from the parsed object, so existing snapshots remain equivalent).

- [ ] **Step 4.6: Run full suite**

Run: `bun run test`
Expected: green.

- [ ] **Step 4.7: Commit**

```bash
git add packages/cli/src/domain/vendor-state.ts packages/cli/tests/vendor-state.test.ts
git commit -m "feat(vendor-state): merge .git/ingraft/state.json into listVendored"
```

---

## Task 5: Add `--local-only`, `--include`, `--include-dir` flags to `add`

**Files:**

- Modify: `packages/cli/src/commands/add.tsx`
- Modify: `packages/cli/src/config/ingraft.ts`
- Modify: `packages/cli/src/domain/errors.ts`
- Modify: `packages/cli/src/cli.tsx` (handler registration)

- [ ] **Step 5.1: Add new error tag for invalid `--local-only` strategy combos**

In `packages/cli/src/domain/errors.ts`, add the error class and params:

```typescript
export interface InvalidLocalOnlyStrategyParams {
  readonly strategy: VendorStrategy
}

export class InvalidLocalOnlyStrategy extends Data.TaggedError(
  "InvalidLocalOnlyStrategy"
)<InvalidLocalOnlyStrategyParams> {}
```

Append to `VendorError`:

```typescript
| InvalidLocalOnlyStrategy
```

Add a case in `errorPresentation`:

```typescript
case "InvalidLocalOnlyStrategy":
  return {
    title: `--local-only is not compatible with ${error.strategy}`,
    detail:
      error.strategy === "subtree"
        ? "subtree commits the upstream source into the host repository, which contradicts --local-only."
        : "submodule commits a gitlink, which contradicts --local-only.",
    hint: "Use --strategy clone-ignore (default) or --strategy cache-link with --local-only.",
    code: 2
  }
```

In `packages/cli/src/cli.tsx`, add the new tag to `catchTags` next to `UnsupportedVendorFilter`:

```typescript
InvalidLocalOnlyStrategy: handleVendorError,
```

- [ ] **Step 5.2: Add new flag definitions in `add.tsx`**

Around line 280 in `packages/cli/src/commands/add.tsx`, after `addMaxFileSizeOption`, add:

```typescript
const addIncludeOption = Flag.string("include").pipe(
  Flag.withDescription(
    "Repo-relative glob to keep from materialized source. Repeatable, for example --include 'src/**/*.ts'. When set, only matching paths are vendored (allow-list)."
  ),
  Flag.atLeast(0)
)

const addIncludeDirOption = Flag.string("include-dir").pipe(
  Flag.withDescription(
    "Repo-relative directory to keep from materialized source. Repeatable, for example --include-dir src. When set, only matching subtrees are vendored (allow-list)."
  ),
  Flag.atLeast(0)
)

const addLocalOnlyOption = Flag.boolean("local-only").pipe(
  Flag.withAliases(["no-commit"]),
  Flag.withDescription(
    "Vendor entirely outside tracked git state. Writes the ignore block to .git/info/exclude, persists metadata in .git/ingraft/state.json, and skips host repository commits. Valid only with clone-ignore or cache-link."
  )
)
```

If `Flag.withAliases` is not present in this version of effect/unstable/cli, use `Flag.withAlias("no-commit")` (singular) instead.

- [ ] **Step 5.3: Extend `AddCommandParams` and the `Command.make` config**

Edit the `AddCommandParams` interface at the top of `add.tsx`:

```typescript
export interface AddCommandParams {
  readonly repo: string
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
  readonly syncPackage: Option.Option<string>
  readonly cloudflareArtifact: boolean
  readonly cloudflareArtifactDepth: Option.Option<string>
  readonly cloudflareArtifactName: Option.Option<string>
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly include: ReadonlyArray<string>
  readonly includeDirs: ReadonlyArray<string>
  readonly maxFileSize: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly name: Option.Option<string>
  readonly strategy: VendorStrategy
  readonly localOnly: boolean
}
```

Mirror on `AddManyCommandParams`. Update the `addCmd` `Command.make` block at the bottom of the file:

```typescript
{
  repos: addRepoArgs,
  ref: addRefOption,
  tag: addTagOption,
  release: addReleaseOption,
  syncPackage: addSyncPackageOption,
  cloudflareArtifact: addCloudflareArtifactOption,
  cloudflareArtifactDepth: addCloudflareArtifactDepthOption,
  cloudflareArtifactName: addCloudflareArtifactNameOption,
  exclude: addExcludeOption,
  excludeDirs: addExcludeDirOption,
  excludeExtensions: addExcludeExtOption,
  include: addIncludeOption,
  includeDirs: addIncludeDirOption,
  maxFileSize: addMaxFileSizeOption,
  prefix: addPrefixOption,
  name: addNameOption,
  strategy: addStrategyOption,
  localOnly: addLocalOnlyOption
}
```

- [ ] **Step 5.4: Thread `include`/`includeDirs` into the filter and `localOnly` into validation**

In `addImpl`, the filter construction call (around line 1021) becomes:

```typescript
const filter =
  yield *
  vendorFilterFromOptions({
    exclude,
    excludeDirs,
    excludeExtensions,
    include,
    includeDirs,
    maxFileSize: Option.getOrNull(maxFileSize)
  })
```

After the existing `(finalStrategy === "submodule" || finalStrategy === "cache-link") && hasVendorFilter(filter)` block, add validation for `--local-only`:

```typescript
if (localOnly && (finalStrategy === "subtree" || finalStrategy === "submodule")) {
  return yield * Effect.fail(new InvalidLocalOnlyStrategy({ strategy: finalStrategy }))
}
```

When `localOnly` is requested and no `--strategy` was provided, auto-pick `clone-ignore` instead of the existing default. Replace the strategy resolution block above the validation:

```typescript
const requestedStrategy = Option.isSome(strategy) ? strategy.value : undefined
const baselineStrategy = localOnly
  ? (requestedStrategy ?? "clone-ignore")
  : (requestedStrategy ?? DEFAULT_VENDOR_STRATEGY)
```

…and use `baselineStrategy` everywhere `requested:` was previously sourced from the option, feeding it into `effectiveVendorStrategy`. (Audit lines 964-973 — preserve jj-colocated behavior; jj already forces `clone-ignore`, which is compatible.)

Also expand `IngraftAddDefaults` in `packages/cli/src/config/ingraft.ts` if defaults for include/local-only are exposed in `.ingraft/config.toml` (optional; add `include`, `include-dirs`, `local-only` keys to `DefaultsSchema` and `IngraftAddDefaults`, mirroring exclude). Tests for config defaults live in `ingraft-config.test.ts`.

- [ ] **Step 5.5: Update `addManyImpl` and the root `vendorCommand` in `cli.tsx`**

Pass `include: []`, `includeDirs: []`, `localOnly: false` through to `addManyImpl` in:

- `packages/cli/src/cli.tsx` (the `vendorCommand` block, around line 41-62)
- Any default invocations in tests.

- [ ] **Step 5.6: Run typecheck**

Run: `bun run typecheck`
Expected: no errors. If `include`/`includeDirs`/`localOnly` are missing anywhere, the compiler will tell you.

- [ ] **Step 5.7: Commit**

```bash
git add packages/cli/src/commands/add.tsx packages/cli/src/domain/errors.ts packages/cli/src/cli.tsx packages/cli/src/config/ingraft.ts
git commit -m "feat(add): plumb --local-only, --include, --include-dir flags"
```

---

## Task 6: Branch `addCloneIgnore` and `addCacheLink` on `localOnly`

**Files:**

- Modify: `packages/cli/src/commands/add.tsx`
- Create/Modify: `packages/cli/tests/add-targets.test.ts` (add local-only tests)

- [ ] **Step 6.1: Create the shared fixture and write the integration test**

First create `packages/cli/tests/helpers/local-vendor-fixture.ts` using the code in the "Shared test scaffolding" section above. Then create `packages/cli/tests/add-local-only.test.ts`:

```typescript
import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { addImpl } from "../src/commands/add.tsx"
import {
  defaultAddParams,
  initBareUpstream,
  initLocalRepo
} from "./helpers/local-vendor-fixture.ts"

describe("add --local-only (clone-ignore)", () => {
  test("writes .git/info/exclude, state.json, and produces zero new commits", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    const headBefore = execSync("git rev-parse HEAD", { cwd }).toString().trim()

    await Effect.runPromise(
      addImpl(
        defaultAddParams({
          repo: upstream,
          ref: Option.some("main"),
          name: Option.some("upstream"),
          strategy: "clone-ignore",
          localOnly: true
        })
      ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    const headAfter = execSync("git rev-parse HEAD", { cwd }).toString().trim()
    expect(headAfter).toBe(headBefore)
    expect(existsSync(join(cwd, ".git", "info", "exclude"))).toBe(true)
    expect(readFileSync(join(cwd, ".git", "info", "exclude"), "utf-8")).toContain(
      "# ingraft: clone-ignore begin"
    )
    expect(existsSync(join(cwd, ".git", "ingraft", "state.json"))).toBe(true)
    const state = JSON.parse(readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8"))
    expect(state.vendors.map((entry: { prefix: string }) => entry.prefix)).toContain(
      "vendor/upstream"
    )
    if (existsSync(join(cwd, ".gitignore"))) {
      expect(readFileSync(join(cwd, ".gitignore"), "utf-8")).not.toContain(
        "# ingraft: clone-ignore begin"
      )
    }
  })

  test("rejects --local-only with --strategy subtree", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()

    const exit = await Effect.runPromiseExit(
      addImpl(
        defaultAddParams({
          repo: upstream,
          ref: Option.some("main"),
          strategy: "subtree",
          localOnly: true
        })
      ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    expect(exit._tag).toBe("Failure")
  })
})
```

The fixture's `defaultAddParams` produces an already-typed `AddCommandParams` from the updated `Task 5` interface, so no `as any` casts are needed.

- [ ] **Step 6.2: Run to confirm failure**

Run: `bun test packages/cli/tests/add-local-only.test.ts`
Expected: failure — `localOnly` is not consumed by the implementations yet.

- [ ] **Step 6.3: Update `addCloneIgnore` to branch on `localOnly`**

Replace `addCloneIgnore` in `packages/cli/src/commands/add.tsx` (around lines 773-874). Add `localOnly` to `AddStrategyParams` interface first if it isn't there.

```typescript
const addCloneIgnore = ({
  cloudflareArtifact,
  cwd,
  existingRepos,
  filter,
  finalName,
  finalPrefix,
  finalRef,
  localOnly,
  syncPackage,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    yield* ensureParentDirectory({ cwd, prefix: finalPrefix })
    if (hasVendorFilter(filter)) {
      if (cloudflareArtifact.enabled) {
        const imported = yield* importArtifactRemote({
          artifact: cloudflareArtifact,
          name: finalName,
          ref: finalRef,
          url
        })
        yield* checkoutFilteredRepo({
          cwd,
          filter,
          redactedUrl: imported.redactedUrl,
          ref: finalRef,
          storedRemoteUrl: url,
          target: finalPrefix,
          url: imported.cloneUrl
        })
      } else {
        yield* checkoutFilteredRepo({
          cwd,
          filter,
          ref: finalRef,
          target: finalPrefix,
          url
        })
      }
    } else {
      yield* cloneVendorRepo({
        artifact: cloudflareArtifact,
        cwd,
        name: finalName,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        url
      })
      yield* checkoutVendorRef({
        cwd,
        prefix: finalPrefix,
        ref: finalRef,
        strategy
      })
      if (cloudflareArtifact.enabled) {
        yield* setCloneOrigin({
          cwd,
          prefix: finalPrefix,
          strategy,
          url
        })
      }
    }

    const resolvedRefValue = yield* readResolvedRef({ cwd, prefix: finalPrefix })

    if (localOnly) {
      yield* updateIgnoreFile({
        cwd,
        target: "info-exclude",
        prefixes: [
          ...existingRepos
            .filter(
              (repo) => isLocalIgnoredVendorStrategy(repo.strategy) && repo.localOnly === true
            )
            .map((repo) => repo.prefix),
          finalPrefix
        ]
      })
      yield* upsertLocalVendorEntry({
        cwd,
        entry: {
          name: finalName,
          prefix: finalPrefix,
          url,
          ref: finalRef,
          resolvedRef: resolvedRefValue,
          strategy,
          filter,
          syncPackage: Option.getOrUndefined(syncPackage),
          addedAt: new Date().toISOString()
        }
      })
      return
    }

    yield* updateIgnoreFile({
      cwd,
      target: "gitignore",
      prefixes: [
        ...existingRepos
          .filter((repo) => isLocalIgnoredVendorStrategy(repo.strategy) && repo.localOnly !== true)
          .map((repo) => repo.prefix),
        finalPrefix
      ]
    })
    const message = subtreeAddMessage({
      filter,
      name: finalName,
      prefix: finalPrefix,
      ref: finalRef,
      strategy,
      syncPackage,
      url
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitignore"],
      message
    })
    if (!committed) yield* emptyCommit({ cwd, message })
  })
```

Imports to add at the top of `add.tsx`:

```typescript
import { updateIgnoreFile } from "../project/gitignore.ts"
import { upsertLocalVendorEntry } from "../domain/local-state.ts"
```

`readResolvedRef` is a helper to add to `packages/cli/src/services/git.ts`:

```typescript
export const readResolvedRef = ({
  cwd,
  prefix
}: {
  readonly cwd: string
  readonly prefix: string
}) =>
  git(["-C", prefix, "rev-parse", "HEAD"], { cwd }).pipe(
    Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : undefined))
  )
```

- [ ] **Step 6.4: Mirror in `addCacheLink`**

Same pattern: when `localOnly`, write to `.git/info/exclude` and `upsertLocalVendorEntry`, skip the commits.

- [ ] **Step 6.5: Update `AddStrategyParams` to include `localOnly`**

In the same file:

```typescript
interface AddStrategyParams {
  // ... existing fields
  readonly localOnly: boolean
}
```

And pass it through `addByStrategy` and the caller in `addImpl`.

- [ ] **Step 6.6: Update the post-add `projectFiles.refresh` call**

When `localOnly`, the existing call to `projectFiles.refresh({ cwd, repos, commitMessage: ..., editorSettings: true })` creates a commit. We need to suppress commits originated by ingraft for local-only adds. Two paths:

- Easiest: skip `projectFiles.refresh` entirely for local-only adds, since `.git/info/exclude` already handles ignore semantics.
- Better: pass `commitMessage: undefined` (or a new `commit: false` option) so `projectFiles.refresh` runs the refresh on disk but skips its own commit.

For v1, branch in `addImpl`:

```typescript
if (!localOnly) {
  const projectFiles = yield * ProjectFiles
  const repos = yield * listVendored(cwd)
  yield *
    projectFiles.refresh({
      cwd,
      repos,
      commitMessage: `vendor: register ${finalName}`,
      editorSettings: true
    })
}
```

Verify in the test that `git log` shows zero new commits after local-only add. (The earlier test already asserts this.)

- [ ] **Step 6.7: Run integration test**

Run: `bun test packages/cli/tests/add-local-only.test.ts`
Expected: passes.

- [ ] **Step 6.8: Run full suite**

Run: `bun run test`
Expected: green. Some snapshot or list tests may need updating if they include `localOnly` in their expected output.

- [ ] **Step 6.9: Commit**

```bash
git add packages/cli/src/commands/add.tsx packages/cli/src/services/git.ts packages/cli/tests/
git commit -m "feat(add): support --local-only on clone-ignore and cache-link strategies"
```

---

## Task 7: Local-only update path

**Files:**

- Modify: `packages/cli/src/commands/update.tsx`
- Modify: `packages/cli/tests/update.test.ts`

- [ ] **Step 7.1: Write failing test**

Append to `packages/cli/tests/update.test.ts`:

```typescript
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Effect, Option } from "effect"
import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { addImpl } from "../src/commands/add.tsx"
import { updateImpl } from "../src/commands/update.tsx"
import {
  advanceUpstream,
  defaultAddParams,
  initBareUpstream,
  initLocalRepo
} from "./helpers/local-vendor-fixture.ts"

test("updating a local-only entry does not create a commit", async () => {
  const cwd = initLocalRepo()
  const upstream = initBareUpstream()

  // Seed: a local-only vendor entry
  await Effect.runPromise(
    addImpl(
      defaultAddParams({
        repo: upstream,
        ref: Option.some("main"),
        name: Option.some("upstream"),
        strategy: "clone-ignore",
        localOnly: true
      })
    ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
  )

  const headBefore = execSync("git rev-parse HEAD", { cwd }).toString().trim()
  const stateBefore = JSON.parse(readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8"))
  const resolvedBefore = stateBefore.vendors[0].resolvedRef

  // Advance upstream so update has something to fetch
  advanceUpstream(upstream, "README.md", "hello updated\n")

  await Effect.runPromise(
    updateImpl({ name: Option.some("upstream"), all: false }).pipe(
      Effect.provide(LiveLayer),
      Effect.provide(RuntimeConfigLive)
    )
  )

  const headAfter = execSync("git rev-parse HEAD", { cwd }).toString().trim()
  expect(headAfter).toBe(headBefore)
  const stateAfter = JSON.parse(readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8"))
  expect(stateAfter.vendors[0].resolvedRef).not.toBe(resolvedBefore)
})
```

- [ ] **Step 7.2: Run to confirm failure**

Run: `bun test packages/cli/tests/update.test.ts`
Expected: failure — the current `updateCloneIgnore` may still try to `commitPathsIfChanged` via `refreshAfterUpdate`.

- [ ] **Step 7.3: Branch update behavior on `repo.localOnly`**

In `packages/cli/src/commands/update.tsx`, modify `updateByStrategy` and `updateOne`:

```typescript
const updateOne = ({ cwd, repo }: VendoredRepoCommandParams) =>
  resolveRepoForUpdate({ cwd, repo }).pipe(
    Effect.tap((resolvedRepo) =>
      info(`Updating ${resolvedRepo.name}: ${resolvedRepo.url} @ ${resolvedRepo.ref}`)
    ),
    Effect.flatMap((resolvedRepo) =>
      updateByStrategy({ cwd, repo: resolvedRepo }).pipe(
        Effect.flatMap(() =>
          resolvedRepo.localOnly === true
            ? syncLocalState({ cwd, repo: resolvedRepo })
            : Effect.void
        ),
        Effect.as(resolvedRepo)
      )
    )
    // ... rest unchanged
  )
```

`syncLocalState` reads the new resolved ref from the cloned vendor and calls `upsertLocalVendorEntry` (defined in Task 3). The commit emitted by the existing `updateCacheLink` path needs guarding:

```typescript
const updateCacheLink = ({ cwd, repo }: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    const checkout = yield* ensureCacheLinkCheckout({
      action: "update",
      cwd,
      ref: repo.ref,
      strategy: repo.strategy,
      url: repo.url
    })
    yield* linkCacheCheckout({
      cachePath: checkout.cachePath,
      cwd,
      prefix: repo.prefix
    })
    if (repo.localOnly === true) {
      yield* upsertLocalVendorEntry({
        cwd,
        entry: localEntryFromVendoredRepo(repo, checkout.resolvedRef)
      })
      return
    }
    if (checkout.resolvedRef !== repo.resolvedRef) {
      yield* emptyCommit({
        cwd,
        message: updateMessage({ ...repo, resolvedRef: checkout.resolvedRef })
      })
    }
  })
```

Add a local helper `localEntryFromVendoredRepo` that converts a `VendoredRepo` + new `resolvedRef` into a `LocalVendorEntry`.

Also gate `refreshAfterUpdate` so it only commits when at least one tracked (non-local-only) entry exists:

```typescript
const refreshAfterUpdate = (cwd: string) =>
  Effect.gen(function* () {
    const projectFiles = yield* ProjectFiles
    const reposAfter = yield* listVendored(cwd)
    const trackedRepos = reposAfter.filter((repo) => repo.localOnly !== true)
    if (trackedRepos.length === 0) return
    yield* projectFiles.refresh({
      cwd,
      repos: reposAfter,
      commitMessage: "vendor: refresh project vendor files after update",
      editorSettings: true
    })
  })
```

- [ ] **Step 7.4: Run update test**

Run: `bun test packages/cli/tests/update.test.ts`
Expected: passes.

- [ ] **Step 7.5: Commit**

```bash
git add packages/cli/src/commands/update.tsx packages/cli/tests/update.test.ts
git commit -m "feat(update): treat localOnly vendors as commit-free updates"
```

---

## Task 8: Local-only remove path

**Files:**

- Modify: `packages/cli/src/commands/remove.tsx`
- Modify: `packages/cli/tests/remove-history.test.ts` (or add a remove-local-only test file)

- [ ] **Step 8.1: Write failing test**

Add to `packages/cli/tests/remove-history.test.ts`:

```typescript
import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { Effect, Option } from "effect"
import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { addImpl } from "../src/commands/add.tsx"
import { removeImpl } from "../src/commands/remove.tsx"
import {
  defaultAddParams,
  initBareUpstream,
  initLocalRepo
} from "./helpers/local-vendor-fixture.ts"

test("removing a local-only entry does not create a commit and clears state.json", async () => {
  const cwd = initLocalRepo()
  const upstream = initBareUpstream()

  await Effect.runPromise(
    addImpl(
      defaultAddParams({
        repo: upstream,
        ref: Option.some("main"),
        name: Option.some("upstream"),
        strategy: "clone-ignore",
        localOnly: true
      })
    ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
  )

  const headBefore = execSync("git rev-parse HEAD", { cwd }).toString().trim()

  await Effect.runPromise(
    removeImpl({ name: "upstream", dangerouslyRewriteHistory: false }).pipe(
      Effect.provide(LiveLayer),
      Effect.provide(RuntimeConfigLive)
    )
  )

  const headAfter = execSync("git rev-parse HEAD", { cwd }).toString().trim()
  expect(headAfter).toBe(headBefore)
  expect(existsSync(join(cwd, "vendor", "upstream"))).toBe(false)
  const statePath = join(cwd, ".git", "ingraft", "state.json")
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf-8"))
    expect(state.vendors).toEqual([])
  }
})
```

- [ ] **Step 8.2: Run to confirm failure**

Run: `bun test packages/cli/tests/remove-history.test.ts`
Expected: failure — the current `removeCloneIgnore` calls `commitPathsIfChanged`/`emptyCommit` unconditionally.

- [ ] **Step 8.3: Branch `removeImpl` on `target.localOnly`**

In `packages/cli/src/commands/remove.tsx`, replace the `if (isLocalIgnoredVendorStrategy(target.strategy))` block:

```typescript
if (target.localOnly === true) {
  yield * removeLocalOnly({ cwd, reposBefore, target })
} else if (isLocalIgnoredVendorStrategy(target.strategy)) {
  yield * removeCloneIgnore({ cwd, reposBefore, target })
} else {
  yield * removeFromGit({ cwd, target })
  yield * gitChecked(["commit", "-m", removeMessage(target)], { cwd })
}
```

Add `removeLocalOnly`:

```typescript
const removeLocalOnly = ({ cwd, reposBefore, target }: RemoveCloneIgnoreParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.remove(path.resolve(cwd, target.prefix), {
      force: true,
      recursive: true
    })
    yield* updateIgnoreFile({
      cwd,
      target: "info-exclude",
      prefixes: reposBefore
        .filter((repo) => repo.localOnly === true && repo.prefix !== target.prefix)
        .map((repo) => repo.prefix)
    })
    yield* removeLocalVendorEntry({ cwd, prefix: target.prefix })
  })
```

And gate the post-remove `projectFiles.refresh` block on whether any tracked vendors remain:

```typescript
const reposAfter = yield * listVendored(cwd)
const trackedRemain = reposAfter.some((repo) => repo.localOnly !== true)
if (trackedRemain || target.localOnly !== true) {
  const projectFiles = yield * ProjectFiles
  yield *
    projectFiles.refresh({
      cwd,
      repos: reposAfter,
      commitMessage: `vendor: refresh project vendor files after removing ${target.name}`,
      editorSettings: true
    })
}
```

Imports to add:

```typescript
import { updateIgnoreFile } from "../project/gitignore.ts"
import { removeLocalVendorEntry } from "../domain/local-state.ts"
```

- [ ] **Step 8.4: Run remove tests**

Run: `bun test packages/cli/tests/remove-history.test.ts`
Expected: passes.

- [ ] **Step 8.5: Commit**

```bash
git add packages/cli/src/commands/remove.tsx packages/cli/tests/remove-history.test.ts
git commit -m "feat(remove): drop localOnly vendors without writing commits"
```

---

## Task 9: `ingraft.forkMode` config helper

**Files:**

- Create: `packages/cli/src/domain/fork-mode.ts`
- Create: `packages/cli/tests/fork-mode.test.ts`

- [ ] **Step 9.1: Write failing tests**

Create `packages/cli/tests/fork-mode.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { type ForkMode, readForkMode, writeForkMode } from "../src/domain/fork-mode.ts"

const initRepo = () => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-forkmode-"))
  execSync("git init -q", { cwd })
  return cwd
}

describe("fork mode config", () => {
  test("returns undefined when ingraft.forkMode is unset", async () => {
    const cwd = initRepo()

    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    expect(mode).toBeUndefined()
  })

  test("writes and reads back personal", async () => {
    const cwd = initRepo()

    await Effect.runPromise(
      writeForkMode({ cwd, mode: "personal" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )
    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    expect(mode).toBe("personal")
  })

  test("writes and reads back contribute", async () => {
    const cwd = initRepo()

    await Effect.runPromise(
      writeForkMode({ cwd, mode: "contribute" }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(RuntimeConfigLive)
      )
    )
    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    expect(mode).toBe("contribute")
  })

  test("ignores unrecognized values from git config", async () => {
    const cwd = initRepo()
    execSync("git config ingraft.forkMode garbage", { cwd })

    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    expect(mode).toBeUndefined()
  })
})
```

- [ ] **Step 9.2: Run to confirm failure**

Run: `bun test packages/cli/tests/fork-mode.test.ts`
Expected: module-not-found.

- [ ] **Step 9.3: Implement `fork-mode.ts`**

Create `packages/cli/src/domain/fork-mode.ts`:

```typescript
import { Effect } from "effect"

import { git } from "../services/git.ts"

export type ForkMode = "personal" | "contribute"

const FORK_MODE_CONFIG_KEY = "ingraft.forkMode"

export interface ReadForkModeParams {
  readonly cwd: string
}

export interface WriteForkModeParams {
  readonly cwd: string
  readonly mode: ForkMode
}

export interface ClearForkModeParams {
  readonly cwd: string
}

const parseForkMode = (value: string): ForkMode | undefined => {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "personal" || trimmed === "contribute") return trimmed
  return undefined
}

export const readForkMode = ({
  cwd
}: ReadForkModeParams): Effect.Effect<
  ForkMode | undefined,
  never,
  Awaited<ReturnType<typeof git>> extends Effect.Effect<infer _A, infer _E, infer R> ? R : never
> =>
  git(["config", "--get", FORK_MODE_CONFIG_KEY], { cwd }).pipe(
    Effect.map((result) => (result.exitCode === 0 ? parseForkMode(result.stdout) : undefined)),
    Effect.catch(() => Effect.succeed(undefined))
  )

export const writeForkMode = ({ cwd, mode }: WriteForkModeParams) =>
  git(["config", FORK_MODE_CONFIG_KEY, mode], { cwd }).pipe(Effect.asVoid)

export const clearForkMode = ({ cwd }: ClearForkModeParams) =>
  git(["config", "--unset", FORK_MODE_CONFIG_KEY], { cwd }).pipe(Effect.asVoid)
```

The `Effect.Effect<ForkMode | undefined, never, …>` type annotation is verbose — feel free to let TypeScript infer the requirements; the inline annotation above is just illustrative. Use `Effect.fn("ForkMode.read")` if you want spans/telemetry like other helpers.

- [ ] **Step 9.4: Run the fork-mode tests**

Run: `bun test packages/cli/tests/fork-mode.test.ts`
Expected: passes.

- [ ] **Step 9.5: Commit**

```bash
git add packages/cli/src/domain/fork-mode.ts packages/cli/tests/fork-mode.test.ts
git commit -m "feat(fork-mode): read/write ingraft.forkMode in git config"
```

---

## Task 10: Fork detection helper

**Files:**

- Modify: `packages/cli/src/domain/fork-mode.ts` (or new `fork-detect.ts`)
- Modify: `packages/cli/tests/fork-mode.test.ts`

- [ ] **Step 10.1: Write failing tests for detection**

Add to `packages/cli/tests/fork-mode.test.ts`:

```typescript
describe("fork detection", () => {
  test("detects a fork via gh repo view", async () => {
    const result = await Effect.runPromise(
      detectFork({ cwd: "/tmp/fake" }).pipe(
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: (args) => {
              expect(args).toEqual(["repo", "view", "--json", "isFork,parent"])
              return Effect.succeed({
                stdout: JSON.stringify({
                  isFork: true,
                  parent: { nameWithOwner: "upstream/repo" }
                }),
                stderr: "",
                exitCode: 0
              })
            }
          })
        )
        // ... other layers
      )
    )

    expect(result).toEqual({
      isFork: true,
      parentNameWithOwner: "upstream/repo",
      source: "gh"
    })
  })

  test("falls back to upstream remote heuristic when gh is unavailable", async () => {
    // Setup a temp git repo with origin + upstream remotes pointed at different owners
    // Provide a Git service stub that returns the remote URLs and a GitHubCli stub that fails
    // assert that detectFork returns { isFork: true, parentNameWithOwner: ..., source: "remotes" }
  })

  test("returns not-a-fork when no signals match", async () => {
    // GitHubCli fails, no upstream remote
    // assert: { isFork: false }
  })
})
```

- [ ] **Step 10.2: Run to confirm failure**

Run: `bun test packages/cli/tests/fork-mode.test.ts`
Expected: `detectFork` not exported.

- [ ] **Step 10.3: Implement detection**

Add to `packages/cli/src/domain/fork-mode.ts`:

```typescript
import { Schema } from "effect"

import { GitHubCli } from "../services/gh.ts"

const GhRepoViewSchema = Schema.Struct({
  isFork: Schema.Boolean,
  parent: Schema.NullOr(
    Schema.Struct({
      nameWithOwner: Schema.String
    })
  )
})

export interface DetectForkResult {
  readonly isFork: boolean
  readonly parentNameWithOwner?: string
  readonly source: "gh" | "remotes" | "none"
}

export interface DetectForkParams {
  readonly cwd: string
}

const detectForkViaGh = ({ cwd }: DetectForkParams) =>
  Effect.gen(function* () {
    const cli = yield* GitHubCli
    const result = yield* cli.exec(["repo", "view", "--json", "isFork,parent"], { cwd })
    if (result.exitCode !== 0) return undefined
    try {
      const parsed = Schema.decodeUnknownSync(GhRepoViewSchema)(JSON.parse(result.stdout))
      return {
        isFork: parsed.isFork,
        parentNameWithOwner: parsed.parent?.nameWithOwner,
        source: "gh" as const
      } satisfies DetectForkResult
    } catch {
      return undefined
    }
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))

const detectForkViaRemotes = ({ cwd }: DetectForkParams) =>
  git(["remote", "get-url", "upstream"], { cwd }).pipe(
    Effect.map((result) =>
      result.exitCode === 0 && result.stdout.trim().length > 0
        ? ({
            isFork: true,
            parentNameWithOwner: undefined,
            source: "remotes" as const
          } satisfies DetectForkResult)
        : undefined
    ),
    Effect.catch(() => Effect.succeed(undefined))
  )

export const detectFork = (params: DetectForkParams) =>
  Effect.gen(function* () {
    const viaGh = yield* detectForkViaGh(params)
    if (viaGh !== undefined) return viaGh
    const viaRemotes = yield* detectForkViaRemotes(params)
    if (viaRemotes !== undefined) return viaRemotes
    return { isFork: false, source: "none" as const } satisfies DetectForkResult
  })
```

- [ ] **Step 10.4: Run fork-mode tests**

Run: `bun test packages/cli/tests/fork-mode.test.ts`
Expected: green.

- [ ] **Step 10.5: Commit**

```bash
git add packages/cli/src/domain/fork-mode.ts packages/cli/tests/fork-mode.test.ts
git commit -m "feat(fork-mode): detect fork via gh CLI and upstream remote"
```

---

## Task 11: First-run prompt in `init`

**Files:**

- Modify: `packages/cli/src/commands/init.tsx`
- Modify: `packages/cli/src/services/prompts.tsx` (add a yes/no/choice helper if missing)
- Modify: `packages/cli/tests/` (new init-fork-prompt test)

- [ ] **Step 11.1: Add a `selectOne` prompt helper**

In `packages/cli/src/services/prompts.tsx`, extend the service with a `selectOne` method that asks for a single choice (or skips when non-TTY):

```typescript
export interface SelectOneParams {
  readonly choices: ReadonlyArray<SelectionChoice>
  readonly message: string
}

const selectOne = ({ choices, message }: SelectOneParams) =>
  Effect.gen(function* () {
    if (choices.length === 0) return undefined
    if (!input.isTTY || !output.isTTY) return undefined
    yield* Effect.tryPromise({
      try: () => renderInkOnce(<ChoicesView choices={choices} />),
      catch: (cause) => new InkRenderFailed({ view: "ChoicesView", cause })
    })
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
    const index = Number.parseInt(answer.trim(), 10) - 1
    return Number.isInteger(index) && index >= 0 && index < choices.length
      ? choices[index]
      : undefined
  })

export interface PromptsShape {
  readonly selectMany: (
    params: SelectManyParams
  ) => Effect.Effect<ReadonlyArray<SelectionChoice>, InkRenderFailed | PromptInputFailed>
  readonly selectOne: (
    params: SelectOneParams
  ) => Effect.Effect<SelectionChoice | undefined, InkRenderFailed | PromptInputFailed>
}

export const PromptsLive = Layer.sync(Prompts, () => ({ selectMany, selectOne }))
```

- [ ] **Step 11.2: Update `init.tsx` to prompt on detected fork with no `forkMode`**

Replace `initImpl` to add the prompt:

```typescript
export const initImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const existingMode = yield* readForkMode({ cwd })
  if (existingMode === undefined) {
    const detected = yield* detectFork({ cwd })
    if (detected.isFork) {
      const prompts = yield* Prompts
      const choice = yield* prompts.selectOne({
        message:
          detected.parentNameWithOwner === undefined
            ? "This repo looks like a fork. How will you use it? [1=contribute upstream, 2=personal use]:"
            : `This repo is a fork of ${detected.parentNameWithOwner}. How will you use it? [1=contribute upstream, 2=personal use]:`,
        choices: [
          {
            label: "contribute",
            description: "ingraft commits land in the host repo and may push upstream"
          },
          {
            label: "personal",
            description: "ingraft writes to .git/info/exclude only; nothing ever pushes"
          }
        ]
      })
      if (choice !== undefined) {
        yield* writeForkMode({ cwd, mode: choice.label as ForkMode })
        yield* ok(`Saved ingraft.forkMode = ${choice.label}.`)
      }
    }
  }

  const repos = yield* listVendored(cwd)
  const runtime = yield* RuntimeConfig
  const projectFiles = yield* ProjectFiles
  const command = yield* commandInvocation({ cwd, argv: runtime.argv })
  yield* projectFiles.refresh({
    cwd,
    repos,
    commitMessage: "vendor: initialize ingraft",
    editorSettings: true
  })
  yield* ok(`Initialized. Run \`${command} add <repo>\` to vendor a repository.`)
}).pipe(withCommandTelemetry("init"))
```

Imports to add at the top:

```typescript
import { detectFork, readForkMode, writeForkMode, type ForkMode } from "../domain/fork-mode.ts"
import { Prompts } from "../services/prompts.tsx"
```

- [ ] **Step 11.3: Test non-interactive init (no prompt fires)**

Create `packages/cli/tests/init.test.ts`:

```typescript
import { execSync } from "node:child_process"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { initImpl } from "../src/commands/init.tsx"
import { readForkMode } from "../src/domain/fork-mode.ts"
import { initBareUpstream, initLocalRepo } from "./helpers/local-vendor-fixture.ts"

describe("ingraft init", () => {
  test("does not prompt when stdin is not a TTY (test runner is non-interactive)", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    execSync(`git remote add upstream ${upstream}`, { cwd })

    await Effect.runPromise(
      initImpl.pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    const mode = await Effect.runPromise(
      readForkMode({ cwd }).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
    )

    expect(mode).toBeUndefined()
  })
})
```

Bun's test runner runs without a TTY, so the `selectOne` helper short-circuits to `undefined` — `forkMode` stays unset. To exercise the prompt path manually, set `INGRAFT_TEST_FORCE_PROMPT=1` and run interactively, but do not add this as an automated test.

- [ ] **Step 11.4: Run init tests**

Run: `bun test packages/cli/tests/init.test.ts`
Expected: passes.

- [ ] **Step 11.5: Commit**

```bash
git add packages/cli/src/commands/init.tsx packages/cli/src/services/prompts.tsx packages/cli/tests/init.test.ts
git commit -m "feat(init): prompt for fork mode when a fork is detected and forkMode is unset"
```

---

## Task 12: Fork-mode default flips implicit `--local-only` in `add`

**Files:**

- Modify: `packages/cli/src/commands/add.tsx`
- Modify: `packages/cli/tests/add-targets.test.ts`

- [ ] **Step 12.1: Write failing test**

Add to `packages/cli/tests/add-local-only.test.ts`:

```typescript
test("forkMode=personal makes --local-only the implicit default", async () => {
  const cwd = initLocalRepo()
  const upstream = initBareUpstream()
  setForkMode(cwd, "personal")

  await Effect.runPromise(
    addImpl(
      defaultAddParams({
        repo: upstream,
        ref: Option.some("main"),
        name: Option.some("upstream"),
        strategy: "clone-ignore",
        localOnly: false
      })
    ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
  )

  expect(existsSync(join(cwd, ".git", "ingraft", "state.json"))).toBe(true)
  expect(existsSync(join(cwd, ".gitignore"))).toBe(false)
})
```

- [ ] **Step 12.2: Run to confirm failure**

Run: `bun test packages/cli/tests/add-targets.test.ts`
Expected: failure — `localOnly` defaults to `false` regardless of `forkMode`.

- [ ] **Step 12.3: Apply fork-mode default in `addImpl`**

In `addImpl`, after destructuring params and before strategy resolution:

```typescript
const forkMode = yield * readForkMode({ cwd })
const effectiveLocalOnly = localOnly || forkMode === "personal"
```

Use `effectiveLocalOnly` in all subsequent branching. Adjust the strategy default in Step 5.4 to use `effectiveLocalOnly`:

```typescript
const baselineStrategy = effectiveLocalOnly
  ? (requestedStrategy ?? "clone-ignore")
  : (requestedStrategy ?? DEFAULT_VENDOR_STRATEGY)
```

When `effectiveLocalOnly !== localOnly` (i.e., fork mode flipped it), surface that in the user output:

```typescript
if (effectiveLocalOnly && !localOnly) {
  yield * info("ingraft.forkMode=personal → using --local-only by default.")
}
```

- [ ] **Step 12.4: Run add test**

Run: `bun test packages/cli/tests/add-targets.test.ts`
Expected: passes.

- [ ] **Step 12.5: Commit**

```bash
git add packages/cli/src/commands/add.tsx packages/cli/tests/add-targets.test.ts
git commit -m "feat(add): default to --local-only when ingraft.forkMode is personal"
```

---

## Task 13: `doctor` fork-mode hygiene check

**Files:**

- Modify: `packages/cli/src/commands/doctor.tsx`
- Modify: `packages/cli/tests/vendor-doctor.test.ts`

- [ ] **Step 13.1: Write failing test**

Tests use direct calls to the report-computing helper (export `computeForkModeReport` from `doctor.tsx` so tests bypass the Ink renderer). Add to `packages/cli/tests/vendor-doctor.test.ts`:

```typescript
import { Effect, Option } from "effect"
import { LiveLayer } from "../src/app/layers.ts"
import { RuntimeConfigLive } from "../src/app/runtime.ts"
import { computeForkModeReport } from "../src/commands/doctor.tsx"
import {
  initLocalRepo,
  initBareUpstream,
  setForkMode,
  defaultAddParams
} from "./helpers/local-vendor-fixture.ts"
import { addImpl } from "../src/commands/add.tsx"
import { execSync } from "node:child_process"

test("doctor warns when forkMode=personal and tracked vendor commits exist", async () => {
  const cwd = initLocalRepo()
  const upstream = initBareUpstream()
  execSync(`git remote add upstream ${upstream}`, { cwd })
  setForkMode(cwd, "personal")

  await Effect.runPromise(
    addImpl(
      defaultAddParams({
        repo: upstream,
        ref: Option.some("main"),
        name: Option.some("upstream"),
        strategy: "subtree",
        localOnly: false
      })
    ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
  )

  const report = await Effect.runPromise(
    computeForkModeReport({ cwd }).pipe(
      Effect.provide(LiveLayer),
      Effect.provide(RuntimeConfigLive)
    )
  )

  expect(report.status).toBe("warn")
  expect(report.message).toContain("tracked")
})

test("doctor reports ok when forkMode=contribute and entries match", async () => {
  const cwd = initLocalRepo()
  const upstream = initBareUpstream()
  execSync(`git remote add upstream ${upstream}`, { cwd })
  setForkMode(cwd, "contribute")

  await Effect.runPromise(
    addImpl(
      defaultAddParams({
        repo: upstream,
        ref: Option.some("main"),
        name: Option.some("upstream"),
        strategy: "subtree",
        localOnly: false
      })
    ).pipe(Effect.provide(LiveLayer), Effect.provide(RuntimeConfigLive))
  )

  const report = await Effect.runPromise(
    computeForkModeReport({ cwd }).pipe(
      Effect.provide(LiveLayer),
      Effect.provide(RuntimeConfigLive)
    )
  )

  expect(report.status).toBe("ok")
})

test("doctor skips fork-mode section on non-fork repos", async () => {
  const cwd = initLocalRepo()
  // no upstream remote; gh CLI in test environment typically reports non-fork

  const report = await Effect.runPromise(
    computeForkModeReport({ cwd }).pipe(
      Effect.provide(LiveLayer),
      Effect.provide(RuntimeConfigLive)
    )
  )

  expect(report.status).toBe("skipped")
})
```

The third test depends on the `gh` CLI being absent or returning `isFork: false`. If your CI has `gh` authed against a real account, stub `GitHubCli` for that test via `Effect.provideService` to force `exitCode: 1`.

- [ ] **Step 13.2: Run to confirm failure**

Run: `bun test packages/cli/tests/vendor-doctor.test.ts`
Expected: failure — no fork-mode field in the report.

- [ ] **Step 13.3: Add the fork-mode report to `DoctorReportData`**

In `packages/cli/src/commands/doctor.tsx`:

```typescript
export interface ForkModeReport {
  readonly status: "ok" | "warn" | "info" | "skipped"
  readonly mode: ForkMode | undefined
  readonly isFork: boolean
  readonly parentNameWithOwner: string | undefined
  readonly message: string
}

export interface DoctorReportData {
  readonly cwd: string
  readonly agentFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly editorFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repositoryFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly toolReports: ReadonlyArray<ToolIgnoreReport>
  readonly forkMode: ForkModeReport
}
```

Compute the report inside `doctorImpl`:

```typescript
const mode = yield * readForkMode({ cwd })
const detected = yield * detectFork({ cwd })
const trackedRepos = repos.filter((repo) => repo.localOnly !== true)

const forkMode: ForkModeReport = !detected.isFork
  ? {
      status: "skipped",
      mode,
      isFork: false,
      parentNameWithOwner: undefined,
      message: "Not a fork; fork-mode check skipped."
    }
  : mode === undefined
    ? {
        status: "info",
        mode,
        isFork: true,
        parentNameWithOwner: detected.parentNameWithOwner,
        message: "Fork detected but ingraft.forkMode is unset. Run `ingraft init` to set it."
      }
    : mode === "personal" && trackedRepos.length > 0
      ? {
          status: "warn",
          mode,
          isFork: true,
          parentNameWithOwner: detected.parentNameWithOwner,
          message: `forkMode=personal but ${trackedRepos.length} tracked vendor commit(s) exist; they will push upstream if you push this branch.`
        }
      : {
          status: "ok",
          mode,
          isFork: true,
          parentNameWithOwner: detected.parentNameWithOwner,
          message: `forkMode=${mode}; vendor commits match the declared mode.`
        }
```

Render in the Ink view with a new `<Section title="Fork mode">…</Section>` block, and include the field in the JSON output.

- [ ] **Step 13.4: Run doctor tests**

Run: `bun test packages/cli/tests/vendor-doctor.test.ts`
Expected: passes.

- [ ] **Step 13.5: Commit**

```bash
git add packages/cli/src/commands/doctor.tsx packages/cli/tests/vendor-doctor.test.ts
git commit -m "feat(doctor): warn when forkMode personal leaks tracked vendor commits"
```

---

## Task 14: (Stretch) GitHub Desktop preference hint

**Files:**

- Create: `packages/cli/src/services/github-desktop.ts`
- Create: `packages/cli/tests/github-desktop.test.ts`
- Modify: `packages/cli/src/commands/init.tsx` (use as seed for prompt default)

Mark this task **optional**. If you cannot reliably probe a representative GitHub Desktop `repositories.json`, skip the entire task and write a `// TODO(stretch)` note in `init.tsx`.

- [ ] **Step 14.1: Inspect a real GitHub Desktop state file**

Run:

```bash
ls -la "$HOME/Library/Application Support/GitHub Desktop/" 2>/dev/null || true
```

If `repositories.json` (or whatever name Desktop currently uses) exists, examine its schema. Versions of Desktop have used different formats; the goal is to find the path to "contribution target" / "is fork by user choice" per repository.

- [ ] **Step 14.2: Implement a fail-quiet reader**

Create `packages/cli/src/services/github-desktop.ts`:

```typescript
import { Effect, FileSystem, Path, Schema } from "effect"

import type { ForkMode } from "../domain/fork-mode.ts"

const DESKTOP_PATH_SEGMENTS = [
  "Library",
  "Application Support",
  "GitHub Desktop",
  "repositories.json"
] as const

const RepositoryEntrySchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  hash: Schema.optional(Schema.String),
  ghRepository: Schema.optional(
    Schema.Struct({
      forkContributionTarget: Schema.optional(Schema.Number)
    })
  )
})

const ContainerSchema = Schema.Struct({
  repositories: Schema.optional(Schema.Array(RepositoryEntrySchema))
})

const decodeContainer = Schema.decodeUnknownSync(ContainerSchema)

export interface ReadGithubDesktopHintParams {
  readonly cwd: string
  readonly home: string
}

export const readGithubDesktopHint = ({
  cwd,
  home
}: ReadGithubDesktopHintParams): Effect.Effect<
  ForkMode | undefined,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = path.resolve(home, ...DESKTOP_PATH_SEGMENTS)
    if (!(yield* fs.exists(file).pipe(Effect.catch(() => Effect.succeed(false))))) {
      return undefined
    }
    try {
      const raw = yield* fs.readFileString(file)
      const decoded = decodeContainer(JSON.parse(raw))
      const entry = (decoded.repositories ?? []).find((repo) => repo.path === cwd)
      const target = entry?.ghRepository?.forkContributionTarget
      // 0 = "for my own purposes", 1 = "to contribute to the parent" (verify against current Desktop schema)
      if (target === 0) return "personal"
      if (target === 1) return "contribute"
      return undefined
    } catch {
      return undefined
    }
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
```

Note: the numeric constants in the comment above need to be verified against the actual Desktop schema during Step 14.1. If the values are inverted or the path is different in current Desktop versions, update accordingly. If you cannot verify, leave the function returning `undefined` always and document the constraint in a comment.

- [ ] **Step 14.3: Use the hint to seed the prompt's pre-selected answer**

In `init.tsx`, before calling `prompts.selectOne`, read the Desktop hint:

```typescript
const desktopHint =
  yield *
  readGithubDesktopHint({
    cwd,
    home: process.env.HOME ?? ""
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
```

If `desktopHint !== undefined`, include it in the prompt message:

```typescript
message: `${baseMessage} (GitHub Desktop suggests: ${desktopHint})`
```

Empty answer → use `desktopHint`. Explicit numeric answer overrides.

- [ ] **Step 14.4: Write a test using a temp HOME with a synthetic `repositories.json`**

In `packages/cli/tests/github-desktop.test.ts`, fabricate a `repositories.json` under a temp home, point `readGithubDesktopHint` at it, and assert it returns the expected mode.

- [ ] **Step 14.5: Run tests**

Run: `bun test packages/cli/tests/github-desktop.test.ts`
Expected: passes.

- [ ] **Step 14.6: Commit (or skip)**

```bash
git add packages/cli/src/services/github-desktop.ts packages/cli/tests/github-desktop.test.ts packages/cli/src/commands/init.tsx
git commit -m "feat(init): seed fork-mode prompt with GitHub Desktop preference when available"
```

---

## Task 15: Documentation updates

**Files:**

- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `packages/cli/README.md`

- [ ] **Step 15.1: Update intent routing in `SKILL.md`**

In the Intent Routing table, add:

```markdown
| "vendor without committing", "fork-safe vendor" | `bunx ingraft@latest add <repo> --local-only` |
| "vendor only these dirs" | `bunx ingraft@latest add <repo> --include-dir <path>` |
| "configure fork mode" | `bunx ingraft@latest init` |
```

In Common Commands, add:

```sh
bunx ingraft@latest add Effect-TS/effect --local-only
bunx ingraft@latest add Effect-TS/effect --no-commit
bunx ingraft@latest add Effect-TS/effect --include-dir packages/effect/src
bunx ingraft@latest add Effect-TS/effect --include 'src/**/*.ts'
bunx ingraft@latest add Effect-TS/effect --local-only --include-dir packages/effect
```

In Behavior Notes, add:

```markdown
- `--local-only` (alias `--no-commit`) writes the vendor ignore to `.git/info/exclude` (untracked) and persists metadata in `.git/ingraft/state.json` (untracked). It is valid only with `clone-ignore` and `cache-link`. When `git config ingraft.forkMode personal` is set, `--local-only` becomes the implicit default.
- `--include` and `--include-dir` are positive filters. When set, only matching paths are vendored. Combine with `--exclude*` for fine-grained selection.
- `ingraft init` prompts for `ingraft.forkMode` (personal or contribute) when a fork is detected and the mode is unset. `ingraft doctor` warns when personal mode leaves tracked vendor commits on a branch.
```

- [ ] **Step 15.2: Update `README.md`**

Add to the workflow examples:

```sh
ingraft add Effect-TS/effect --local-only --include-dir packages/effect/src
git config ingraft.forkMode personal
ingraft init
ingraft doctor
```

Add a short "Local-only mode" section explaining the three behavior flips.

- [ ] **Step 15.3: Update `packages/cli/README.md`**

Mirror the SKILL.md additions for the CLI-specific README.

- [ ] **Step 15.4: Verify docs render**

If website preview is available:

```sh
bun run dev:website:local
```

Expected: the Starlight pages reflect the new commands without broken links.

- [ ] **Step 15.5: Commit**

```bash
git add SKILL.md README.md packages/cli/README.md
git commit -m "docs: cover --local-only, --include-dir, and fork-mode workflows"
```

---

## Self-review checklist (run before marking the plan complete)

- [ ] Every requirement from the brainstorming summary has at least one task:
  - `--local-only` flag → Tasks 5, 6
  - `.git/info/exclude` instead of `.gitignore` → Task 2
  - `.git/ingraft/state.json` → Tasks 3, 4
  - `--include` / `--include-dir` → Tasks 1, 5
  - `ingraft.forkMode` config → Task 9
  - Fork detection (gh + remotes) → Task 10
  - First-run prompt in init → Task 11
  - Fork-mode flips implicit `--local-only` → Task 12
  - Doctor warns on leak → Task 13
  - GH Desktop integration (stretch) → Task 14
  - Docs → Task 15
- [ ] No "TBD" / "fill in details" placeholders in task bodies (Tasks 5, 7, 8, 11, 12, 13 have explicit code samples; verify Task 14 stretch-skip language is clear).
- [ ] Type consistency: `LocalVendorEntry`, `VendoredRepo`, `VendorFilter`, `ForkMode`, `DetectForkResult` are referenced with identical field names across tasks.
- [ ] `--local-only` validation rejects `subtree` and `submodule` (Task 5).
- [ ] Updates and removes route `localOnly: true` entries through the no-commit path (Tasks 7, 8).
- [ ] Doctor still works for non-fork repos (Task 13 includes a `skipped` status case).

---

## Execution notes

- The user explicitly chose "one bundle" — land all 15 tasks under a single PR (or single squashed commit if the project prefers). Each task ends with a commit so the bundle has clean per-feature history before being squashed.
- Use a feature branch from `main`, e.g. `feat/local-only-vendoring`.
- Final integration check before PR: from a freshly cloned ingraft repo, run:
  ```sh
  bun install && bun run typecheck && bun run test && bun run build
  ```
  All four must pass. Then run `node packages/cli/dist/bin/ingraft.js add <some-repo> --local-only --include-dir src --strategy clone-ignore` against a scratch repo and inspect `.git/info/exclude` and `.git/ingraft/state.json` manually.
