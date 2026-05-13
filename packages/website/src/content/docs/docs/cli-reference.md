---
title: CLI Reference
description: Common commands for scanning, adding, updating, listing, and removing vendors.
---

## Scan dependencies

```sh
vendor-subtree
vendor-subtree deps
vendor-subtree deps --json
vendor-subtree deps --yes
```

## Add targets

```sh
vendor-subtree add effect
vendor-subtree add effect-smol
vendor-subtree add convex
vendor-subtree add Effect-TS/effect
vendor-subtree add https://github.com/Effect-TS/effect.git
vendor-subtree effect zod Effect-TS/effect
```

Alias targets expand before package-name resolution. For example, `effect`
becomes `Effect-TS/effect`, and `convex` becomes both
`get-convex/convex-js` and `get-convex/convex-helpers`.

Useful options:

```sh
--strategy subtree|submodule|clone-ignore
--ref <branch-or-commit>
--tag <tag>
--release <name-or-latest>
--sync-package <package>
--ignore <glob>
--exclude-dir <directory>
--exclude-ext <extension>
--max-file-size <size>
```

## Maintain vendors

```sh
vendor-subtree list
vendor-subtree update effect
vendor-subtree refresh
vendor-subtree doctor
```

## Remove vendors

```sh
vendor-subtree remove effect
```

For history rewriting removal, see [Dangerous Removal](/docs/dangerous-removal/).
