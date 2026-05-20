import { Effect } from "effect"
import { Box, render as inkRender, Text } from "ink"
import { createElement, useEffect, useState, useSyncExternalStore } from "react"

export const WAITING_DELAY_MS = 300
const WAITING_INTERVAL_MS = 120
const WAITING_FRAMES = ["-", "\\", "|", "/"] as const
const WAITING_BAR_WIDTH = 18
const WAITING_FALLBACK_COLUMNS = 80
let activeWaitingDetail: string | undefined
const waitingDetailListeners = new Set<() => void>()

const commandLabels = {
  add: "Adding durable source route",
  "add-org": "Loading organization repositories",
  context: "Checking context tools",
  deps: "Scanning dependency metadata",
  doctor: "Checking project health",
  fork: "Preparing fork workspace",
  init: "Inspecting repository setup",
  list: "Loading durable source routes",
  refresh: "Refreshing generated ignores",
  remove: "Removing durable source route",
  tui: "Opening ingraft dashboard",
  update: "Updating durable source route"
} as const

const helpOrVersionFlags = new Set(["--help", "-h", "--version", "-v"])

const isDisabledEnvValue = (value: string | undefined): boolean =>
  value === undefined ? false : ["0", "false", "no", "off"].includes(value.toLowerCase())

const isEnabledEnvValue = (value: string | undefined): boolean =>
  value === undefined ? false : ["1", "true", "yes", "on"].includes(value.toLowerCase())

export const commandWaitingLabel = (args: ReadonlyArray<string>): string | undefined => {
  if (args.some((arg) => helpOrVersionFlags.has(arg))) return undefined
  const command = args.find((arg) => !arg.startsWith("-"))
  if (command === undefined) return commandLabels.tui
  return command in commandLabels
    ? commandLabels[command as keyof typeof commandLabels]
    : "Preparing source route(s)"
}

export const shouldEnableWaitingUi = (_params: {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly label: string | undefined
  readonly stderrIsTTY: boolean
}): boolean => {
  const { env, label, stderrIsTTY } = _params
  if (label === undefined) return false
  const configured = env.INGRAFT_WAIT_UI
  if (isDisabledEnvValue(configured)) return false
  if (isEnabledEnvValue(configured)) return true
  if (env.CI !== undefined) return false
  return stderrIsTTY
}

export interface DelayedWaitingUiOptions {
  readonly delayMs?: number
  readonly detail?: () => string | undefined
  readonly intervalMs?: number
  readonly label: string
  readonly output?: NodeJS.WriteStream
  readonly write?: (chunk: string) => void
}

export interface DelayedWaitingUi {
  readonly stop: () => void
}

const elapsedLabel = (elapsedMs: number): string => `${(elapsedMs / 1_000).toFixed(1)}s`

const currentWaitingDetail = (): string | undefined => activeWaitingDetail
const waitingDetailSnapshot = (): string => activeWaitingDetail ?? ""

const subscribeWaitingDetail = (listener: () => void): (() => void) => {
  waitingDetailListeners.add(listener)
  return () => {
    waitingDetailListeners.delete(listener)
  }
}

const notifyWaitingDetailListeners = () => {
  for (const listener of waitingDetailListeners) {
    listener()
  }
}

export const setWaitingDetail = (detail: string): Effect.Effect<void> =>
  Effect.sync(() => {
    activeWaitingDetail = detail
    notifyWaitingDetailListeners()
  })

export const clearWaitingDetail = (): Effect.Effect<void> =>
  Effect.sync(() => {
    activeWaitingDetail = undefined
    notifyWaitingDetailListeners()
  })

const progressBar = (params: { readonly frameIndex: number; readonly width: number }): string => {
  const pulseWidth = Math.max(3, Math.floor(params.width / 4))
  const start = params.frameIndex % params.width
  return Array.from({ length: params.width }, (_, index) => {
    const distance = (index - start + params.width) % params.width
    return distance < pulseWidth ? "=" : "-"
  }).join("")
}

const sanitizedDetail = (detail: string): string | undefined => {
  const normalized = detail.replace(/\s+/g, " ").trim()
  return normalized.length === 0 ? undefined : normalized
}

const truncateToColumns = (value: string, maxColumns: number | undefined): string => {
  if (maxColumns === undefined || maxColumns <= 0 || value.length <= maxColumns) return value
  if (maxColumns <= 3) return ".".repeat(maxColumns)
  return `${value.slice(0, maxColumns - 3)}...`
}

const terminalColumns = (output: NodeJS.WriteStream): number =>
  Math.max(20, output.columns ?? WAITING_FALLBACK_COLUMNS)

export const formatWaitingProgress = (params: {
  readonly detail?: string
  readonly elapsedMs: number
  readonly frameIndex: number
  readonly label: string
  readonly maxColumns?: number
  readonly width?: number
}): string => {
  const frame = WAITING_FRAMES[params.frameIndex % WAITING_FRAMES.length] ?? "-"
  const bar = progressBar({
    frameIndex: params.frameIndex,
    width: params.width ?? WAITING_BAR_WIDTH
  })
  const detail = params.detail === undefined ? undefined : sanitizedDetail(params.detail)
  const suffix = detail === undefined ? "" : ` | ${detail}`
  return truncateToColumns(
    `${frame} ${params.label} [${bar}] ${elapsedLabel(params.elapsedMs)}${suffix}`,
    params.maxColumns
  )
}

const WaitingProgress = ({
  columns,
  detail,
  intervalMs,
  label,
  startedAt
}: {
  readonly columns: () => number
  readonly detail: () => string | undefined
  readonly intervalMs: number
  readonly label: string
  readonly startedAt: number
}) => {
  const [frameIndex, setFrameIndex] = useState(0)
  useSyncExternalStore(subscribeWaitingDetail, waitingDetailSnapshot, waitingDetailSnapshot)

  useEffect(() => {
    const interval = setInterval(() => setFrameIndex((index) => index + 1), intervalMs)
    return () => clearInterval(interval)
  }, [intervalMs])

  const currentDetail = detail()
  const maxColumns = columns()
  return createElement(
    Box,
    { width: maxColumns },
    createElement(Text, {
      wrap: "truncate",
      children: formatWaitingProgress({
        ...(currentDetail === undefined ? {} : { detail: currentDetail }),
        elapsedMs: Date.now() - startedAt,
        frameIndex,
        label,
        maxColumns
      })
    })
  )
}

export const createDelayedWaitingUi = ({
  delayMs = WAITING_DELAY_MS,
  detail = currentWaitingDetail,
  intervalMs = WAITING_INTERVAL_MS,
  label,
  output = process.stderr,
  write
}: DelayedWaitingUiOptions): DelayedWaitingUi => {
  const startedAt = Date.now()
  let frameIndex = 0
  let interval: ReturnType<typeof setInterval> | undefined
  let ink: ReturnType<typeof inkRender> | undefined
  let shown = false
  let stopped = false
  const columns = () => terminalColumns(output)

  const renderTextFrame = ({ advanceFrame = true }: { readonly advanceFrame?: boolean } = {}) => {
    if (stopped) return
    shown = true
    const currentDetail = detail()
    write?.(
      `\r${formatWaitingProgress({
        ...(currentDetail === undefined ? {} : { detail: currentDetail }),
        elapsedMs: Date.now() - startedAt,
        frameIndex,
        label,
        maxColumns: columns(),
        width: 12
      })}`
    )
    if (advanceFrame) frameIndex += 1
  }

  const unsubscribeDetail = subscribeWaitingDetail(() => {
    if (write === undefined || !shown) return
    renderTextFrame({ advanceFrame: false })
  })

  const mountInk = () => {
    if (stopped) return
    shown = true
    ink = inkRender(
      createElement(WaitingProgress, { columns, detail, intervalMs, label, startedAt }),
      {
        exitOnCtrlC: false,
        incrementalRendering: true,
        interactive: Boolean(output.isTTY),
        maxFps: Math.max(1, Math.ceil(1_000 / intervalMs)),
        patchConsole: false,
        stderr: output,
        stdout: output
      }
    )
  }

  const timeout = setTimeout(() => {
    if (write === undefined) {
      mountInk()
      return
    }
    renderTextFrame()
    interval = setInterval(renderTextFrame, intervalMs)
  }, delayMs)

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      clearTimeout(timeout)
      unsubscribeDetail()
      if (interval !== undefined) clearInterval(interval)
      if (ink !== undefined) {
        ink.clear()
        ink.unmount()
        void ink.waitUntilExit().catch(() => {})
      } else if (shown) {
        write?.("\r\u001B[2K")
      }
    }
  }
}

export interface WithDelayedWaitingOptions {
  readonly delayMs?: number
  readonly env: Readonly<Record<string, string | undefined>>
  readonly intervalMs?: number
  readonly label: string | undefined
  readonly stderrIsTTY: boolean
  readonly write?: (chunk: string) => void
}

export const withDelayedWaiting = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: WithDelayedWaitingOptions
): Effect.Effect<A, E, R> => {
  const label = options.label
  if (!shouldEnableWaitingUi(options) || label === undefined) return effect
  return Effect.gen(function* () {
    const write = options.write ?? ((chunk: string) => process.stderr.write(chunk))
    const controller = yield* Effect.sync(() => {
      return createDelayedWaitingUi({
        label,
        output: process.stderr,
        ...(options.write === undefined ? {} : { write }),
        ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
        ...(options.intervalMs === undefined ? {} : { intervalMs: options.intervalMs })
      })
    })
    return yield* effect.pipe(Effect.ensuring(Effect.sync(() => controller.stop())))
  })
}
