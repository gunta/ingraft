import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"
import { gitChecked } from "./git.ts"
import {
  hasVendorFilter,
  includedTreePaths,
  parseGitTreeEntries,
  type VendorFilter
} from "./vendor-filter.ts"

export interface FilteredCheckoutParams {
  readonly cwd: string
  readonly filter: VendorFilter
  readonly ref: string
  readonly target: string
  readonly url: string
}

export interface MaterializeFilteredRepoParams extends FilteredCheckoutParams {
  readonly prefix: string
}

const sparseCheckoutText = (paths: ReadonlyArray<string>): string =>
  paths.length === 0
    ? "# vendor-subtree-skill: filter selected no files\n"
    : `${paths.map((path) => `/${path}`).join("\n")}\n`

const targetPath = (cwd: string, target: string, path: Path.Path): string =>
  path.isAbsolute(target) ? target : path.resolve(cwd, target)

export const checkoutFilteredRepo = ({
  cwd,
  filter,
  ref,
  target,
  url
}: FilteredCheckoutParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const absoluteTarget = targetPath(cwd, target, path)

    yield* fs.makeDirectory(path.dirname(absoluteTarget), { recursive: true }).pipe(
      Effect.ignore
    )
    yield* gitChecked(
      ["clone", "--filter=blob:none", "--no-checkout", url, absoluteTarget],
      { cwd }
    )
    yield* gitChecked(["-C", absoluteTarget, "fetch", "--tags", "origin", ref], {
      cwd
    })

    if (!hasVendorFilter(filter)) {
      yield* gitChecked(["-C", absoluteTarget, "checkout", "FETCH_HEAD"], { cwd })
      return
    }

    const tree = yield* gitChecked(
      ["-C", absoluteTarget, "ls-tree", "-r", "-l", "--full-tree", "FETCH_HEAD"],
      { cwd }
    )
    const paths = includedTreePaths({
      entries: parseGitTreeEntries(tree.stdout),
      filter
    })

    yield* gitChecked(
      ["-C", absoluteTarget, "sparse-checkout", "init", "--no-cone"],
      { cwd }
    )
    yield* fs.writeFileString(
      path.resolve(absoluteTarget, ".git", "info", "sparse-checkout"),
      sparseCheckoutText(paths)
    )
    yield* gitChecked(["-C", absoluteTarget, "checkout", "FETCH_HEAD"], { cwd })
  })

export const materializeFilteredRepo = ({
  cwd,
  filter,
  prefix,
  ref,
  url
}: MaterializeFilteredRepoParams) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tmp = yield* fs.makeTempDirectoryScoped({
        prefix: "vendor-subtree-filter-"
      })
      const checkout = path.resolve(tmp, "repo")
      const target = path.resolve(cwd, prefix)

      yield* checkoutFilteredRepo({ cwd, filter, ref, target: checkout, url })
      yield* fs.remove(path.resolve(checkout, ".git"), {
        force: true,
        recursive: true
      })
      yield* fs.remove(target, { force: true, recursive: true })
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(
        Effect.ignore
      )
      yield* fs.copy(checkout, target, { overwrite: true })
    })
  )
