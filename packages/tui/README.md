# vendor-subtree-tui

Interactive OpenTUI dashboard for `vendor-subtree`.

OpenTUI is currently Bun-only, so this package intentionally stays separate from the Node-compatible `vendor-subtree` CLI package.

```sh
bunx vendor-subtree-tui
```

The dashboard reads `vendor-subtree deps --json`, lets you inspect matched package repositories, select add/update tasks, preview the exact CLI commands, and run them after an explicit confirmation.

Keys:

- `j` / `k` or arrow keys: move task focus
- `space`: toggle the focused task
- `a`: select all tasks
- `c`: clear selection
- `enter`: confirm the selected tasks, or the focused task if none are selected
- `y` / `n`: run or cancel after confirmation
- `r`: refresh the dependency scan
- `tab`, `h`, `l`: switch dashboard tabs
- `1`, `2`, `3`: choose add strategy (`subtree`, `submodule`, `clone-ignore`)
- `q`: quit
