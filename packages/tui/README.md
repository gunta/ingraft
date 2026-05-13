# vendor-subtree-tui

OpenTUI dashboard for `vendor-subtree`.

OpenTUI is currently Bun-only, so this package intentionally stays separate from the Node-compatible `vendor-subtree` CLI package.

```sh
bunx vendor-subtree-tui
```

The dashboard reads `vendor-subtree deps --json` and shows dependency repositories that can be added or updated.
