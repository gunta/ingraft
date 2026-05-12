import { FALLBACK_SCRIPT_REL } from "./constants.ts"

export const scriptRelTo = (cwd: string, argv = process.argv): string => {
  const raw = argv[1]
  if (!raw) return FALLBACK_SCRIPT_REL
  const root = cwd.endsWith("/") ? cwd : `${cwd}/`
  if (raw.startsWith(root)) return raw.slice(root.length)

  const slash = raw.lastIndexOf("/")
  return slash >= 0 ? `scripts/${raw.slice(slash + 1)}` : FALLBACK_SCRIPT_REL
}

export const bunInvocation = (cwd: string, argv = process.argv): string =>
  `bun ${scriptRelTo(cwd, argv)}`

export const commandInvocation = (cwd: string, argv = process.argv): string => {
  const raw = argv[1]
  const root = cwd.endsWith("/") ? cwd : `${cwd}/`
  return raw && raw.startsWith(root) ? bunInvocation(cwd, argv) : "vendor-subtree"
}
