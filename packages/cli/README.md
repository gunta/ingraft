# vendor-subtree

Standalone CLI for vendoring external git repositories into a project so coding agents and language tooling can read upstream source without treating it as application code.

The CLI is built with Effect, `@effect/cli`, `@effect/platform`, and the Node platform layer. Bun is used for workspace development and tests, but the published package is a normal Node-compatible command.

## Install

```sh
npm install -g vendor-subtree
vendor-subtree --help
```

Or run without installing:

```sh
npx vendor-subtree --help
bunx vendor-subtree --help
```

## Commands

```sh
vendor-subtree
vendor-subtree deps
vendor-subtree deps --json
vendor-subtree deps --yes
vendor-subtree init
vendor-subtree zod Effect-TS/effect
vendor-subtree add effect
vendor-subtree add effect-smol
vendor-subtree add convex
vendor-subtree add Effect-TS/effect
vendor-subtree add zod @types/node Effect-TS/effect
vendor-subtree add Effect-TS/effect --ref main
vendor-subtree add Effect-TS/effect --tag v3.21.2
vendor-subtree add Effect-TS/effect --release latest
vendor-subtree add Effect-TS/effect --sync-package effect
vendor-subtree add Effect-TS/effect --exclude-ext png --max-file-size 1MB
vendor-subtree add Effect-TS/effect --exclude-dir docs --exclude '*.snap'
vendor-subtree add Effect-TS/effect --strategy subtree
vendor-subtree add Effect-TS/effect --strategy submodule
vendor-subtree add Effect-TS/effect --strategy clone-ignore
vendor-subtree add Effect-TS/effect --cloudflare-artifact
vendor-subtree update effect
vendor-subtree update --all
vendor-subtree list
vendor-subtree list --json
vendor-subtree doctor
vendor-subtree doctor --json
vendor-subtree remove effect
vendor-subtree remove effect --dangerously-rewrite-history
vendor-subtree refresh
```

Running `vendor-subtree` with no subcommand scans project `package.json` manifests, resolves npm repository metadata, groups packages that share the same source repo, and asks which source repos to add or update. Passing positional targets is shorthand for adding them, so `vendor-subtree zod Effect-TS/effect` vendors an npm package and a GitHub repository in one run. Repository aliases expand before npm package resolution, so `vendor-subtree add effect` expands to `Effect-TS/effect`, and `vendor-subtree add convex` expands to the Convex client and helper repositories. `deps --yes` processes every matched task without prompting; `deps --json` prints the detected candidates and planned tasks for tools such as the TUI package.

## Repository Aliases

Common repositories can be addressed with short aliases from
`src/aliases/repository-aliases.json`.

```sh
vendor-subtree add effect
# expands to Effect-TS/effect

vendor-subtree add effect-smol
# expands to Effect-TS/effect-smol

vendor-subtree add convex
# expands to get-convex/convex-js and get-convex/convex-helpers
```

Unknown names still fall through to the existing npm package metadata flow, so
ordinary package names continue to work.

## Strategies

- `subtree` - default committed source snapshot via `git subtree`.
- `submodule` - gitlink for repositories that should not be committed into the host repository.
- `clone-ignore` - local clone under `vendor/` plus generated `.gitignore` entries.

When a collocated `jj` repository is detected, `add` falls back to `clone-ignore` because jj still does not model git subtree and submodule workflows as first-class operations.

## Dangerous History Rewrites

Normal `remove` only removes the vendor from the current branch history going forward. If a committed vendor subtree made the repository too large, you can explicitly remove that vendor path from every local git ref:

```sh
vendor-subtree remove effect --dangerously-rewrite-history
```

This requires `git-filter-repo` and runs `git filter-repo --force --path <vendor-prefix>/ --invert-paths` after the normal remove. It rewrites commit SHAs, can break open pull request diffs, invalidates signatures, and requires coordinated force-pushes plus collaborator re-clones or careful rebases. Use it from a disposable fresh clone when possible.

## Version Selection

By default, the CLI resolves the host's default branch. You can pin a branch/ref, tag, latest release, exact release, or package-synced version:

```sh
vendor-subtree add org/repo --ref main
vendor-subtree add org/repo --tag v1.2.3
vendor-subtree add org/repo --release latest
vendor-subtree add org/repo --release v1.2.3
vendor-subtree add org/repo --sync-package package-name
```

Package sync reads project package manifests, detects the exact package version in the same order as source-reference tools such as opensrc (`node_modules/<package>/package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, then the manifest range), and maps that installed version to npm `gitHead` metadata or common upstream tag formats.

Npm package targets are also accepted directly:

```sh
vendor-subtree zod
vendor-subtree add zod @types/node Effect-TS/effect
```

## TUI

The optional `vendor-subtree-tui` package uses OpenTUI to show dependency matches and vendoring tasks:

```sh
bunx vendor-subtree-tui
```

OpenTUI is currently Bun-only, so the TUI is intentionally separate from the Node-compatible CLI package.

## Tooling Integration

`refresh` keeps agent docs and detected local tooling configuration in sync. It only writes ignore settings for tools that are present, including common TypeScript, JavaScript, Python, Rust, Zig, CSS, Markdown, editor, code-agent, and monorepo surfaces. `doctor` reports detected languages, editors, agent files, lint/format tools, monorepo tools, vendored repos, ignore status, and version-sync status.

Monorepo support covers package-manager workspaces plus Turborepo, Nx/Lerna, pnpm workspaces, moon, Bazel, Rush, Lage, Pants, Buck2, Gradle, Maven reactor projects, and Please. Safe automatic edits are currently applied to `turbo.json`/`turbo.jsonc`, `nx.json`, `pnpm-workspace.yaml`, `.moon/workspace.yml`, `.moon/workspace.yaml`, and `.bazelignore`; the other tools are detected and reported without source-config rewrites.

## Development

From the workspace root:

```sh
bun install
bun run test
bun run typecheck
bun run build
```

Development entrypoint:

```sh
bun packages/cli/scripts/vendor.ts --help
```

Built Node entrypoint:

```sh
node packages/cli/dist/bin/vendor-subtree.js --help
```
