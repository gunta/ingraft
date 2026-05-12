import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"
import {
  AGENT_DOCS,
  SECTION_BEGIN,
  SECTION_END,
  VENDOR_DIR
} from "./constants.ts"
import type { VendoredRepo } from "./vendor-state.ts"

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const renderVendorSection = ({
  command,
  repos,
  scriptRel
}: {
  readonly command?: string
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly scriptRel?: string
}): string => {
  const invocation = command ?? `bun ${scriptRel ?? "scripts/vendor.ts"}`
  const lines: string[] = []
  lines.push(SECTION_BEGIN)
  lines.push("## Vendored Repositories")
  lines.push("")
  lines.push(
    `This project vendors external repositories under \`${VENDOR_DIR}/\` via \`git subtree\`.`
  )
  lines.push(
    "Treat these as **read-only reference material**, not as part of the application codebase."
  )
  lines.push("")
  lines.push("**Rules:**")
  lines.push(`- Do NOT edit files under \`${VENDOR_DIR}/\` unless explicitly asked.`)
  lines.push(
    `- Do NOT import from \`${VENDOR_DIR}/\` — application code imports from normal package dependencies.`
  )
  lines.push(
    `- Prefer examples and patterns from \`${VENDOR_DIR}/\` over web search or generated guesses.`
  )
  lines.push(`- Use \`${invocation} list\` to see what is vendored.`)
  lines.push(
    `- To add or update vendored repos, run \`${invocation} add <repo>\` or \`update <name>\`.`
  )
  lines.push("")

  if (repos.length === 0) {
    lines.push(
      `_No repositories vendored yet. Run \`${invocation} add <repo>\`._`
    )
  } else {
    lines.push("**Vendored repositories:**")
    lines.push("")
    for (const repo of repos) {
      lines.push(`- **\`${repo.prefix}\`** — \`${repo.url}\` @ \`${repo.ref}\``)
    }
  }

  lines.push("")
  lines.push(SECTION_END)
  return lines.join("\n")
}

export const injectSection = (content: string, section: string): string => {
  const managedSection = new RegExp(
    `${escapeRegex(SECTION_BEGIN)}[\\s\\S]*?${escapeRegex(SECTION_END)}`
  )
  if (managedSection.test(content)) return content.replace(managedSection, section)

  let prefix = content
  if (prefix && !prefix.endsWith("\n")) prefix += "\n"
  if (prefix) prefix += "\n"
  return `${prefix}${section}\n`
}

export const updateAgentDocs = ({
  command,
  cwd,
  repos
}: {
  readonly cwd: string
  readonly command: string
  readonly repos: ReadonlyArray<VendoredRepo>
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const section = renderVendorSection({ command, repos })

    const targets: string[] = []
    for (const name of AGENT_DOCS) {
      const target = path.resolve(cwd, name)
      if (yield* fs.exists(target)) targets.push(target)
    }
    if (targets.length === 0) targets.push(path.resolve(cwd, "AGENTS.md"))

    const written: string[] = []
    const seenReal = new Set<string>()
    for (const target of targets) {
      let real = target
      if (yield* fs.exists(target)) {
        real = yield* fs.realPath(target).pipe(Effect.orElseSucceed(() => target))
      }
      if (seenReal.has(real)) continue
      seenReal.add(real)

      const content = (yield* fs.exists(target))
        ? yield* fs.readFileString(target)
        : ""
      const next = injectSection(content, section)
      if (next !== content) {
        yield* fs.writeFileString(target, next)
        written.push(target)
      }
    }

    return written
  })
