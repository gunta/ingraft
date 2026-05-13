import { render } from "ink"
import type { ReactElement } from "react"

/**
 * Render a one-shot Ink tree to stdout, then unmount.
 * Output remains in terminal scrollback (Ink renders inline by default,
 * does not take over the alternate screen). Suitable for status output,
 * tables, and summaries.
 */
export const renderInkOnce = async (element: ReactElement): Promise<void> => {
  const instance = render(element, { patchConsole: false })
  // Allow one tick for the initial render frame to flush.
  await new Promise((resolve) => setImmediate(resolve))
  instance.unmount()
  await instance.waitUntilExit()
}
