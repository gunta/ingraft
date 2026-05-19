# ingraft Benchmarks

Generated: 2026-05-19T21:13:12.015Z

Run with:

```sh
bun run bench
```

| Operation | Mean | Stddev | Baseline | Change |
|---|---:|---:|---:|---:|
| `cli-help` | 405.6 ms | 18.8 ms | - | - |
| `cli-list-json` | 563.6 ms | 54.7 ms | - | - |
| `cli-list-json-cold-index` | 732.0 ms | 113.7 ms | - | - |
| `cli-list-versions-json` | 1.783 s | 1.088 s | - | - |
| `cli-deps-json` | 1.443 s | 211.2 ms | - | - |
| `cli-doctor-json` | 1.205 s | 120.2 ms | - | - |
| `cli-context-json` | 478.5 ms | 25.2 ms | - | - |
| `tui-full-snapshot` | 1.711 s | 147.3 ms | - | - |
