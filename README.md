# vendor-subtree-skill

A cross-agent skill that vendors external git repositories into your project for coding agents (Claude Code, Codex, Cursor, etc.) using one of three strategies: committed `git subtree` source, `git submodule` gitlinks, or local clones that are added to `.gitignore`.

Inspired by [Maxwell Brown's post on the Effect blog](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/).

[![skills.sh](https://skills.sh/b/gunta/vendor-subtree-skill)](https://skills.sh/gunta/vendor-subtree-skill)

## What you get

After one command:

- `vendor/<name>/` — the external repo's source or gitlink, depending on strategy.
- An auto-generated `<!-- vendor-subtree-skill:begin -->` section in `AGENTS.md` (and `CLAUDE.md` if present) telling every agent how to treat the vendored code.
- `.vscode/settings.json` exclusions so the editor doesn't suggest auto-imports from, search, or watch the vendored directory.
- For `clone-ignore`, a managed `.gitignore` section that keeps local clones out of git.
- Git trailer metadata for each add/update/remove, so `list`, `update`, and `refresh` have a source of truth.

**No manifest file.** Metadata lives in git commit trailers, so git itself is the source of truth. `clone-ignore` stores only metadata in git; the cloned repo stays local.

**Standalone CLI.** The tool is a Bun + TypeScript package built on [Effect](https://effect.website/) (`@effect/cli`, `@effect/platform`, `@effect/platform-bun`, and Effect Schema). It can run as a project-local script with `bun scripts/vendor.ts`, or as an installed CLI via the `vendor-subtree` bin.

## Install

### Via skills.sh (recommended)

```bash
npx skills add gunta/vendor-subtree-skill
```

This installs to the right path for each agent you have (`~/.claude/skills/`, `~/.codex/skills/`, `~/.cursor/skills/`, etc).

### Manually for a single agent

```bash
# Claude Code
git clone https://github.com/gunta/vendor-subtree-skill ~/.claude/skills/vendor-subtree-skill

# Codex
git clone https://github.com/gunta/vendor-subtree-skill ~/.codex/skills/vendor-subtree-skill

# Cursor (project-local only)
git clone https://github.com/gunta/vendor-subtree-skill .cursor/skills/vendor-subtree-skill
```

### As a standalone CLI

Clone and run it directly:

```bash
git clone https://github.com/gunta/vendor-subtree-skill
cd vendor-subtree-skill
bun install
cd /path/to/your/project
bun /path/to/vendor-subtree-skill/scripts/vendor.ts init
```

For global local development, link the bin:

```bash
bun link
vendor-subtree --help
```

## Requirements

- **Bun** ≥ 1.0 — `curl -fsSL https://bun.sh/install | bash` or `npm install -g bun`
- **git** with `git subtree` for the default `subtree` strategy (ships with git ≥ 1.7.11; present in every modern install)
- **GitHub CLI (`gh`) optional but preferred for GitHub repos.** When available, the CLI uses `gh repo view`, `gh release view`, and `gh repo clone` for GitHub-aware auth and protocol handling, then falls back to git.
- **GitLab CLI (`glab`) optional for GitLab repos.** When available, the CLI can use `glab repo view`, `glab release view`, and `glab repo clone`, then falls back to git.

## Caveats

- **Dependencies are pinned by `bun.lock`.** The package commits its runtime dependencies instead of relying on Bun auto-install.
- **`.vscode/settings.json` is parsed as JSONC.** Comments and existing formatting are preserved where possible via `jsonc-parser`.

## Usage

In an agent that has the skill installed, just talk:

> subtree Effect-TS/effect

> vendor the effect-smol repo too

> what's vendored?

> update all vendored repos

> remove effect

Or run the script directly. Auto-generated help is available for every command:

```bash
bun scripts/vendor.ts --help                            # full help (powered by @effect/cli)
bun scripts/vendor.ts add --help                        # per-subcommand help
bun scripts/vendor.ts --version                         # 0.3.0

bun scripts/vendor.ts init                              # one-time bootstrap
bun scripts/vendor.ts add Effect-TS/effect              # add a vendored repo
bun scripts/vendor.ts add Effect-TS/effect --ref main   # pin a ref
bun scripts/vendor.ts add Effect-TS/effect --tag v3.21.2
bun scripts/vendor.ts add Effect-TS/effect --release latest
bun scripts/vendor.ts add Effect-TS/effect --strategy submodule
bun scripts/vendor.ts add Effect-TS/effect --strategy clone-ignore
bun scripts/vendor.ts add git@github.com:org/lib.git    # SSH (private)
bun scripts/vendor.ts update Hello-World                # pull latest
bun scripts/vendor.ts update --all                      # pull all
bun scripts/vendor.ts list                              # show what's vendored
bun scripts/vendor.ts list --json                       # machine-readable
bun scripts/vendor.ts remove Hello-World                # remove
bun scripts/vendor.ts refresh                           # regenerate AGENTS.md + .vscode
bun scripts/vendor.ts --completions zsh                 # generate shell completions
```

## How it works

The tool records metadata as git trailers. `git subtree` already uses `git-subtree-dir:`; this skill also records `vendor-source-url:`, `vendor-source-ref:`, `vendor-strategy:`, and `vendor-action:` for every managed add/update/remove:

```
vendor: add effect (https://github.com/Effect-TS/effect.git@main)

git-subtree-dir: vendor/effect
vendor-source-url: https://github.com/Effect-TS/effect.git
vendor-source-ref: main
vendor-strategy: subtree
vendor-action: upsert
```

`list`, `update`, and `refresh` discover the current state from `git log` trailer placeholders and validate parsed records with Effect Schema. No `.vendor.json`, no hidden state.

## Strategy guide

`subtree` is the default. It commits a squashed copy of the upstream source into the parent repo. Use it when agent portability matters most and the repo size is acceptable.

`submodule` commits only a gitlink plus `.gitmodules`. Use it when the upstream repo is too large to subtree, but you still want git to track a pinned checkout.

`clone-ignore` clones into `vendor/<name>/`, adds that path to a managed `.gitignore` section, and commits only metadata. Use it when the repo should be local-only, private, huge, experimental, or not part of the parent repo history.

Subtree remains the best default for "agent always sees source after clone." Submodules and ignored clones trade portability for smaller parent repos.

For GitHub and GitLab repos, the tool tries host CLIs first where they help with authentication, release lookup, and account-level git protocol settings. Git remains the execution engine for subtree, submodule gitlinks, commits, status checks, and generic repositories.

Version selection:

- `--ref <ref>` uses a raw branch, tag, commit SHA, or git ref.
- `--tag <tag>` uses a specific git tag.
- `--release <name>` resolves a provider release to its backing tag. `--release latest` is supported for providers that expose latest release metadata through their CLI.

Use only one of `--ref`, `--tag`, or `--release`.

## Compatibility

| Agent | Project path | Verified |
|---|---|---|
| Claude Code | `.claude/skills/` | ✓ |
| Codex | `.agents/skills/` | ✓ |
| Cursor | `.cursor/skills/` | ✓ |
| Any AGENTS.md-aware agent | n/a — reads project `AGENTS.md` | ✓ |

After initialization, `AGENTS.md` references the command form that was used: project-local runs point at `bun scripts/vendor.ts`, while installed CLI runs point at `vendor-subtree`.

## Development (skill maintainers)

The CLI is split into focused TypeScript modules under `src/`, with `scripts/vendor.ts` kept as the Bun entrypoint.

```bash
bun install
bun test
bun run typecheck
bun scripts/vendor.ts --help
```

Key modules:

- `src/cli.ts` wires the top-level Effect CLI and pretty logging.
- `src/commands/` contains each subcommand implementation.
- `src/git.ts` exposes git through an injectable Effect service.
- `src/gh.ts` exposes GitHub CLI through an injectable Effect service and falls back cleanly when unavailable.
- `src/glab.ts` exposes GitLab CLI through an injectable Effect service.
- `src/repository-hosts.ts` owns provider detection and host-specific operations behind one service.
- `src/version.ts` resolves `--ref`, `--tag`, and `--release` selectors.
- `src/errors.ts` defines the typed domain error union used in the Effect error channel.
- `src/log.ts` keeps colors and command spans consistent.
- `src/project-files.ts` owns the shared AGENTS/CLAUDE/VS Code refresh flow.
- `src/vendor-state.ts` reads git trailers and validates repo records with Effect Schema diagnostics.
- `src/vscode-settings.ts` edits JSONC settings without stripping comments.

## License

MIT.
