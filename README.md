# ingraft workspace

Monorepo for the `ingraft` CLI and the agent skill that delegates to it.

## Packages

- `packages/cli` - standalone CLI and OpenTUI dashboard published as `ingraft`.
- `packages/skill` - skill wrapper that runs the published CLI with `bunx`.
- `packages/tui` - internal development/test wrapper for the CLI dashboard.
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
node packages/cli/dist/bin/ingraft.js --help
```

Run dependency discovery from a project:

```sh
ingraft
ingraft tui
ingraft zod Effect-TS/effect
ingraft deps --json
ingraft deps --yes
ingraft context
ingraft context pack vendor/effect --compress
ingraft context source zod
```

`ingraft` with no arguments opens the interactive dashboard. Use `ingraft deps` for the non-interactive dependency scanner.

Run the dashboard from this workspace:

```sh
bun run tui
```

Run the website locally:

```sh
bun run website
```

## Runtime Model

The CLI is written with Effect and `@effect/platform` abstractions. The production layer uses `@effect/platform-node`, so non-interactive commands remain usable from Node.js while Bun remains the workspace test/dev runner. The default dashboard uses OpenTUI, so zero-arg `ingraft` launches it with Bun when the command is started from Node.

See [packages/cli/README.md](packages/cli/README.md) for CLI usage and [packages/skill/SKILL.md](packages/skill/SKILL.md) for the skill wrapper.
