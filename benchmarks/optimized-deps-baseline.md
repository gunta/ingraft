# ingraft Benchmarks

Generated: 2026-05-19T21:31:17.337Z

Run with:

```sh
bun run bench
```

| Operation                  |    Mean |   Stddev | Baseline |       Change |
| -------------------------- | ------: | -------: | -------: | -----------: |
| `cli-deps-json`            | 1.487 s | 214.9 ms |  1.443 s | 1.03x slower |
| `optimized-deps-rust-json` |  9.3 ms |   5.1 ms |        - |            - |
| `optimized-deps-zig-json`  |  6.9 ms |   4.6 ms |        - |            - |
