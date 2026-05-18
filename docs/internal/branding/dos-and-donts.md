# Do's and Don'ts

Quick reference. When in doubt, default to the simpler / lowercase / less-shouty form.

## Name form

|                    | Do                        | Don't                                                                                       |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------- |
| **Code, CLI, npm** | `ingraft`                 | `Ingraft`, `INGRAFT`, `in-graft`                                                            |
| **Sentence start** | `Ingraft routes context.` | `ingraft routes context.` (sentence-initial lowercase is fine in code blocks, not in prose) |
| **All caps**       | (don't)                   | `INGRAFT` — never                                                                           |
| **Hyphenated**     | (don't)                   | `in-graft` — never                                                                          |
| **Possessive**     | `Ingraft's CLI`           | `Ingraft´s` (curly apostrophe), `INGRAFT'S`                                                 |

## What we call it

| Do                                           | Don't                                  |
| -------------------------------------------- | -------------------------------------- |
| "Ingraft" (the brand)                        | "the ingraft tool" — redundant         |
| "the `@ingraft/skill` agent skill"           | "the skill" alone in mixed contexts    |
| "context routing" (the product category)     | "ingrafting" as the product verb       |
| "vendoring" (the deep source route)          | "vendor" as the whole product category |
| "graft" (the noun for what Ingraft produces) | —                                      |

## Mechanism vs brand

The tool routes repository context. Its deepest route is **vendored source** using one of four **durable source strategies**: `subtree`, `submodule`, `clone-ignore`, or `cache-link`. The brand `Ingraft` is method-agnostic; never let mechanism names creep into product copy.

| Do                                          | Don't                                   |
| ------------------------------------------- | --------------------------------------- |
| "Ingraft routes repository context."        | "Ingraft is a git subtree tool."        |
| "Use `--strategy submodule` for source."    | "Use the submodule version of Ingraft." |
| "Ingraft supports multiple context routes." | "Ingraft = git subtree."                |
| "Vendored source is the durable route."     | "Vendoring is the whole product."       |

## Agent context

Half the audience is coding agents reading our docs. Write so an agent can extract intent without ambiguity.

| Do                                                                   | Don't                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `bunx ingraft@latest add zod Effect-TS/effect` (full, copy-pastable) | `ingraft add some-repo` (under-specified)                |
| One verb per sentence in the SKILL.md intent table                   | Compound instructions ("vendor and then refresh and...") |
| Quote exact flag names: `--strategy subtree`                         | Paraphrase ("the subtree option")                        |
