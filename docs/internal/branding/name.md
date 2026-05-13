# The Name

## Ingraft

**Pronunciation:** in-GRAFT — /ɪnˈɡræft/

Two syllables. Stress on the second. Rhymes with _engraft_ and _draft_.

## Meaning

`ingraft` is a real English verb, a less common variant of _engraft_:

> **ingraft** _(verb)_ — to insert (a scion) into a stock for propagation; to graft something firmly into a place.

It is the precise word for the operation a vendoring tool performs: you take a piece from one organism (an upstream repository) and insert it into another (your project's git tree) so the two grow as one.

## Why this name

The tool was born from an Effect article about using `git subtree` to vendor dependencies so coding agents have proper context. We needed a name that captured the operation without locking into one mechanism.

Three criteria drove the choice:

1. **Method-agnostic.** Ingraft works for `git subtree`, `git submodule`, or plain ignored clones — all are forms of grafting upstream into your tree. The name shouldn't pin us to one strategy.
2. **Memorable.** Real word, vivid metaphor, one mental image (something being grafted in). Sticky.
3. **Defensible.** Virgin namespace across npm, Homebrew, PyPI, Cargo, RubyGems, GitHub. No competing software brands.

We considered `vendoring` (descriptive but generic), `vendora` (collided with a YC-backed grocery POS company and a vendor-management SaaS), and several Italian/Latin alternatives (`innesto`, `fondaco`). Ingraft won on the combination of memorability, defensibility, and exact semantic match.

## Capitalization

| Context                      | Form                                                                   | Example                                    |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| Code, CLI, npm name, domains | `ingraft` (lowercase)                                                  | `bunx ingraft init`                        |
| Start of a sentence          | `Ingraft`                                                              | "Ingraft vendors upstream source."         |
| Mid-sentence prose           | `Ingraft` or `ingraft` (either; prefer `Ingraft` for proper-noun feel) | "We use Ingraft to manage vendored repos." |
| All caps                     | **Never** — do not write `INGRAFT`                                     | ❌                                         |
| Hyphenated                   | **Never** — do not write `in-graft`                                    | ❌                                         |

## Etymology — for the curious

From Middle English _ingraffen_, from Old French _enter_ + _graffe_ (stylus, scion), ultimately from Greek _graphein_ (to write, scratch). The verb originally described horticultural grafting; medical and metaphorical senses (insertion, bonding) emerged later.

The Italian cognate is _innesto_ (we considered it; see [name origin context](#why-this-name)). The German cognate is _einpfropfen_. The semantic concept — _insertion that becomes permanent_ — is consistent across Indo-European languages, which is part of what makes the word travel well.
