import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import {
  WAITING_DELAY_MS,
  clearWaitingDetail,
  commandWaitingLabel,
  createDelayedWaitingUi,
  formatWaitingProgress,
  setWaitingDetail,
  shouldEnableWaitingUi,
  withDelayedWaiting
} from "../src/app/waiting.ts"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("delayed waiting UI", () => {
  test("uses a 300ms default threshold and labels slow CLI operations", () => {
    expect(WAITING_DELAY_MS).toBe(300)
    expect(commandWaitingLabel(["deps", "--json"])).toBe("Scanning dependency metadata")
    expect(commandWaitingLabel(["doctor", "--json"])).toBe("Checking project health")
    expect(commandWaitingLabel(["gunta/confect"])).toBe("Preparing source route(s)")
    expect(commandWaitingLabel(["--version"])).toBeUndefined()
    expect(commandWaitingLabel(["deps", "--help"])).toBeUndefined()
  })

  test("formats an animated progress bar frame for scanning work", () => {
    expect(
      formatWaitingProgress({
        detail: "effect (1/18)",
        elapsedMs: 345,
        frameIndex: 0,
        label: "Scanning dependency metadata",
        width: 12
      })
    ).toBe("- Scanning dependency metadata [===---------] 0.3s | effect (1/18)")
    expect(
      formatWaitingProgress({
        elapsedMs: 1_240,
        frameIndex: 4,
        label: "Scanning dependency metadata",
        width: 12
      })
    ).toBe("- Scanning dependency metadata [----===-----] 1.2s")
  })

  test("keeps progress output to a single terminal line", () => {
    const line = formatWaitingProgress({
      detail:
        "@very/long-dependency-name-that-should-not-wrap-across-lines-because-that-breaks-progress-rendering\n(9/99)",
      elapsedMs: 1_040,
      frameIndex: 8,
      label: "Scanning dependency metadata",
      maxColumns: 80,
      width: 12
    })

    expect(line).not.toContain("\n")
    expect(line.length).toBeLessThanOrEqual(80)
    expect(line.endsWith("...")).toBe(true)
  })

  test("only enables the waiting UI for interactive stderr unless explicitly disabled", () => {
    expect(
      shouldEnableWaitingUi({
        env: {},
        label: "Scanning dependency metadata",
        stderrIsTTY: true
      })
    ).toBe(true)
    expect(
      shouldEnableWaitingUi({
        env: { CI: "1" },
        label: "Scanning dependency metadata",
        stderrIsTTY: true
      })
    ).toBe(false)
    expect(
      shouldEnableWaitingUi({
        env: { INGRAFT_WAIT_UI: "0" },
        label: "Scanning dependency metadata",
        stderrIsTTY: true
      })
    ).toBe(false)
    expect(
      shouldEnableWaitingUi({
        env: {},
        label: "Scanning dependency metadata",
        stderrIsTTY: false
      })
    ).toBe(false)
    expect(
      shouldEnableWaitingUi({
        env: {},
        label: undefined,
        stderrIsTTY: true
      })
    ).toBe(false)
  })

  test("delays the waiting line and clears it when the operation finishes", async () => {
    const writes: Array<string> = []
    let detail = "effect (1/18)"
    const controller = createDelayedWaitingUi({
      delayMs: 5,
      detail: () => detail,
      intervalMs: 5,
      label: "Scanning dependency metadata",
      write: (chunk) => writes.push(chunk)
    })

    expect(writes).toEqual([])
    await sleep(12)
    expect(writes.join("")).toContain("Scanning dependency metadata")
    expect(writes.join("")).toContain("[===---------]")
    expect(writes.join("")).toContain("effect (1/18)")

    detail = "@effect/platform-bun (2/18)"
    await sleep(12)
    controller.stop()
    expect(writes.join("")).toContain("@effect/platform-bun")

    expect(writes.at(-1)).toBe("\r\u001B[2K")
  })

  test("wraps effects without writing anything when they finish before the threshold", async () => {
    const writes: Array<string> = []
    const result = await Effect.runPromise(
      withDelayedWaiting(Effect.succeed("ok"), {
        delayMs: 20,
        env: {},
        label: "Scanning dependency metadata",
        stderrIsTTY: true,
        write: (chunk) => writes.push(chunk)
      })
    )

    expect(result).toBe("ok")
    expect(writes).toEqual([])
  })

  test("redraws immediately when dependency detail changes after the wait UI is visible", async () => {
    const writes: Array<string> = []
    const controller = createDelayedWaitingUi({
      delayMs: 5,
      intervalMs: 500,
      label: "Scanning dependency metadata",
      write: (chunk) => writes.push(chunk)
    })

    await sleep(12)
    const writesAfterInitialFrame = writes.length
    await Effect.runPromise(setWaitingDetail("effect (1/2)"))
    await sleep(1)
    controller.stop()
    await Effect.runPromise(clearWaitingDetail())

    expect(writes.length).toBeGreaterThan(writesAfterInitialFrame)
    expect(writes.join("")).toContain("effect (1/2)")
  })
})
