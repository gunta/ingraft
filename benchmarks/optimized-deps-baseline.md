# ingraft Benchmarks

Generated: 2026-05-19T22:28:59.654Z

Run with:

```sh
bun run bench:optimized-deps -- --runs 10 --warmup 2 --out benchmarks/optimized-deps-baseline.json
```

| Operation                  |    Mean |   Stddev | Baseline |       Change |
| -------------------------- | ------: | -------: | -------: | -----------: |
| `cli-deps-json`            | 1.306 s | 256.3 ms |  1.443 s | 1.11x faster |
| `optimized-deps-rust-json` | 1.599 s | 176.9 ms |        - |            - |
| `optimized-deps-zig-json`  | 4.146 s | 729.6 ms |        - |            - |
