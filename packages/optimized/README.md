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
