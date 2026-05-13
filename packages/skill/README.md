# vendor-subtree-skill

Agent skill wrapper for the `vendor-subtree` CLI.

The skill intentionally contains no vendoring implementation. It delegates to the published CLI with `bunx vendor-subtree`, so agents get the current standalone tool without copying TypeScript source into every skill install.

Running `bunx vendor-subtree@latest` in a project scans package manifests, matches npm dependencies to source repositories, and prompts for which repos to vendor or update.
