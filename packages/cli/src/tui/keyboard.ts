import type { KeyEvent } from "@opentui/core"

import {
  dashboardTabs,
  dispatchDashboard,
  vendorStrategies,
  type DashboardState,
  type DashboardTab
} from "./dashboard.ts"

export interface DashboardController {
  readonly quit: () => void
  readonly refreshSnapshot: () => void
  readonly runSelected: () => void
  readonly state: () => DashboardState
  readonly updateState: (state: DashboardState) => void
}

const nextTab = (state: DashboardState, direction: 1 | -1): DashboardTab => {
  const current = dashboardTabs.indexOf(state.activeTab)
  const next = (current + direction + dashboardTabs.length) % dashboardTabs.length
  return dashboardTabs[next] ?? "tasks"
}

const keyName = (key: KeyEvent): string => key.name.toLowerCase()

const update = (controller: DashboardController, next: ReturnType<typeof dispatchDashboard>) =>
  controller.updateState(next)

const handleBrowsingKey = (key: KeyEvent, controller: DashboardController) => {
  const state = controller.state()
  const name = keyName(key)
  const sequence = key.sequence
  if (name === "q" || sequence === "q") {
    controller.quit()
    return
  }
  if (name === "down" || name === "j" || sequence === "j") {
    update(controller, dispatchDashboard(state, { type: "move-down" }))
    return
  }
  if (name === "up" || name === "k" || sequence === "k") {
    update(controller, dispatchDashboard(state, { type: "move-up" }))
    return
  }
  if (name === "space" || sequence === " ") {
    update(controller, dispatchDashboard(state, { type: "toggle-selected" }))
    return
  }
  if (name === "a" || sequence === "a") {
    update(controller, dispatchDashboard(state, { type: "select-all" }))
    return
  }
  if (name === "c" || sequence === "c") {
    update(controller, dispatchDashboard(state, { type: "clear-selection" }))
    return
  }
  if (name === "return" || name === "enter") {
    update(controller, dispatchDashboard(state, { type: "confirm-run" }))
    return
  }
  if (name === "r" || sequence === "r") {
    controller.refreshSnapshot()
    return
  }
  if (name === "tab" || name === "l" || sequence === "l") {
    update(controller, dispatchDashboard(state, { tab: nextTab(state, 1), type: "set-tab" }))
    return
  }
  if (name === "h" || sequence === "h") {
    update(controller, dispatchDashboard(state, { tab: nextTab(state, -1), type: "set-tab" }))
    return
  }
  if (sequence === "?" || name === "?") {
    update(controller, dispatchDashboard(state, { tab: "help", type: "set-tab" }))
    return
  }
  const strategyIndex = Number.parseInt(sequence, 10) - 1
  const strategy = vendorStrategies[strategyIndex]
  if (strategy !== undefined) {
    update(controller, dispatchDashboard(state, { strategy, type: "set-strategy" }))
  }
}

export const handleDashboardKey = (key: KeyEvent, controller: DashboardController) => {
  const state = controller.state()
  if (state.mode === "running") return
  if (state.mode === "confirming-run") {
    const name = keyName(key)
    if (name === "y" || key.sequence === "y") {
      controller.runSelected()
      return
    }
    if (name === "n" || name === "escape" || key.sequence === "n") {
      update(controller, dispatchDashboard(state, { type: "cancel" }))
    }
    return
  }
  handleBrowsingKey(key, controller)
}
