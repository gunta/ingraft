# Evals

Runs the prompts in [evals.json](evals.json) through Claude Code (`claude -p`) and OpenAI Codex (`codex exec`), then has a judge model grade each output against the `expected_behavior` criteria in JSON-schema-constrained mode.

## Run

```sh
bun evals/run.ts
```

By default this runs each eval through:

- `claude -p` with `claude-sonnet-4-6`, in `--permission-mode plan` (no destructive tools)
- `codex exec` with `gpt-5`, in `--sandbox read-only --ephemeral`

The judge defaults to `claude -p` with `claude-sonnet-4-6` using `--json-schema`. Each eval's `expected_behavior` is checked one-by-one and an overall pass/fail is reported.

Missing CLIs are skipped with a warning; the script continues if at least one is present.

## Configure

Environment variables (comma-separated for lists):

```sh
CLAUDE_MODELS=claude-haiku-4-5,claude-sonnet-4-6,claude-opus-4-7 \
CODEX_MODELS=gpt-5 \
JUDGE_RUNNER=claude \
JUDGE_MODEL=claude-sonnet-4-6 \
bun evals/run.ts
```

The first sweep above exercises all three Claude tiers — what the [best-practices doc](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) recommends.

To swap the judge to a non-Claude grader (avoids self-grading bias):

```sh
JUDGE_RUNNER=codex JUDGE_MODEL=gpt-5 bun evals/run.ts
```

## Output

Each run writes to `evals/results/<iso-timestamp>/`:

- `<id>_<name>__<runner>__<model>.run.txt` — agent's final message
- `<id>_<name>__<runner>__<model>.judge.json` — judge verdict + raw response
- `summary.json` — table of all rows with pass/fail, timings, summary lines

The console prints a one-line verdict per run and a final tally.

## How the skill is loaded

The runner injects the contents of [SKILL.md](../SKILL.md) into the agent's context — as `--append-system-prompt` for Claude, as a prefixed `--- SKILL ---` block in the prompt for Codex. This tests the _content_ of the skill across both runtimes without depending on each runtime's skill-discovery mechanism (which differ).

For real-world description-triggering tests (does Claude pick up the skill from its metadata?), use the description optimization loop in the `skill-creator` skill.

## Safety

Both runners are constrained to non-destructive modes and the prompt instructs dry-run behavior, but evals still spend tokens. The `--max-budget-usd 0.5` per run on Claude is a hard ceiling; Codex has no per-call budget flag, so each sweep across 5 evals × 2 runners costs roughly $0.20–$1.00 depending on models.
