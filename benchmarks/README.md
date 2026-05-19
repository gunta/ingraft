# ingraft Benchmarks

The benchmark suite uses `hyperfine` through the root dev dependency and covers
the non-destructive CLI/TUI operations that tend to regress startup or scanning
latency.

```sh
bun run bench:quick
bun run bench
bun run bench:update-baseline
```

- `bench:quick` runs every operation with fewer samples for local iteration.
- `bench` writes `benchmarks/results/latest.json` and `.md`; those files are
  intentionally ignored.
- `bench:update-baseline` rewrites the committed baseline files so a future diff
  can show performance movement on the same machine.
- `bench:optimized-deps` builds the Rust and Zig PoCs, then compares them with
  the TypeScript `deps --json` path. Use `--out benchmarks/optimized-deps-baseline.json`
  when intentionally refreshing the committed native comparison.

The default suite intentionally skips mutating operations such as `add`,
`update`, `remove`, `init`, and `refresh`. Benchmark those in isolated fixtures
instead of against a real checkout.
