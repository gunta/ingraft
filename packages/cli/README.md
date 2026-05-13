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
vendor-subtree add Effect-TS/effect
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
vendor-subtree refresh
```

Running `vendor-subtree` with no subcommand scans project `package.json` manifests, resolves npm repository metadata, groups packages that share the same source repo, and asks which source repos to add or update. `deps --yes` processes every matched task without prompting; `deps --json` prints the detected candidates and planned tasks for tools such as the TUI package.

## Strategies

- `subtree` - default committed source snapshot via `git subtree`.
- `submodule` - gitlink for repositories that should not be committed into the host repository.
- `clone-ignore` - local clone under `vendor/` plus generated `.gitignore` entries.

When a collocated `jj` repository is detected, `add` falls back to `clone-ignore` because jj still does not model git subtree and submodule workflows as first-class operations.

## Version Selection

By default, the CLI resolves the host's default branch. You can pin a branch/ref, tag, latest release, exact release, or package-synced version:

```sh
vendor-subtree add org/repo --ref main
vendor-subtree add org/repo --tag v1.2.3
vendor-subtree add org/repo --release latest
vendor-subtree add org/repo --release v1.2.3
vendor-subtree add org/repo --sync-package package-name
```

Package sync reads project package manifests, prefers the root manifest when the same package appears in more than one place, and maps installed versions to npm `gitHead` metadata or common upstream tag formats.

## TUI

The optional `vendor-subtree-tui` package uses OpenTUI to show dependency matches and vendoring tasks:

```sh
bunx vendor-subtree-tui
```

OpenTUI is currently Bun-only, so the TUI is intentionally separate from the Node-compatible CLI package.

## Tooling Integration

`refresh` keeps agent docs and detected local tooling configuration in sync. It only writes ignore settings for tools that are present, including common TypeScript, JavaScript, Python, Rust, Zig, CSS, Markdown, editor, and code-agent surfaces. `doctor` reports detected languages, editors, agent files, lint/format tools, vendored repos, ignore status, and version-sync status.

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
