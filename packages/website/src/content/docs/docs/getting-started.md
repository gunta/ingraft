---
title: Getting Started
description: Install the CLI, scan a project, and add your first vendored source.
---

Run the CLI from the root of the project that should receive source:

```sh
bunx vendor-subtree
```

You can also pass targets directly:

```sh
vendor-subtree effect zod Effect-TS/effect
```

With no targets, the CLI scans dependency manifests and asks which packages should
be vendored. With targets, each argument can be an alias, a package name, an
owner/repo shortcut, or a git URL.

Popular aliases are built in:

```sh
vendor-subtree add effect
vendor-subtree add effect-smol
vendor-subtree add convex
```

`effect` expands to `Effect-TS/effect`. `effect-smol` expands to
`Effect-TS/effect-smol`. `convex` expands to both `get-convex/convex-js` and
`get-convex/convex-helpers`.

## First commands

```sh
vendor-subtree deps
vendor-subtree deps --json
vendor-subtree add effect --strategy subtree --sync-package effect
vendor-subtree list
vendor-subtree doctor
```

If you expect to edit the vendored source, choose the strategy up front. A
fork-backed submodule is the recommended workflow for durable vendor patches:

```sh
vendor-subtree add your-org/effect --strategy submodule --ref vendor-patches
```

Use `subtree` for normal read-only reference source and `clone-ignore` for local
experiments that should not be committed.

## Where source goes

By default, vendored repositories live under `vendor/`. The tool also updates the
project surfaces that matter for the detected stack: editor settings, lint ignores,
agent notes, `.gitignore`, and `.gitattributes`.

The CLI only writes tool-specific files when the tool is already present in the
project.
