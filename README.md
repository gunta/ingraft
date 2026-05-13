# vendor-subtree workspace

Monorepo for the `vendor-subtree` CLI and the agent skill that delegates to it.

## Packages

- `packages/cli` - standalone Node-compatible CLI published as `vendor-subtree`.
- `packages/skill` - skill wrapper that runs the published CLI with `bunx`.
- `packages/tui` - Bun-only OpenTUI dashboard published as `vendor-subtree-tui`.
- `packages/website` - Astro/Starlight marketing site and documentation.

The implementation lives in the CLI package. The skill does not copy source files or run a local TypeScript entrypoint; it only documents how an agent should invoke the package-managed command.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```

Run the development entrypoint from the workspace:

```sh
bun run vendor -- --help
```

Run the built CLI with Node:

```sh
node packages/cli/dist/bin/vendor-subtree.js --help
```

Run dependency discovery from a project:

```sh
vendor-subtree
vendor-subtree zod Effect-TS/effect
vendor-subtree deps --json
vendor-subtree deps --yes
```

Run the OpenTUI dashboard with Bun:

```sh
bun run tui
```

Run the website locally:

```sh
bun run website
```

## Runtime Model

The CLI is written with Effect and `@effect/platform` abstractions. The production layer uses `@effect/platform-node`, so the built package is usable from Node.js while Bun remains the workspace test/dev runner. The OpenTUI package is separate because OpenTUI is currently Bun-only.

See [packages/cli/README.md](packages/cli/README.md) for CLI usage and [packages/skill/SKILL.md](packages/skill/SKILL.md) for the skill wrapper.
