#!/usr/bin/env bun
import { spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const HERE = import.meta.dir
const REPO_ROOT = resolve(HERE, "..")
const SKILL_PATH = resolve(REPO_ROOT, "SKILL.md")
const EVALS_PATH = resolve(HERE, "evals.json")
const STAMP = new Date().toISOString().replace(/[:.]/g, "-")
const RESULTS_DIR = resolve(HERE, "results", STAMP)

type Runner = "claude" | "codex"

type EvalCase = {
  id: number
  name: string
  prompt: string
  expected_behavior: ReadonlyArray<string>
}

const CLAUDE_MODELS = (process.env.CLAUDE_MODELS ?? "claude-sonnet-4-6")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const CODEX_MODELS = (process.env.CODEX_MODELS ?? "gpt-5")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const JUDGE_RUNNER = (process.env.JUDGE_RUNNER as Runner | undefined) ?? "claude"
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6"

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "overall_pass", "criteria"],
  properties: {
    summary: { type: "string" },
    overall_pass: { type: "boolean" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "passed", "evidence"],
        properties: {
          text: { type: "string" },
          passed: { type: "boolean" },
          evidence: { type: "string" }
        }
      }
    }
  }
} as const

const DRY_RUN_NOTE =
  "\n\nIMPORTANT (eval mode): Do not actually execute commands, edit files, or change git state. Reply with the exact CLI commands you would run, in order, and a brief rationale. Plain text is fine."

const sanitize = (s: string) => s.replace(/[^\w.-]/g, "_")

const which = (cmd: string) =>
  new Promise<boolean>((resolveFn) => {
    const proc = spawn("sh", ["-c", `command -v ${cmd} >/dev/null 2>&1`], {
      stdio: "ignore"
    })
    proc.on("close", (code) => resolveFn(code === 0))
  })

type ProcResult = { code: number; stdout: string; stderr: string }

const runProcess = (
  cmd: string,
  args: ReadonlyArray<string>,
  stdin?: string
): Promise<ProcResult> =>
  new Promise((resolveFn) => {
    const proc = spawn(cmd, [...args], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: REPO_ROOT
    })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    proc.on("close", (code) => resolveFn({ code: code ?? -1, stdout, stderr }))
    if (stdin !== undefined) {
      proc.stdin.write(stdin)
    }
    proc.stdin.end()
  })

const runEvalWithClaude = async (
  model: string,
  ev: EvalCase,
  skillText: string,
  outFile: string
) => {
  const systemPrompt = `You have access to the following Agent Skill. Apply it where relevant when answering.\n\n${skillText}`
  return runProcess("claude", [
    "-p",
    "--model",
    model,
    "--append-system-prompt",
    systemPrompt,
    "--permission-mode",
    "plan",
    "--max-budget-usd",
    "0.5",
    "--no-session-persistence",
    `${ev.prompt}${DRY_RUN_NOTE}`
  ]).then(async (r) => {
    await writeFile(outFile, r.stdout)
    return r
  })
}

const runEvalWithCodex = async (
  model: string,
  ev: EvalCase,
  skillText: string,
  outFile: string
) => {
  const prompt = `You have access to the following Agent Skill. Apply it where relevant.\n\n--- SKILL ---\n${skillText}\n\n--- TASK ---\n${ev.prompt}${DRY_RUN_NOTE}`
  return runProcess("codex", [
    "exec",
    "--model",
    model,
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--output-last-message",
    outFile,
    prompt
  ])
}

const judgePromptFor = (ev: EvalCase, output: string) =>
  `You are grading an agent's response to a task. Mark each expected behavior as passed (true) or not (false), with one-line evidence (quote or paraphrase from the response). Set overall_pass to true only if EVERY criterion passed.\n\nTASK:\n${ev.prompt}\n\nEXPECTED BEHAVIORS:\n${ev.expected_behavior.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nAGENT RESPONSE:\n${output}\n\nReturn JSON matching the provided schema. Set summary to a one-sentence verdict.`

const judgeWithClaude = (ev: EvalCase, output: string) =>
  runProcess("claude", [
    "-p",
    "--model",
    JUDGE_MODEL,
    "--permission-mode",
    "plan",
    "--max-budget-usd",
    "0.25",
    "--no-session-persistence",
    "--json-schema",
    JSON.stringify(JUDGE_SCHEMA),
    judgePromptFor(ev, output)
  ])

const judgeWithCodex = async (ev: EvalCase, output: string) => {
  const schemaPath = resolve(RESULTS_DIR, "_judge-schema.json")
  await writeFile(schemaPath, JSON.stringify(JUDGE_SCHEMA))
  const outPath = resolve(RESULTS_DIR, `_judge-${Date.now()}.txt`)
  const result = await runProcess("codex", [
    "exec",
    "--model",
    JUDGE_MODEL,
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outPath,
    judgePromptFor(ev, output)
  ])
  try {
    const final = await readFile(outPath, "utf8")
    return { ...result, stdout: final }
  } catch {
    return result
  }
}

const tryParseJudge = (raw: string) => {
  try {
    return JSON.parse(raw)
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0])
    } catch {
      return null
    }
  }
}

const main = async () => {
  await mkdir(RESULTS_DIR, { recursive: true })
  const skillText = await readFile(SKILL_PATH, "utf8")
  const evalSet = JSON.parse(await readFile(EVALS_PATH, "utf8")) as {
    evals: ReadonlyArray<EvalCase>
  }

  const haveClaude = await which("claude")
  const haveCodex = await which("codex")
  if (!haveClaude && !haveCodex) {
    throw new Error("neither `claude` nor `codex` is on PATH")
  }
  if (!haveClaude) console.warn("⚠ claude not on PATH — skipping Claude runs")
  if (!haveCodex) console.warn("⚠ codex not on PATH — skipping Codex runs")

  type Row = {
    tag: string
    runner: Runner
    model: string
    eval: string
    overall_pass: boolean | null
    passed: number
    total: number
    elapsed_ms: number
    error?: string
    summary?: string
  }
  const rows: Array<Row> = []

  const sweeps: Array<{ runner: Runner; models: ReadonlyArray<string> }> = [
    ...(haveClaude ? [{ runner: "claude" as const, models: CLAUDE_MODELS }] : []),
    ...(haveCodex ? [{ runner: "codex" as const, models: CODEX_MODELS }] : [])
  ]

  for (const ev of evalSet.evals) {
    for (const { runner, models } of sweeps) {
      for (const model of models) {
        const tag = `${ev.id.toString().padStart(2, "0")}_${ev.name}__${runner}__${sanitize(model)}`
        const runPath = resolve(RESULTS_DIR, `${tag}.run.txt`)
        const judgePath = resolve(RESULTS_DIR, `${tag}.judge.json`)
        process.stdout.write(`▸ ${tag} ... `)
        const t0 = Date.now()
        const runResult =
          runner === "claude"
            ? await runEvalWithClaude(model, ev, skillText, runPath)
            : await runEvalWithCodex(model, ev, skillText, runPath)
        const elapsed = Date.now() - t0
        if (runResult.code !== 0) {
          const err = `exit ${runResult.code}: ${runResult.stderr.split("\n").slice(0, 2).join(" | ")}`
          console.log(`✗ runner ${err} (${(elapsed / 1000).toFixed(1)}s)`)
          await writeFile(resolve(RESULTS_DIR, `${tag}.run.stderr.txt`), runResult.stderr)
          rows.push({
            tag,
            runner,
            model,
            eval: ev.name,
            overall_pass: null,
            passed: 0,
            total: ev.expected_behavior.length,
            elapsed_ms: elapsed,
            error: err
          })
          continue
        }

        const output = await readFile(runPath, "utf8")
        const judged =
          JUDGE_RUNNER === "claude" && haveClaude
            ? await judgeWithClaude(ev, output)
            : haveCodex
              ? await judgeWithCodex(ev, output)
              : await judgeWithClaude(ev, output)
        const verdict = tryParseJudge(judged.stdout)
        await writeFile(
          judgePath,
          JSON.stringify({ raw: judged.stdout, parsed: verdict, stderr: judged.stderr }, null, 2)
        )
        const passed = verdict?.criteria?.filter((c: { passed: boolean }) => c.passed).length ?? 0
        const total = verdict?.criteria?.length ?? ev.expected_behavior.length
        const overall: boolean | null = verdict?.overall_pass ?? null
        const mark = overall === true ? "✓" : overall === false ? "✗" : "?"
        const summaryLine = verdict?.summary ? ` — ${verdict.summary}` : ""
        console.log(`${mark} ${passed}/${total}${summaryLine} (${(elapsed / 1000).toFixed(1)}s)`)
        rows.push({
          tag,
          runner,
          model,
          eval: ev.name,
          overall_pass: overall,
          passed,
          total,
          elapsed_ms: elapsed,
          summary: verdict?.summary
        })
      }
    }
  }

  const summary = {
    stamp: STAMP,
    skill: SKILL_PATH,
    judge: { runner: JUDGE_RUNNER, model: JUDGE_MODEL },
    rows
  }
  await writeFile(resolve(RESULTS_DIR, "summary.json"), JSON.stringify(summary, null, 2))

  const passes = rows.filter((r) => r.overall_pass === true).length
  const fails = rows.filter((r) => r.overall_pass === false).length
  const errors = rows.filter((r) => r.error).length
  const totalRuns = rows.length
  console.log("")
  console.log(`Pass: ${passes}/${totalRuns}   Fail: ${fails}   Error: ${errors}`)
  console.log(`Results: ${RESULTS_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
