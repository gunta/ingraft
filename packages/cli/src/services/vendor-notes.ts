import * as git from "isomorphic-git"
import * as nodeFs from "node:fs"
import { Effect } from "effect"
import type { VendoredRepo } from "../domain/vendor-state.ts"

export const VENDOR_NOTES_REF = "refs/notes/vendor-subtree"

export interface WriteVendorNoteParams {
  readonly cwd: string
  readonly note: string
  readonly oid: string
}

export interface SyncVendorNotesParams {
  readonly cwd: string
  readonly repos: ReadonlyArray<VendoredRepo>
}

export const vendorNotePayload = (repo: VendoredRepo): string =>
  JSON.stringify(
    {
      schema: "vendor-subtree/v1",
      source: "git-notes",
      vendor: {
        date: repo.date,
        filter: repo.filter,
        name: repo.name,
        prefix: repo.prefix,
        ref: repo.ref,
        sha: repo.sha,
        strategy: repo.strategy,
        syncPackage: repo.syncPackage ?? null,
        url: repo.url
      }
    },
    null,
    2
  )

const readNote = ({ cwd, oid }: Omit<WriteVendorNoteParams, "note">) =>
  Effect.tryPromise({
    try: async () => {
      const note = await git.readNote({
        fs: nodeFs,
        dir: cwd,
        ref: VENDOR_NOTES_REF,
        oid
      })
      return new TextDecoder().decode(note)
    },
    catch: (error) => error
  })

const write = ({ cwd, note, oid }: WriteVendorNoteParams) =>
  readNote({ cwd, oid }).pipe(
    Effect.catchAll(() => Effect.succeed("")),
    Effect.flatMap((current) =>
      current === note
        ? Effect.void
        : Effect.tryPromise({
            try: () =>
              git.addNote({
                fs: nodeFs,
                dir: cwd,
                ref: VENDOR_NOTES_REF,
                oid,
                note,
                force: true,
                author: {
                  name: "vendor-subtree-skill",
                  email: "vendor-subtree-skill@example.invalid"
                }
              }),
            catch: (error) => error
          }).pipe(Effect.asVoid)
    )
  )

const sync = ({ cwd, repos }: SyncVendorNotesParams) =>
  Effect.forEach(
    repos,
    (repo) =>
      write({ cwd, oid: repo.sha, note: vendorNotePayload(repo) }).pipe(
        Effect.catchAll((error) =>
          Effect.logDebug(`Could not write vendor git note: ${String(error)}`)
        )
      ),
    { discard: true }
  )

export class VendorNotes extends Effect.Service<VendorNotes>()(
  "vendor-subtree/VendorNotes",
  {
    accessors: true,
    sync: () => ({
      sync,
      write
    })
  }
) {}
