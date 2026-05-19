import { VERSION } from "../domain/constants.ts"

export interface UpdateNotifierOptions {
  readonly pkg: {
    readonly name: string
    readonly version: string
  }
  readonly updateCheckInterval: number
}

export interface UpdateNotifierInstance {
  readonly notify: (options: { readonly defer: boolean; readonly message: string }) => void
}

export type UpdateNotifier = (options: UpdateNotifierOptions) => UpdateNotifierInstance

export interface NotifyIfCliOutdatedOptions {
  readonly currentVersion?: string
  readonly updateNotifier?: UpdateNotifier
}

export const CLI_PACKAGE_NAME = "@ingraft/cli"
export const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24
export const UPDATE_BANNER_MESSAGE =
  "Update available: {packageName} {currentVersion} -> {latestVersion}\nRun npm install -g {packageName}@latest to upgrade."

const runUpdateNotifier = (notifier: UpdateNotifier, currentVersion: string): void => {
  notifier({
    pkg: {
      name: CLI_PACKAGE_NAME,
      version: currentVersion
    },
    updateCheckInterval: UPDATE_CHECK_INTERVAL_MS
  }).notify({
    defer: true,
    message: UPDATE_BANNER_MESSAGE
  })
}

export function notifyIfCliOutdated({
  currentVersion = VERSION,
  updateNotifier: notifier
}: NotifyIfCliOutdatedOptions = {}): void {
  try {
    if (notifier !== undefined) {
      runUpdateNotifier(notifier, currentVersion)
      return
    }
    const timer = setTimeout(() => {
      void import("update-notifier")
        .then(({ default: importedNotifier }) =>
          runUpdateNotifier(importedNotifier, currentVersion)
        )
        .catch(() => undefined)
    }, 0)
    timer.unref?.()
  } catch {
    // Update checks are best-effort and must never delay or fail the CLI.
  }
}
