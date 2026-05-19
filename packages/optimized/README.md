# ingraft optimized PoCs

This package holds native experiments for hot paths that are useful to compare
against the TypeScript CLI before deciding what should be ported or rewritten.

Current PoC:

- Rust: `rust/target/release/ingraft-deps-rust --root <repo>`
- Zig: `zig/zig-out/bin/ingraft-deps-zig --root <repo>`

Run the comparison:

```sh
bun run bench:optimized-deps
```

Quick local loop:

```sh
bun run bench:optimized-deps -- --quick
```

The PoCs now execute the practical npm/package.json path for `deps --json`:
manifest discovery, `bun.lock` and `node_modules` version detection, npm
metadata lookups, vendored repository matching, and dependency task emission.
They are benchmarked against the TypeScript command with the same metadata work
enabled so a native result cannot win by skipping the expensive parts.

The Zig scanner keeps discovery deterministic, then runs npm metadata probes
with bounded Zig 0.16 `std.Io.Select` concurrency. The default is
`--npm-concurrency 12`, which kept the local npm run fast without the long
backpressure outlier seen at `16`; tune it per network with the same flag. It
also includes a small SIMD fast path for URL component encoding, while leaving
heavier native-parser or inline-assembly experiments for benchmarks that show
CPU parsing is the bottleneck.
