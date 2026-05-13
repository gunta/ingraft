#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"

import { readSnapshot, runCommandPlan } from "./cli-adapter.ts"
import {
  commandPlanForSelection,
  createDashboardState,
  dispatchDashboard,
  type DashboardState
} from "./dashboard.ts"
import { handleDashboardKey } from "./keyboard.ts"
import { colors, renderDashboard } from "./render.ts"

let state = createDashboardState(readSnapshot().snapshot)

const renderer = await createCliRenderer({
  backgroundColor: colors.background,
  clearOnShutdown: true,
  enableMouseMovement: true,
  exitOnCtrlC: true,
  screenMode: "alternate-screen",
  targetFps: 30,
  useMouse: true
})

const render = () => {
  const current = renderer.root.findDescendantById("dashboard")
  if (current !== undefined) renderer.root.remove("dashboard")
  renderer.root.add(
    renderDashboard(state, {
      height: renderer.terminalHeight,
      width: renderer.terminalWidth
    })
  )
  renderer.requestRender()
}

const updateState = (next: DashboardState) => {
  state = next
  render()
}

const refreshSnapshot = (message?: string) => {
  const refreshed = readSnapshot()
  updateState(
    dispatchDashboard(state, {
      message: message ?? refreshed.message,
      snapshot: refreshed.snapshot,
      type: "refresh"
    })
  )
}

const runSelected = () => {
  const plans = commandPlanForSelection(state)
  if (plans.length === 0) {
    updateState(dispatchDashboard(state, { type: "cancel" }))
    return
  }

  updateState(dispatchDashboard(state, { type: "start-run" }))
  for (const plan of plans) {
    updateState(dispatchDashboard(state, { line: `RUN ${plan.label}`, type: "append-log" }))
    updateState(dispatchDashboard(state, { line: runCommandPlan(plan), type: "append-log" }))
  }
  const refreshed = readSnapshot()
  updateState(
    dispatchDashboard(state, {
      message: `Processed ${plans.length} task(s). ${refreshed.message}`,
      snapshot: refreshed.snapshot,
      type: "finish-run"
    })
  )
}

renderer.keyInput.on("keypress", (key) =>
  handleDashboardKey(key, {
    quit: () => {
      renderer.destroy()
      process.exit(0)
    },
    refreshSnapshot,
    runSelected,
    state: () => state,
    updateState
  })
)

render()
