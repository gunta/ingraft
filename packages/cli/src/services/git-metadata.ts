import * as nodeFs from "node:fs"

import { Effect } from "effect"
import * as git from "isomorphic-git"

export interface GitMetadataCommit {
  readonly message: string
  readonly oid: string
  readonly timestamp: number
}

const findRoot = (cwd: string): Effect.Effect<string, unknown> =>
  Effect.tryPromise({
    try: () => git.findRoot({ fs: nodeFs, filepath: cwd }),
    catch: (error) => error
  })

const listCommits = (cwd: string): Effect.Effect<ReadonlyArray<GitMetadataCommit>, unknown> =>
  Effect.tryPromise({
    try: async () => {
      const commits = await git.log({ fs: nodeFs, dir: cwd })
      return commits.map((entry) => ({
        message: entry.commit.message,
        oid: entry.oid,
        timestamp: entry.commit.committer.timestamp
      }))
    },
    catch: (error) => error
  })

const listProjectFiles = (cwd: string): Effect.Effect<ReadonlyArray<string>, unknown> =>
  Effect.tryPromise({
    try: async () => {
      const matrix = await git.statusMatrix({
        fs: nodeFs,
        dir: cwd,
        ignored: false
      })
      return matrix.map(([filepath]) => String(filepath))
    },
    catch: (error) => error
  })

const pathKnownToGit = (cwd: string, filepath: string): Effect.Effect<boolean, unknown> =>
  Effect.tryPromise({
    try: async () => {
      const status = await git.status({ fs: nodeFs, dir: cwd, filepath })
      return status !== "absent"
    },
    catch: (error) => error
  })

const isIgnored = (cwd: string, filepath: string): Effect.Effect<boolean, unknown> =>
  Effect.tryPromise({
    try: () => git.isIgnored({ fs: nodeFs, dir: cwd, filepath }),
    catch: (error) => error
  })

export class GitMetadata extends Effect.Service<GitMetadata>()("vendor-subtree/GitMetadata", {
  accessors: true,
  sync: () => ({
    findRoot,
    isIgnored,
    listCommits,
    listProjectFiles,
    pathKnownToGit
  })
}) {}
