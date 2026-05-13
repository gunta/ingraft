import { Effect, Option } from "effect"
import {
  VersionResolutionFailed,
  VersionSelectorConflict
} from "./errors.ts"
import { git } from "../services/git.ts"
import { RepositoryHosts } from "../services/repository-hosts.ts"

export interface VersionOptionParams {
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
  readonly syncPackage: Option.Option<string>
}

export interface ResolveVersionParams {
  readonly selector: VersionSelector
  readonly url: string
}

export type VersionSelector =
  | { readonly _tag: "Default" }
  | { readonly _tag: "Ref"; readonly value: string }
  | { readonly _tag: "Tag"; readonly value: string }
  | { readonly _tag: "Release"; readonly value: string }
  | { readonly _tag: "SyncPackage"; readonly value: string }

interface NamedVersionSelector {
  readonly name: string
  readonly selector: VersionSelector
}

const optionalSelector = (
  name: string,
  option: Option.Option<string>,
  create: (value: string) => VersionSelector
): ReadonlyArray<NamedVersionSelector> =>
  Option.match(option, {
    onNone: () => [],
    onSome: (value) =>
      value.trim().length === 0
        ? []
        : [{ name, selector: create(value.trim()) }]
  })

export const versionSelectorFromOptions = ({
  ref,
  release,
  syncPackage,
  tag
}: VersionOptionParams): Effect.Effect<
  VersionSelector,
  VersionSelectorConflict
> => {
  const selected = [
    ...optionalSelector("--ref", ref, (value) => ({ _tag: "Ref", value })),
    ...optionalSelector("--tag", tag, (value) => ({ _tag: "Tag", value })),
    ...optionalSelector("--release", release, (value) => ({
      _tag: "Release",
      value
    })),
    ...optionalSelector("--sync-package", syncPackage, (value) => ({
      _tag: "SyncPackage",
      value
    }))
  ]

  if (selected.length > 1) {
    return Effect.fail(
      new VersionSelectorConflict({
        selectors: selected.map((selector) => selector.name)
      })
    )
  }

  return Effect.succeed(selected[0]?.selector ?? { _tag: "Default" })
}

const tagExists = (url: string, tag: string) =>
  git(["ls-remote", "--tags", url, `refs/tags/${tag}`]).pipe(
    Effect.map((result) => result.exitCode === 0 && result.stdout.trim() !== "")
  )

export const resolveVersion = ({ selector, url }: ResolveVersionParams) => {
  switch (selector._tag) {
    case "Default":
      return Effect.succeed(Option.none<string>())
    case "Ref":
      return Effect.succeed(Option.some(selector.value))
    case "Tag":
      return Effect.succeed(Option.some(selector.value))
    case "Release":
      return RepositoryHosts.releaseTag({
        input: url,
        release: selector.value
      }).pipe(
        Effect.flatMap((tag) =>
          Option.isSome(tag)
            ? Effect.succeed(Option.some(tag.value))
            : selector.value === "latest"
              ? Effect.fail(
                  new VersionResolutionFailed({
                    selector: "--release latest",
                    url
                  })
                )
              : tagExists(url, selector.value).pipe(
                  Effect.flatMap((exists) =>
                    exists
                      ? Effect.succeed(Option.some(selector.value))
                      : Effect.fail(
                          new VersionResolutionFailed({
                            selector: `--release ${selector.value}`,
                            url
                          })
                        )
                  )
                )
        )
      )
    case "SyncPackage":
      return Effect.fail(
        new VersionResolutionFailed({
          selector: `--sync-package ${selector.value}`,
          url
        })
      )
  }
}
