# Claude Agent Instructions

## Changelog Discipline

Treat `CHANGELOG.md` as an append-only release record. Do not rewrite, reorder,
rename, or reword entries from already-published version sections unless the
user explicitly asks for a historical correction.

For normal development work, add user-facing changes only to the next
unreleased section, currently `## Unreleased`. Keep entries concise and
release-note worthy; avoid raw commit subjects, implementation chores, or
internal-only noise unless they matter to users or release operators.

When preparing a release, create exactly one new version section from the
unreleased entries, using the existing changelog format:

```md
## X.Y.Z - YYYY-MM-DD
```

Move only the entries that belong to that version into the new section, leave
the next `## Unreleased` section in place above it for future changes, and do
not modify older version sections as part of the release.
