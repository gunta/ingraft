---
title: Doctor
description: Inspect detected stack, configured surfaces, and context-route health.
---

![Engraving of a wooden monaural stethoscope pressed to a tree trunk, three diagnostic arcs radiating from the contact point.](/visuals/section-doctor.png)

Doctor output gives a single view of what the CLI sees:

```sh
ingraft doctor
ingraft doctor --json
ingraft doctor --fix
```

It reports:

- Git state and host provider.
- Detected package managers, lockfiles, and monorepo tools.
- Languages and source roots.
- Editors and agent files.
- Linter, formatter, and test surfaces.
- Durable source routes, strategies, versions, and sync status.

Use doctor before adding context routes to understand what the CLI will update.
Use it after refreshes to find drift. Use `doctor --fix` when generated agent
docs, editor excludes, `.gitattributes`, or detected tool ignore settings have
drifted and should be repaired before the report is printed.
