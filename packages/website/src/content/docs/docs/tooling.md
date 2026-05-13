---
title: Tooling Integration
description: Keep editors, linters, formatters, diffs, and agent files focused.
---

Vendored source is useful context, but it should not dominate everyday tooling.
`vendor-subtree` detects project surfaces before writing anything.

## Editors

Supported editor surfaces include:

- VS Code.
- Zed.
- Vim and Neovim.
- JetBrains IDEs.

Editor integration can hide noisy vendor folders from file explorers while still
allowing language tooling and agents to read the source when that helps.

## Linters and formatters

The doctor detects common TypeScript, JavaScript, Python, Rust, Zig, CSS, and
monorepo tools. Ignore files are only created or edited when the corresponding
tool is present.

Examples include Biome, oxlint, ESLint, Prettier, Ruff, Black, mypy, pytest,
Cargo, rustfmt, clippy, Zig, Turbo, Nx, Moon, and Lage.

## GitHub diffs

`.gitattributes` can mark vendored paths as generated or linguist-vendored so
hosting providers do not make source snapshots the center of every pull request.
