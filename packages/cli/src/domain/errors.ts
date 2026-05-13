import { Data } from "effect"
import { style, type StyleOptions } from "../app/styles.ts"
import type { VendorStrategy } from "./vendor-strategy.ts"

export interface ErrorPresentation {
  readonly title: string
  readonly detail?: string
  readonly hint?: string
  readonly code: number
}

export interface GitCommandFailedParams {
  readonly args: ReadonlyArray<string>
  readonly cwd?: string
  readonly exitCode: number
  readonly output: string
}

export interface DirtyWorkingTreeParams {
  readonly cwd: string
}

export interface RepoNameInferenceFailedParams {
  readonly url: string
}

export interface VendoredRepoAlreadyExistsParams {
  readonly name: string
  readonly prefix: string
}

export interface VendorPathAlreadyExistsParams {
  readonly prefix: string
}

export interface SubtreeAddFailedParams {
  readonly url: string
  readonly ref: string
  readonly prefix: string
  readonly output: string
}

export interface VendoredRepoNotFoundParams {
  readonly name: string
}

export interface GitRemoveFailedParams {
  readonly prefix: string
  readonly output: string
}

export interface UpdateFailedParams {
  readonly names: ReadonlyArray<string>
}

export interface VendorStrategyCommandFailedParams {
  readonly action: "add" | "update" | "remove"
  readonly strategy: VendorStrategy
  readonly prefix: string
  readonly output: string
}

export interface VersionSelectorConflictParams {
  readonly selectors: ReadonlyArray<string>
}

export interface VersionResolutionFailedParams {
  readonly selector: string
  readonly url: string
}

export interface PackageVersionSyncFailedParams {
  readonly packageName: string
  readonly reason: string
  readonly url: string
}

export interface InvalidVendorFilterParams {
  readonly value: string
  readonly reason: string
}

export interface UnsupportedVendorFilterParams {
  readonly strategy: VendorStrategy
  readonly reason: string
}

export interface CloudflareArtifactsConfigMissingParams {
  readonly reason: string
}

export interface CloudflareArtifactsRequestFailedParams {
  readonly action: string
  readonly status?: number
  readonly output: string
}

export class GitCommandFailed extends Data.TaggedError(
  "GitCommandFailed"
)<GitCommandFailedParams> {}

export class NotGitRepository extends Data.TaggedError("NotGitRepository")<{}> {}

export class DirtyWorkingTree extends Data.TaggedError(
  "DirtyWorkingTree"
)<DirtyWorkingTreeParams> {}

export class RepoNameInferenceFailed extends Data.TaggedError(
  "RepoNameInferenceFailed"
)<RepoNameInferenceFailedParams> {}

export class VendoredRepoAlreadyExists extends Data.TaggedError(
  "VendoredRepoAlreadyExists"
)<VendoredRepoAlreadyExistsParams> {}

export class VendorPathAlreadyExists extends Data.TaggedError(
  "VendorPathAlreadyExists"
)<VendorPathAlreadyExistsParams> {}

export class SubtreeAddFailed extends Data.TaggedError(
  "SubtreeAddFailed"
)<SubtreeAddFailedParams> {}

export class VendoredRepoNotFound extends Data.TaggedError(
  "VendoredRepoNotFound"
)<VendoredRepoNotFoundParams> {}

export class GitRemoveFailed extends Data.TaggedError(
  "GitRemoveFailed"
)<GitRemoveFailedParams> {}

export class UpdateTargetMissing extends Data.TaggedError(
  "UpdateTargetMissing"
)<{}> {}

export class UpdateFailed extends Data.TaggedError(
  "UpdateFailed"
)<UpdateFailedParams> {}

export class VendorStrategyCommandFailed extends Data.TaggedError(
  "VendorStrategyCommandFailed"
)<VendorStrategyCommandFailedParams> {}

export class VersionSelectorConflict extends Data.TaggedError(
  "VersionSelectorConflict"
)<VersionSelectorConflictParams> {}

export class VersionResolutionFailed extends Data.TaggedError(
  "VersionResolutionFailed"
)<VersionResolutionFailedParams> {}

export class PackageVersionSyncFailed extends Data.TaggedError(
  "PackageVersionSyncFailed"
)<PackageVersionSyncFailedParams> {}

export class InvalidVendorFilter extends Data.TaggedError(
  "InvalidVendorFilter"
)<InvalidVendorFilterParams> {}

export class UnsupportedVendorFilter extends Data.TaggedError(
  "UnsupportedVendorFilter"
)<UnsupportedVendorFilterParams> {}

export class CloudflareArtifactsConfigMissing extends Data.TaggedError(
  "CloudflareArtifactsConfigMissing"
)<CloudflareArtifactsConfigMissingParams> {}

export class CloudflareArtifactsRequestFailed extends Data.TaggedError(
  "CloudflareArtifactsRequestFailed"
)<CloudflareArtifactsRequestFailedParams> {}

export type VendorError =
  | GitCommandFailed
  | NotGitRepository
  | DirtyWorkingTree
  | RepoNameInferenceFailed
  | VendoredRepoAlreadyExists
  | VendorPathAlreadyExists
  | SubtreeAddFailed
  | VendoredRepoNotFound
  | GitRemoveFailed
  | UpdateTargetMissing
  | UpdateFailed
  | VendorStrategyCommandFailed
  | VersionSelectorConflict
  | VersionResolutionFailed
  | PackageVersionSyncFailed
  | InvalidVendorFilter
  | UnsupportedVendorFilter
  | CloudflareArtifactsConfigMissing
  | CloudflareArtifactsRequestFailed

const gitCommand = (args: ReadonlyArray<string>) => `git ${args.join(" ")}`

export const errorPresentation = (error: VendorError): ErrorPresentation => {
  switch (error._tag) {
    case "GitCommandFailed":
      return {
        title: "Git command failed",
        detail: `${gitCommand(error.args)} exited with ${error.exitCode}\n${error.output}`,
        hint: error.cwd
          ? `Run this from ${error.cwd} after checking the working tree.`
          : "Run the git command manually for the full git output.",
        code: 3
      }
    case "NotGitRepository":
      return {
        title: "Not inside a git repository",
        detail:
          "The vendor-subtree command must run from a project that already has a git repository.",
        hint: "Run this from your project root, or run `git init` first.",
        code: 5
      }
    case "DirtyWorkingTree":
      return {
        title: "Working tree has uncommitted changes",
        detail:
          "git subtree refuses to run on dirty trees, and this command only ignores untracked files.",
        hint: "Commit or stash tracked changes before running subtree operations.",
        code: 4
      }
    case "RepoNameInferenceFailed":
      return {
        title: "Could not infer a repository name",
        detail: `No path segment could be used as a repo name in '${error.url}'.`,
        hint: "Pass --name to choose the vendored repository name explicitly.",
        code: 2
      }
    case "VendoredRepoAlreadyExists":
      return {
        title: `Vendored repo '${error.name}' already exists`,
        detail: `It is already registered at '${error.prefix}'.`,
        hint: `Use \`vendor update ${error.name}\` to pull upstream changes.`,
        code: 4
      }
    case "VendorPathAlreadyExists":
      return {
        title: `Path '${error.prefix}' already exists`,
        detail: "The subtree target must be an empty path managed by this tool.",
        hint: "Choose a different --prefix or remove the existing path first.",
        code: 4
      }
    case "SubtreeAddFailed":
      return {
        title: "git subtree add failed",
        detail: error.output,
        hint: "Check that the repo URL and ref are reachable, then retry.",
        code: 3
      }
    case "VendoredRepoNotFound":
      return {
        title: `No vendored repo named '${error.name}'`,
        hint: "Run `vendor list` to see the currently registered names and prefixes.",
        code: 4
      }
    case "GitRemoveFailed":
      return {
        title: "git rm failed",
        detail: error.output,
        hint: "Check the working tree and remove the path manually if needed.",
        code: 3
      }
    case "UpdateTargetMissing":
      return {
        title: "No update target specified",
        detail: "The update command needs one vendored repo name or --all.",
        hint: "Usage: vendor update <name> or vendor update --all",
        code: 2
      }
    case "UpdateFailed":
      return {
        title: "One or more updates failed",
        detail: `Failed repositories: ${error.names.join(", ")}`,
        hint: "Review the git error above, resolve conflicts if any, and retry the failed names.",
        code: 3
      }
    case "VendorStrategyCommandFailed":
      return {
        title: `${error.strategy} ${error.action} failed`,
        detail: error.output,
        hint: `Check ${error.prefix} and the git output above, then retry.`,
        code: 3
      }
    case "VersionSelectorConflict":
      return {
        title: "Conflicting version selectors",
        detail: `Received: ${error.selectors.join(", ")}`,
        hint: "Use only one of --ref, --tag, --release, or --sync-package.",
        code: 2
      }
    case "VersionResolutionFailed":
      return {
        title: "Could not resolve requested version",
        detail: `${error.selector} was not found for ${error.url}.`,
        hint:
          "Use --tag for an exact git tag, --release for a host release, --sync-package for a root package.json dependency, or --ref for a branch/commit/ref.",
        code: 2
      }
    case "PackageVersionSyncFailed":
      return {
        title: `Could not sync package '${error.packageName}'`,
        detail: `${error.reason}\nRepository: ${error.url}`,
        hint:
          "Check root package.json, npm registry metadata, and that the vendored repo has a matching published commit or tag.",
        code: 2
      }
    case "InvalidVendorFilter":
      return {
        title: "Invalid vendor filter",
        detail: `${error.value}: ${error.reason}`,
        hint: "Use patterns like --exclude '*.png', directories like --exclude-dir docs, extensions like --exclude-ext png, or sizes like --max-file-size 1MB.",
        code: 2
      }
    case "UnsupportedVendorFilter":
      return {
        title: "Vendor filter is not supported for this strategy",
        detail: `${error.strategy}: ${error.reason}`,
        hint: "Use --strategy subtree for filtered committed source, or --strategy clone-ignore for a filtered local reference clone.",
        code: 2
      }
    case "CloudflareArtifactsConfigMissing":
      return {
        title: "Cloudflare Artifacts is not configured",
        detail: error.reason,
        hint:
          "Set CLOUDFLARE_API_TOKEN plus ARTIFACTS_BASE_URL, or set ACCOUNT_ID/CLOUDFLARE_ACCOUNT_ID and ARTIFACTS_NAMESPACE.",
        code: 2
      }
    case "CloudflareArtifactsRequestFailed":
      return {
        title: `Cloudflare Artifacts ${error.action} failed`,
        detail:
          error.status === undefined
            ? error.output
            : `HTTP ${error.status}\n${error.output}`,
        hint:
          "Check the Artifacts namespace, API token permissions, repo name, and source repository URL.",
        code: 3
      }
  }
}

export const exitCodeOf = (error: VendorError): number =>
  errorPresentation(error).code

export const formatVendorError = (
  error: VendorError,
  options: StyleOptions = {}
): string => {
  const presentation = errorPresentation(error)
  const lines = [
    `${style.red("Error:", options)} ${style.bold(presentation.title, options)}`
  ]
  if (presentation.detail) lines.push(presentation.detail)
  if (presentation.hint) {
    lines.push(`${style.yellow("Hint:", options)} ${presentation.hint}`)
  }
  return lines.join("\n")
}
