import { Args, Command as Cli, Options } from "@effect/cli"
import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import { updateAgentDocs } from "../agent-docs.ts"
import { TRAILER_DIR, TRAILER_REF, TRAILER_URL, VENDOR_DIR } from "../constants.ts"
import {
  assertCleanTree,
  commitConfigChanges,
  detectDefaultBranch,
  git,
  repoRoot
} from "../git.ts"
import { info, ok, warn, withCommandTelemetry } from "../log.ts"
import { inferRepoName, normalizeRepoUrl } from "../repo.ts"
import { reportOptionalPath, reportWritten } from "../reports.ts"
import { commandInvocation } from "../script.ts"
import { findByName, listVendored } from "../vendor-state.ts"
import { updateVscodeSettings } from "../vscode-settings.ts"
import { die } from "../errors.ts"

const addRepoArg = Args.text({ name: "repo" }).pipe(
  Args.withDescription(
    "GitHub shorthand (owner/repo), HTTPS URL, or SSH URL of the upstream repository."
  )
)

const addRefOption = Options.text("ref").pipe(
  Options.withAlias("r"),
  Options.withDescription(
    "Branch, tag, or commit to vendor. Defaults to the upstream's default branch."
  ),
  Options.optional
)

const addPrefixOption = Options.text("prefix").pipe(
  Options.withAlias("p"),
  Options.withDescription(`Subtree prefix path. Defaults to '${VENDOR_DIR}/<name>'.`),
  Options.optional
)

const addNameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.withDescription(
    "Override the inferred name (used for the prefix path and lookups)."
  ),
  Options.optional
)

export const addImpl = ({
  name,
  prefix,
  ref,
  repo
}: {
  readonly repo: string
  readonly ref: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly name: Option.Option<string>
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const url = normalizeRepoUrl(repo)
    const finalName = Option.isSome(name) ? name.value : yield* inferRepoName(url)
    const finalPrefix = (
      Option.isSome(prefix) ? prefix.value : `${VENDOR_DIR}/${finalName}`
    ).replace(/\/+$/, "")

    let finalRef: string
    if (Option.isSome(ref)) {
      finalRef = ref.value
    } else {
      yield* info(`Detecting default branch for ${url}...`)
      const detected = yield* detectDefaultBranch(url)
      if (Option.isSome(detected)) {
        finalRef = detected.value
        yield* info(`Using ref '${finalRef}' (detected from remote HEAD).`)
      } else {
        finalRef = "main"
        yield* warn(
          `Could not detect default branch; falling back to '${finalRef}'.`
        )
      }
    }

    const existing = yield* findByName(cwd, finalName)
    if (Option.isSome(existing)) {
      return yield* die(
        {
          title: `Vendored repo '${finalName}' already exists`,
          detail: `It is already registered at '${existing.value.prefix}'.`,
          hint: `Use \`vendor update ${finalName}\` to pull upstream changes.`
        },
        4
      )
    }
    if (yield* fs.exists(path.resolve(cwd, finalPrefix))) {
      return yield* die(
        {
          title: `Path '${finalPrefix}' already exists`,
          detail: "The subtree target must be an empty path managed by this tool.",
          hint: "Choose a different --prefix or remove the existing path first."
        },
        4
      )
    }

    yield* info(`Adding subtree: ${url} @ ${finalRef} -> ${finalPrefix}/`)
    const message = `vendor: add ${finalName} (${url}@${finalRef})\n\n${TRAILER_DIR}: ${finalPrefix}\n${TRAILER_URL}: ${url}\n${TRAILER_REF}: ${finalRef}`
    const subtree = yield* git(
      [
        "subtree",
        "add",
        `--prefix=${finalPrefix}`,
        url,
        finalRef,
        "--squash",
        "-m",
        message
      ],
      { cwd }
    )
    if (subtree.exitCode !== 0) {
      return yield* die(
        {
          title: "git subtree add failed",
          detail: subtree.stderr.trim() || subtree.stdout.trim(),
          hint: "Check that the repo URL and ref are reachable, then retry."
        },
        3
      )
    }

    const repos = yield* listVendored(cwd)
    const command = commandInvocation(cwd)
    const written = yield* updateAgentDocs({ cwd, repos, command })
    yield* reportWritten(cwd, written)
    const settings = yield* updateVscodeSettings(cwd)
    yield* reportOptionalPath(cwd, settings)
    yield* commitConfigChanges(cwd, `vendor: register ${finalName}`)

    yield* ok(`Vendored '${finalName}' at ${finalPrefix}/.`)
  }).pipe(withCommandTelemetry("add"))

export const addCmd = Cli.make(
  "add",
  {
    repo: addRepoArg,
    ref: addRefOption,
    prefix: addPrefixOption,
    name: addNameOption
  },
  addImpl
).pipe(
  Cli.withDescription(
    "Add a new vendored repository as a squashed git subtree, with metadata trailers."
  )
)
