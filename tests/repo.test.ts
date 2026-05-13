import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  githubRepoFromInput,
  hostedRepoFromInput,
  inferRepoName,
  normalizeRepoUrl
} from "../src/repo.ts"

describe("repo parsing", () => {
  test("normalizes GitHub shorthand to an HTTPS git URL", () => {
    expect(normalizeRepoUrl("Effect-TS/effect")).toBe(
      "https://github.com/Effect-TS/effect.git"
    )
  })

  test("leaves full URLs untouched", () => {
    expect(normalizeRepoUrl("git@github.com:Effect-TS/effect.git")).toBe(
      "git@github.com:Effect-TS/effect.git"
    )
  })

  test("extracts GitHub repo specs for gh cli operations", () => {
    expect(githubRepoFromInput("Effect-TS/effect")).toEqual({
      owner: "Effect-TS",
      name: "effect",
      nameWithOwner: "Effect-TS/effect"
    })
    expect(
      githubRepoFromInput("https://github.com/Effect-TS/effect.git")
    ).toEqual({
      owner: "Effect-TS",
      name: "effect",
      nameWithOwner: "Effect-TS/effect"
    })
    expect(githubRepoFromInput("git@github.com:Effect-TS/effect.git")).toEqual({
      owner: "Effect-TS",
      name: "effect",
      nameWithOwner: "Effect-TS/effect"
    })
    expect(githubRepoFromInput("https://example.com/org/repo.git")).toBeNull()
  })

  test("identifies popular hosted git providers from URLs", () => {
    expect(hostedRepoFromInput("https://gitlab.com/gitlab-org/cli.git")).toMatchObject({
      kind: "gitlab",
      path: "gitlab-org/cli"
    })
    expect(hostedRepoFromInput("https://bitbucket.org/team/repo.git")).toMatchObject({
      kind: "bitbucket",
      path: "team/repo"
    })
    expect(hostedRepoFromInput("https://codeberg.org/forgejo/forgejo.git")).toMatchObject({
      kind: "codeberg",
      path: "forgejo/forgejo"
    })
    expect(hostedRepoFromInput("https://git.sr.ht/~sircmpwn/git.sr.ht")).toMatchObject({
      kind: "sourcehut",
      path: "~sircmpwn/git.sr.ht"
    })
  })

  test("infers names from HTTPS and SSH git URLs", async () => {
    await expect(
      Effect.runPromise(inferRepoName("https://github.com/Effect-TS/effect.git"))
    ).resolves.toBe("effect")

    await expect(
      Effect.runPromise(inferRepoName("git@github.com:Effect-TS/effect.git"))
    ).resolves.toBe("effect")
  })

  test("fails with a tagged error when a repo name cannot be inferred", async () => {
    const failure = await Effect.runPromise(
      inferRepoName("https://github.com/").pipe(Effect.flip)
    )

    expect(failure._tag).toBe("RepoNameInferenceFailed")
  })
})
