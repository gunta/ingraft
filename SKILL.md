---
name: vendor-subtree-skill
description: Vendor external git repositories into the project for coding agents using `git subtree`, `git submodule`, or local clone-and-ignore. Trigger on phrases like "vendor X", "subtree X", "submodule X", "clone and ignore X", "add X as reference", "let the agent see the source of X", or any request to manage existing vendored repos (update, remove, list). Works for any public or private repo (HTTPS or SSH). Prefer subtree by default; use submodule or clone-ignore when the upstream repo is too large or should not be committed.
---

# vendor-subtree-skill

Manage vendored external git repositories so coding agents can read them as reference material.

The skill ships a Bun TypeScript CLI package built on [Effect](https://effect.website/) (`@effect/cli`, `@effect/platform`, `@effect/platform-bun`, and Effect Schema). It supports three strategies and keeps the project's agent docs, editor settings, and clone-ignore `.gitignore` section in sync. There is no separate manifest file — metadata lives in git commit trailers, so git is the single source of truth.

## When to trigger

| User says | Command |
|---|---|
| "subtree X", "vendor X", "add X as reference" | `add` |
| "submodule X", "repo is too big to commit" | `add --strategy submodule` |
| "clone X locally", "clone and gitignore X" | `add --strategy clone-ignore` |
| "update vendored X", "pull latest from the X vendor" | `update` |
| "remove vendored X", "unvendor X" | `remove` |
| "what's vendored", "list vendored repos" | `list` |
| "set up vendoring", "initialize vendor-subtree-skill" | `init` |

`X` may be GitHub shorthand (`Effect-TS/effect`), HTTPS, or SSH. Private repos work — auth comes from the user's local git credential helper (SSH agent, gh CLI, stored token).

## Workflow

### 1 — Confirm context

The script needs a git repository. If the working directory is not a git repo, ask before running `git init`. The script's own errors are clear (`exit 5` for "not in a git repo"), but a friendly confirmation is nicer.

### 2 — Choose the command form

Prefer an installed or project-local CLI command when available:

```bash
vendor-subtree --help
```

If the CLI is not linked globally, run it from this skill checkout:

```bash
bun "$SKILL_DIR/scripts/vendor.ts" --help
```

Replace `$SKILL_DIR` with the absolute path to this skill's directory (the parent of this SKILL.md). The agent knows this path from context.

If the user wants the tool committed into the target project, copy `package.json`, `bun.lock`, `scripts/`, and `src/` from this skill directory, then run `bun install`.

### 3 — Initialize (first use per project)

If the project has no `<!-- vendor-subtree-skill:begin -->` section in `AGENTS.md`, run:

```bash
vendor-subtree init
# or: bun "$SKILL_DIR/scripts/vendor.ts" init
```

This creates `AGENTS.md` (and updates `CLAUDE.md` if it exists), adds `vendor/**` exclusions to `.vscode/settings.json`, and commits.

### 4 — Run the requested operation

```bash
vendor-subtree add Effect-TS/effect
vendor-subtree add Effect-TS/effect --ref main
vendor-subtree add Effect-TS/effect --strategy submodule
vendor-subtree add Effect-TS/effect --strategy clone-ignore
vendor-subtree add git@github.com:org/private-lib.git
vendor-subtree update effect
vendor-subtree update --all
vendor-subtree remove effect
vendor-subtree list
vendor-subtree --help
```

After a successful `add`, summarize for the user: which repo, which ref, the prefix path. A one-line nudge helps: "You can point me at `vendor/<name>/` when working with this library."

## Gotchas

- **Bun is required.** The script's shebang is `#!/usr/bin/env bun`. If the user doesn't have Bun, install it first with `curl -fsSL https://bun.sh/install | bash` or `npm install -g bun`. Most users targeting this skill already have Bun.

- **Dependencies are package-managed.** The repository commits `package.json` and `bun.lock`; run `bun install` in the skill checkout before invoking `bun "$SKILL_DIR/scripts/vendor.ts"` if dependencies are missing.

- **Dirty working tree blocks subtree ops.** Git subtree refuses to run with uncommitted tracked changes. The script exits with code 4 and a clear message. If the user has uncommitted work, surface it back to them — don't auto-stash unless they ask.

- **Auth for private repos is the user's git credential helper.** SSH URLs use the SSH agent; HTTPS uses a stored token. If `git subtree add` fails with an auth error, suggest `git ls-remote <url>` to test access independently of this script.

- **Default branch detection.** When `--ref` is not given, the script asks the remote via `git ls-remote --symref`. Most repos resolve to `main` or `master`. For non-standard defaults (`trunk`, `develop`), the detection still works. If detection fails, it falls back to `main` with a warning — pass `--ref` explicitly to avoid surprises.

- **`vendor/` is hardcoded.** This is intentional. If the project is a Go module that uses `vendor/` for `go mod vendor`, vendor-subtree-skill will conflict. Suggest the user pass `--prefix third_party/<name>` on each `add` to use a different parent directory.

- **Strategy choice matters.** `subtree` commits source and is the portable default. `submodule` commits only a gitlink plus `.gitmodules`. `clone-ignore` clones locally under `vendor/<name>/`, adds that exact path to a managed `.gitignore` section, and commits only metadata. Use `submodule` or `clone-ignore` when the repo is too large or should not be committed.

- **JSONC comments in `.vscode/settings.json` are preserved.** The CLI uses `jsonc-parser` edits instead of hand-stripping comments.

## Commands reference

Run `vendor-subtree --help` or `bun "$SKILL_DIR/scripts/vendor.ts" --help` for the live version (auto-generated by `@effect/cli`, with per-subcommand `--help`, `--version`, `--completions`, and `--wizard`).

| Command | Behavior |
|---|---|
| `init` | Create the managed section in `AGENTS.md`/`CLAUDE.md`, add `vendor/**` to `.vscode/settings.json` exclusions, commit. |
| `add <repo>` | Add a vendored repo with metadata trailers, update agent docs, commit. Flags: `--strategy subtree\|submodule\|clone-ignore`, `--ref/-r`, `--prefix/-p`, `--name/-n`. |
| `update <name>` / `update --all` | Pull subtree changes, update submodule gitlinks, or refresh local ignored clones, then refresh agent docs. |
| `remove <name>` | Remove/deinit the managed repo, record a removal trailer, refresh agent docs and `.gitignore`, commit. |
| `list` | Show vendored repos and their strategies, derived from git commit trailers. Use `--json` for machine output. |
| `refresh` | Re-generate `AGENTS.md` section, clone-ignore `.gitignore`, and `.vscode/settings.json` from git state. Useful if files were edited by hand. |

## Exit codes

`0` success · `1` generic · `2` argument error · `3` git operation failed · `4` conflict (dirty tree, name collision) · `5` not a git repo.

## How metadata is stored

There is no `.vendor.json`, `.vendor/`, or any other config file. The script encodes per-repo metadata as trailers in the git commit message it creates for each `add`/`update`/`remove`:

```
vendor: add effect (https://github.com/Effect-TS/effect.git@main)

git-subtree-dir: vendor/effect
vendor-source-url: https://github.com/Effect-TS/effect.git
vendor-source-ref: main
vendor-strategy: subtree
vendor-action: upsert
```

`list` and `update` discover this by walking `git log` trailer placeholders for commits whose body contains `vendor-source-url:`. Parsed records are validated with Effect Schema. The repo is the single source of truth; the agent doc section and `.gitignore` clone-ignore section are derived views.

## When this is not the right tool

- The user wants to *modify* upstream code and contribute back: use `git submodule` (or work in a separate clone). Subtree push exists but is awkward.
- The repo size impact is unacceptable and the source should remain local-only: use `--strategy clone-ignore`.
- The user is on Windows without WSL: Bun and `git subtree` both work on Windows, but the SSH credential story is messier; warn them.
