---
name: vendor-subtree-skill
description: Use the package-managed vendor-subtree CLI to vendor upstream repositories for coding agents.
---

# vendor-subtree-skill

Compatibility shim for skill installers that read `SKILL.md` from the repository root. The canonical skill package lives in `packages/skill`, and the vendoring implementation lives in the `vendor-subtree` CLI package.

Use the package-managed CLI:

```sh
bunx vendor-subtree@latest --help
```

Common commands:

```sh
bunx vendor-subtree@latest
bunx vendor-subtree@latest deps
bunx vendor-subtree@latest init
bunx vendor-subtree@latest add <repo>
bunx vendor-subtree@latest list
bunx vendor-subtree@latest doctor
bunx vendor-subtree@latest refresh
bunx vendor-subtree@latest update --all
bunx vendor-subtree@latest remove <name>
```

Do not run a local `scripts/vendor.ts` from the skill. The skill delegates to the standalone CLI so agents use the package-managed implementation.
