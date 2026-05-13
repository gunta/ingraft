<!-- vendor-subtree:begin -->

## Vendored Repositories

This project vendors external repositories under `vendor/` via `git subtree`.
Treat these as **read-only reference material**, not as part of the application codebase.

**Rules:**

- Do NOT edit files under `vendor/` unless explicitly asked.
- Do NOT import from `vendor/` — application code imports from normal package dependencies.
- Prefer examples and patterns from `vendor/` over web search or generated guesses.
- `vendor/` stays visible to agents and language tooling; generated ignores target formatters, linters, and analyzers only.
- Committed subtree sources are marked in `.gitattributes` as vendored/generated so GitHub PR diffs stay focused on project code.
- Strategies: `subtree` is committed source, `submodule` is a gitlink, and `clone-ignore` is a local ignored clone.
- Some repos may be filtered to omit media, generated directories, archives, fixtures, or oversized files.
- Use `bunx vendor-subtree@latest list` to see what is vendored.
- To add or update vendored repos, run `bunx vendor-subtree@latest add <repo>` or `update <name>`.

**Vendored repositories:**

- **`vendor/effect`** — subtree — `https://github.com/Effect-TS/effect.git` @ `main`

<!-- vendor-subtree:end -->
