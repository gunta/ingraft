# ingraft Benchmarks

Generated: 2026-05-19T22:06:11.710Z

Run with:

```sh
bun run bench:optimized-deps -- --runs 10 --warmup 2 --out benchmarks/optimized-deps-baseline.json
```

| Operation                  |     Mean |   Stddev | Baseline |       Change |
| -------------------------- | -------: | -------: | -------: | -----------: |
| `cli-deps-json`            |  1.540 s | 282.0 ms |  1.443 s | 1.07x slower |
| `optimized-deps-rust-json` |  1.664 s | 195.0 ms |        - |            - |
| `optimized-deps-zig-json`  | 15.240 s |  2.795 s |        - |            - |
