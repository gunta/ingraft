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

The PoCs intentionally scan local manifests only. The current TypeScript
`deps --json` command also resolves package metadata, so the numbers tell us how
fast the local dependency discovery and JSON emission can be in native code, not
that the PoCs are full replacements yet.
