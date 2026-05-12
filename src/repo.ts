import { Effect } from "effect"
import { die } from "./errors.ts"

export const normalizeRepoUrl = (input: string): string => {
  const trimmed = input.trim()
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return `https://github.com/${trimmed}.git`
  }
  return trimmed
}

export const inferRepoName = (url: string) =>
  Effect.gen(function* () {
    let path = url.endsWith(".git") ? url.slice(0, -4) : url

    if (path.includes(":") && !path.includes("://")) {
      path = path.split(":").slice(1).join(":")
    } else if (path.includes("://")) {
      try {
        path = new URL(path).pathname
      } catch {
        // Non-standard git URL. Fall through to basename parsing below.
      }
    }

    const name = path.replace(/\/+$/, "").split("/").pop() ?? ""
    if (!name) return yield* die(`Could not infer a name from URL: ${url}`, 2)
    return name
  })
