---
name: vendor-subtree-skill
description: Use the package-managed vendor-subtree CLI to vendor upstream repositories for coding agents.
---

# vendor-subtree-skill

This skill is a thin agent wrapper around the `vendor-subtree` CLI. The vendoring implementation lives in the npm package, not in the skill checkout.

## Invocation

Prefer the package-managed CLI:

```sh
bunx vendor-subtree@latest --help
```

If the command is already installed in the project or globally, use:

```sh
vendor-subtree --help
```

Do not run a local `scripts/vendor.ts` from the skill. The skill intentionally delegates to the published CLI so agents get the current standalone implementation.

## Intent Routing

| User intent | Command |
| --- | --- |
| "auto vendor dependencies", "scan dependencies" | `bunx vendor-subtree@latest` or `bunx vendor-subtree@latest deps` |
| "set up vendoring" | `bunx vendor-subtree@latest init` |
| "vendor this repo" | `bunx vendor-subtree@latest add <repo>` |
| "show vendored repos" | `bunx vendor-subtree@latest list` |
| "refresh agent docs/tool ignores" | `bunx vendor-subtree@latest refresh` |
| "check vendor status" | `bunx vendor-subtree@latest doctor` |
| "remove vendored repo" | `bunx vendor-subtree@latest remove <name>` |

## Common Commands

```sh
bunx vendor-subtree@latest
bunx vendor-subtree@latest deps
bunx vendor-subtree@latest deps --json
bunx vendor-subtree@latest deps --yes
bunx vendor-subtree@latest init
bunx vendor-subtree@latest add Effect-TS/effect
bunx vendor-subtree@latest add Effect-TS/effect --ref main
bunx vendor-subtree@latest add Effect-TS/effect --tag v3.21.2
bunx vendor-subtree@latest add Effect-TS/effect --release latest
bunx vendor-subtree@latest add Effect-TS/effect --sync-package effect
bunx vendor-subtree@latest add Effect-TS/effect --exclude-ext png --max-file-size 1MB
bunx vendor-subtree@latest add Effect-TS/effect --exclude-dir docs --exclude '*.snap'
bunx vendor-subtree@latest add Effect-TS/effect --strategy subtree
bunx vendor-subtree@latest add Effect-TS/effect --strategy submodule
bunx vendor-subtree@latest add Effect-TS/effect --strategy clone-ignore
bunx vendor-subtree@latest update effect
bunx vendor-subtree@latest update --all
bunx vendor-subtree@latest list
bunx vendor-subtree@latest doctor
bunx vendor-subtree@latest remove effect
bunx vendor-subtree@latest refresh
```

## Behavior Notes

- The default strategy is `subtree`.
- Use `submodule` when the upstream repository should stay separate from the host commit history.
- Use `clone-ignore` for very large repositories, local-only references, or jj-collocated repositories.
- Use filters to omit directories, file extensions, globs, or files over a size limit.
- Use `--sync-package <name>` when the vendored source should follow the version used by the host package manifest.
- Running `vendor-subtree` with no subcommand scans project package manifests, matches npm packages to source repos, and asks which ones to vendor or update.
- `doctor` is the first diagnostic command to run when tooling/editor ignore behavior looks wrong.
