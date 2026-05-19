# ingraft Benchmarks

Generated: 2026-05-19T23:26:02.304Z

Run with:

```sh
bun run bench:optimized-deps -- --runs 10 --warmup 3 --out benchmarks/optimized-deps-baseline.json
```

| Operation                  |     Mean |   Stddev | Baseline |       Change |
| -------------------------- | -------: | -------: | -------: | -----------: |
| `cli-deps-json`            |  1.383 s | 267.6 ms |  1.443 s | 1.04x faster |
| `optimized-deps-rust-json` | 514.1 ms |  44.3 ms |        - |            - |
| `optimized-deps-zig-json`  | 498.6 ms |  25.3 ms |        - |            - |
