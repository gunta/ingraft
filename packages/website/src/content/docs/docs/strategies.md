---
title: Strategies
description: Choose subtree, submodule, or clone-ignore for each vendored source.
---

Each vendored target has a strategy. The default is `subtree` because it gives the
project a portable, reviewable copy of upstream source.

## Subtree

Use `subtree` when the source is small enough to commit and you want every clone
of your project to include it.

```sh
vendor-subtree add effect --strategy subtree
```

## Submodule

Use `submodule` when the upstream repository is large or you want a pinned git
relationship without copying its contents into your own history.

```sh
vendor-subtree add rust-lang/rust --strategy submodule
```

## Clone-ignore

Use `clone-ignore` when source should exist locally for agents and LSPs but should
not be committed.

```sh
vendor-subtree add Effect-TS/effect --strategy clone-ignore
```

If the project has a colocated `jj` repository, the CLI falls back to clone-ignore
because jj does not yet support git subtree and submodule workflows directly.

## Filters

Large or irrelevant files can be filtered during vendoring when the strategy
supports it:

```sh
vendor-subtree add Effect-TS/effect \
  --ignore "**/*.png" \
  --ignore "docs/generated/**" \
  --max-file-size 1MB
```

This keeps non-source artifacts out of the vendor tree when they do not help the
coding workflow.
