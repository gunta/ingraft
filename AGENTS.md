<!-- vendor-subtree-skill:begin -->
## Vendored Repositories

This project vendors external repositories under `vendor/` via `git subtree`.
Treat these as **read-only reference material**, not as part of the application codebase.

**Rules:**
- Do NOT edit files under `vendor/` unless explicitly asked.
- Do NOT import from `vendor/` — application code imports from normal package dependencies.
- Prefer examples and patterns from `vendor/` over web search or generated guesses.
- Use `bun scripts/vendor.ts list` to see what is vendored.
- To add or update vendored repos, run `bun scripts/vendor.ts add <repo>` or `update <name>`.

_No repositories vendored yet. Run `bun scripts/vendor.ts add <repo>`._

<!-- vendor-subtree-skill:end -->
