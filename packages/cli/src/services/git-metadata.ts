import * as git from "isomorphic-git"
import * as nodeFs from "node:fs"
import { Effect } from "effect"

export interface GitMetadataCommit {
  readonly message: string
  readonly oid: string
  readonly timestamp: number
}

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

export class GitMetadata extends Effect.Service<GitMetadata>()(
  "vendor-subtree/GitMetadata",
  {
    accessors: true,
    sync: () => ({
      listCommits
    })
  }
) {}
