---
title: Doctor
description: Inspect detected stack, configured surfaces, and vendor health.
---

Doctor output gives a single view of what the CLI sees:

```sh
vendor-subtree doctor
vendor-subtree doctor --json
```

It reports:

- Git state and host provider.
- Detected package managers, lockfiles, and monorepo tools.
- Languages and source roots.
- Editors and agent files.
- Linter, formatter, and test surfaces.
- Vendored targets, strategies, versions, and sync status.

Use doctor before adding vendors to understand what the CLI will update. Use it
after refreshes to find drift.
