import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"

export interface JujutsuService {
  readonly isColocated: (cwd: string) => Effect.Effect<boolean, unknown>
}

const isColocatedWith = (fs: FileSystem.FileSystem, path: Path.Path, cwd: string) =>
  Effect.gen(function* () {
    const dotGit = path.resolve(cwd, ".git")
    const dotJj = path.resolve(cwd, ".jj")
    const hasGit = yield* fs.exists(dotGit)
    const hasJj = yield* fs.exists(dotJj)
    if (!hasGit || !hasJj) return false

    const gitTarget = path.resolve(cwd, ".jj/repo/store/git_target")
    const hasGitTarget = yield* fs.exists(gitTarget)
    if (!hasGitTarget) return true

    const target = yield* fs.readFileString(gitTarget).pipe(Effect.orElseSucceed(() => ""))
    return target.trim().includes(".git")
  })

export class Jujutsu extends Effect.Service<Jujutsu>()("vendor-subtree/Jujutsu", {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return {
      isColocated: (cwd: string) => isColocatedWith(fs, path, cwd)
    } satisfies JujutsuService
  })
}) {}
