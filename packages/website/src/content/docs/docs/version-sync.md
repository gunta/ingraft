---
title: Synced Versions
description: Resolve vendor versions from dependency manifests and lockfiles.
---

The default version mode tracks the upstream default branch. For dependencies
already installed in the current project, `synced` mode is usually better:

```sh
vendor-subtree add effect --version synced
```

Synced mode reads the project dependency graph, resolves the installed package
version, and tries to map that package version to source:

- npm-style manifests and lockfiles.
- Package manager lock data when present.
- Git tags such as `v3.21.2` or `3.21.2`.
- Provider release metadata when available.
- A precise commit when the dependency itself is git-based.

The selected version is stored with vendor metadata so future refreshes can tell
whether local source still matches the dependency version.

```sh
vendor-subtree refresh
vendor-subtree doctor
```
