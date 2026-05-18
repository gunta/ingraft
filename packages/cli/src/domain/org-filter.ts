import { Option } from "effect"

import type { OrgRepository } from "../services/local-state.ts"

export interface OrgFilter {
  readonly language: ReadonlyArray<string>
  readonly since: string | null
  readonly excludeArchived: boolean
  readonly excludeForks: boolean
  readonly visibility: "public" | "private" | "internal" | "all"
  readonly search: string
}

const RELATIVE = /^(\d+)([dwm])$/

const MS_PER_DAY = 24 * 60 * 60 * 1000

export const parseSince = (
  input: string | null,
  now: Date = new Date()
): Option.Option<Date> => {
  const trimmed = (input ?? "").trim().toLowerCase()
  if (trimmed.length === 0) return Option.none()
  const match = RELATIVE.exec(trimmed)
  if (match) {
    const amount = Number(match[1])
    const unit = match[2]
    if (unit === "m") {
      const cutoff = new Date(now)
      cutoff.setUTCMonth(cutoff.getUTCMonth() - amount)
      return Option.some(cutoff)
    }
    const days = unit === "d" ? amount : amount * 7
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY)
    return Option.some(cutoff)
  }
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return Option.none()
  return Option.some(new Date(parsed))
}

const matchesLanguage = (
  primary: string | null,
  languages: ReadonlyArray<string>
): boolean => {
  if (languages.length === 0) return true
  if (primary === null) return false
  const lower = primary.toLowerCase()
  return languages.some((value) => value.toLowerCase() === lower)
}

const matchesSince = (
  pushedAt: string | null,
  cutoff: Option.Option<Date>
): boolean =>
  Option.match(cutoff, {
    onNone: () => true,
    onSome: (date) =>
      pushedAt !== null && new Date(pushedAt).getTime() >= date.getTime()
  })

const matchesVisibility = (
  visibility: string,
  selected: OrgFilter["visibility"]
): boolean => (selected === "all" ? true : visibility === selected)

const matchesSearch = (repo: OrgRepository, search: string): boolean => {
  const trimmed = search.trim().toLowerCase()
  if (trimmed.length === 0) return true
  if (repo.name.toLowerCase().includes(trimmed)) return true
  if (repo.description?.toLowerCase().includes(trimmed)) return true
  return false
}

export const filterOrgRepos = (
  repos: ReadonlyArray<OrgRepository>,
  filter: OrgFilter,
  now: Date = new Date()
): ReadonlyArray<OrgRepository> => {
  const cutoff = parseSince(filter.since, now)
  return repos.filter((repo) => {
    if (filter.excludeArchived && repo.isArchived) return false
    if (filter.excludeForks && repo.isFork) return false
    if (!matchesLanguage(repo.primaryLanguage, filter.language)) return false
    if (!matchesSince(repo.pushedAt, cutoff)) return false
    if (!matchesVisibility(repo.visibility, filter.visibility)) return false
    if (!matchesSearch(repo, filter.search)) return false
    return true
  })
}
