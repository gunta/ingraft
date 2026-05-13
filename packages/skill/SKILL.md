---
name: vendor-subtree
description: Vendors upstream repositories into a project's vendor/ directory via git subtree, submodule, or ignored clone. Use when the user wants to vendor a dependency, copy upstream source for offline agent reference, scan package manifests for vendoring candidates, run any vendor-subtree command, or set up, refresh, update, or remove vendored repos in a monorepo. Also use when the user mentions git subtree, vendored dependencies, or bundling upstream source into a project.
---

# vendor-subtree

Thin agent wrapper around the `vendor-subtree` CLI. The vendoring implementation lives in the npm package; the skill never executes a local TypeScript entrypoint.

## Invocation

Prefer the package-managed CLI:

```sh
bunx vendor-subtree@latest --help
```

If the command is already installed in the project or globally, use:

```sh
vendor-subtree --help
```

Do not run `scripts/vendor.ts` from the repository. The skill intentionally delegates to the published CLI so agents get the current standalone implementation.

## Intent Routing

| User intent                                     | Command                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| "auto vendor dependencies", "scan dependencies" | `bunx vendor-subtree@latest` or `bunx vendor-subtree@latest deps` |
| "set up vendoring"                              | `bunx vendor-subtree@latest init`                                 |
| "vendor this repo"                              | `bunx vendor-subtree@latest add <repo>`                           |
| "vendor these packages/repos"                   | `bunx vendor-subtree@latest <package-or-repo> <package-or-repo>`  |
| "show vendored repos"                           | `bunx vendor-subtree@latest list`                                 |
| "refresh agent docs/tool ignores"               | `bunx vendor-subtree@latest refresh`                              |
| "check vendor status"                           | `bunx vendor-subtree@latest doctor`                               |
| "remove vendored repo"                          | `bunx vendor-subtree@latest remove <name>`                        |
| "purge vendored repo from git history"          | See "Destructive history rewrite" below                           |

## Common Commands

```sh
bunx vendor-subtree@latest
bunx vendor-subtree@latest deps
bunx vendor-subtree@latest deps --json
bunx vendor-subtree@latest deps --yes
bunx vendor-subtree@latest init
bunx vendor-subtree@latest zod Effect-TS/effect
bunx vendor-subtree@latest add Effect-TS/effect
bunx vendor-subtree@latest add zod @types/node Effect-TS/effect
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
- Npm package targets use exact installed/locked versions when available: `node_modules`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, then `bun.lock`.
- Running `vendor-subtree` with no subcommand scans project package manifests, matches npm packages to source repos, and asks which ones to vendor or update.
- `doctor` is the first diagnostic command to run when tooling/editor ignore behavior looks wrong.
- Monorepo tooling is supported through `doctor`/`refresh`: Turborepo, Nx/Lerna, pnpm workspaces, moon, Bazel, Rush, Lage, Pants, Buck2, Gradle, Maven reactor projects, Please, and package-manager workspaces.

## Destructive history rewrite

`remove --dangerously-rewrite-history` deletes a vendor path from every commit in every local ref. Use only when the user explicitly asks to purge a vendor from git history (for example, to remove a leaked secret or a large vendored binary). A plain `remove` is almost always sufficient.

Work through this checklist before invoking it:

```
- [ ] User explicitly asked to rewrite history (not just remove the vendor)
- [ ] `git filter-repo --version` succeeds (dependency is installed)
- [ ] `git status` is clean
- [ ] User understands every commit SHA after the vendor's introduction will change
- [ ] User has a plan for coordinating force-pushes or re-clones with collaborators
- [ ] Open PRs and tags pointing at old SHAs are accounted for
```

Run only after every box is checked:

```sh
bunx vendor-subtree@latest remove <name> --dangerously-rewrite-history
```

If any box is unchecked, stop and clarify with the user before proceeding.
