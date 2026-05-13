import { render, Static, Box, Text } from "ink"
import { useState, useEffect } from "react"

import { glyphs, palette } from "../theme.ts"

export interface ProgressEntry {
  readonly id: string
  readonly label: string
  readonly status: "success" | "error"
}

interface ProgressViewProps {
  readonly entries: ProgressEntry[]
  readonly current: string | undefined
}

const ProgressView = ({ current, entries }: ProgressViewProps) => (
  <Box flexDirection="column">
    <Static items={entries}>
      {(entry) => (
        <Box key={entry.id} flexDirection="row" columnGap={1}>
          <Text color={entry.status === "success" ? palette.success : palette.danger}>
            {entry.status === "success" ? glyphs.success : glyphs.error}
          </Text>
          <Text color={palette.text}>{entry.label}</Text>
        </Box>
      )}
    </Static>
    {current !== undefined ? (
      <Box flexDirection="row" columnGap={1}>
        <Text color={palette.accent}>{glyphs.arrow}</Text>
        <Text color={palette.muted}>{current}</Text>
      </Box>
    ) : null}
  </Box>
)

export interface ProgressRenderer {
  readonly complete: (entry: ProgressEntry) => void
  readonly setCurrent: (label: string | undefined) => void
  readonly unmount: () => Promise<void>
}

const ProgressApp = ({ onReady }: { readonly onReady: (renderer: ProgressRenderer) => void }) => {
  const [entries, setEntries] = useState<ProgressEntry[]>([])
  const [current, setCurrent] = useState<string | undefined>(undefined)

  useEffect(() => {
    onReady({
      complete: (entry) => setEntries((prev) => [...prev, entry]),
      setCurrent,
      unmount: async () => {}
    })
  }, [])

  return <ProgressView entries={entries} current={current} />
}

export const mountProgress = (): Promise<ProgressRenderer> =>
  new Promise((resolve) => {
    const instance = render(
      <ProgressApp
        onReady={(renderer) => {
          resolve({
            ...renderer,
            unmount: async () => {
              instance.unmount()
              await instance.waitUntilExit()
            }
          })
        }}
      />,
      { patchConsole: false }
    )
  })
