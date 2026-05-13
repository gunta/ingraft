# Copy

Reusable copy in increasing order of length. Pull from this when writing READMEs, tweets, talk slides, or website hero sections.

## One-liners

Pick one per surface. Don't mix.

- **Vendor source for coding agents.**
- **Graft upstream into your repo.**
- **Local-first context for coding agents.**
- **Your dependencies, in your tree, ready for agents.**

For npm `description` and Homebrew formula `desc`, use:

> Vendor external source repositories into your project for coding agents.

## Elevator pitch (one paragraph)

> Coding agents are only as good as the context they can read. When your dependency lives in `node_modules` (or worse, behind an `npm install`), the agent can't grep it, navigate to definitions, or learn from examples. Ingraft vendors upstream source into your repo as a git subtree (or submodule, or ignored clone) — so the agent sees every file as if it were part of your codebase. One command per dependency, then commit.

## Talk introduction (Michael / Maxwell on stage)

Pick one of these openings, depending on how much article context the audience has:

**Audience already knows the article:**

> Ingraft. It's the tool from the article. One command, vendor any GitHub repo into your tree, and your coding agent suddenly has the whole upstream to read from.

**Audience is new to the idea:**

> We wrote an article a while back called _"the one weird git trick that makes coding agents more Effect-ive."_ The trick is `git subtree`: you vendor your dependencies as source, and your coding agent can read them. Ingraft is that workflow as a one-line command.

## Tagline candidates for the website hero

Ranked. Try them in order; A/B test if you can.

1. **Vendor source for agents.**
   _Subhead:_ The CLI that grafts upstream repos into your project so coding agents have full local context.

2. **Your dependencies, in your tree.**
   _Subhead:_ Vendor any GitHub repo as a git subtree. Coding agents read everything, locally.

3. **Coding agents need context. Ingraft gives them yours.**
   _Subhead:_ One command, every dependency vendored as source — searchable, navigable, agent-readable.

## Social one-liners

For posts / quote tweets / replies:

- "Built a tool around the trick from [@effectful_engineer]'s article — `bunx ingraft init` and your agent sees everything."
- "Ingraft: vendor source for agents. Coding agents read your `vendor/` like it's first-party code."
- "The Effect article on `git subtree` for agents is now a CLI. `bunx ingraft add zod` does the thing."

## Don't write

- Anything with "AI-powered" — Ingraft has no AI; it's plumbing for AI.
- Anything that sounds like a B2B sales page.
- Anything claiming Ingraft "revolutionizes" or "transforms" anything.
- Anything with the word "synergy."
