import { describe, expect, test } from "bun:test"
import { join } from "node:path"

import { parse } from "yaml"

const workspaceRoot = process.cwd()

type WorkflowStep = {
  readonly name?: string
  readonly run?: string
  readonly uses?: string
  readonly with?: Record<string, unknown>
  readonly "working-directory"?: string
}

type WorkflowJob = {
  readonly environment?: string | { readonly name?: string; readonly url?: string }
  readonly needs?: string | readonly string[]
  readonly permissions?: Record<string, string>
  readonly steps?: readonly WorkflowStep[]
}

type Workflow = {
  readonly name?: string
  readonly on?: Record<string, unknown>
  readonly permissions?: Record<string, string>
  readonly jobs?: Record<string, WorkflowJob>
}

type PackageJson = {
  readonly private?: boolean
  readonly publishConfig?: {
    readonly access?: string
  }
}

const readWorkflow = async (path: string): Promise<Workflow> =>
  parse(await Bun.file(join(workspaceRoot, path)).text()) as Workflow

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Bun.file(join(workspaceRoot, path)).text()) as T

const expectStep = (
  steps: readonly WorkflowStep[] | undefined,
  matcher: Partial<WorkflowStep>
): void => {
  expect(steps).toEqual(expect.arrayContaining([expect.objectContaining(matcher)]))
}

const workflowText = async (path: string): Promise<string> =>
  await Bun.file(join(workspaceRoot, path)).text()

describe("release automation workflows", () => {
  test("marks publishable packages for public npm release", async () => {
    const packages = await Promise.all(
      ["packages/cli/package.json", "packages/tui/package.json", "packages/skill/package.json"].map(
        async (path) => [path, await readJson<PackageJson>(path)] as const
      )
    )

    for (const [path, packageJson] of packages) {
      expect(packageJson.private, path).not.toBe(true)
      expect(packageJson.publishConfig, path).toMatchObject({ access: "public" })
    }
  })

  test("runs CI checks on pushes and pull requests", async () => {
    const workflow = await readWorkflow(".github/workflows/ci.yml")
    const check = workflow.jobs?.check

    expect(workflow.name).toBe("CI")
    expect(workflow.on).toMatchObject({
      pull_request: {},
      push: { branches: ["main"] }
    })
    expect(workflow.permissions).toEqual({ contents: "read" })
    expect(check).toMatchObject({
      permissions: { contents: "read" }
    })
    expectStep(check?.steps, { uses: "actions/checkout@v6" })
    expectStep(check?.steps, {
      uses: "oven-sh/setup-bun@v2",
      with: { "bun-version": "1.3.13" }
    })
    expectStep(check?.steps, { run: "bun install --frozen-lockfile" })
    expectStep(check?.steps, { run: "bun run check" })
    expectStep(check?.steps, { run: "bun run build" })
  })

  test("publishes all npm packages through GitHub OIDC", async () => {
    const path = ".github/workflows/release-packages.yml"
    const workflow = await readWorkflow(path)
    const publish = workflow.jobs?.publish
    const text = await workflowText(path)

    expect(workflow.name).toBe("Release packages")
    expect(workflow.on).toMatchObject({
      release: { types: ["published"] },
      workflow_dispatch: {}
    })
    expect(workflow.permissions).toEqual({
      contents: "read",
      "id-token": "write"
    })
    expect(publish?.environment).toBe("npm")
    expectStep(publish?.steps, { uses: "actions/setup-node@v6" })
    expectStep(publish?.steps, { run: "bun install --frozen-lockfile" })
    expectStep(publish?.steps, { run: "bun run check" })
    expectStep(publish?.steps, { run: "bun run build" })

    for (const directory of ["packages/cli", "packages/tui", "packages/skill"]) {
      expectStep(publish?.steps, {
        "working-directory": directory,
        run: "npm publish --access public"
      })
    }

    expect(text).not.toContain("NPM_TOKEN")
    expect(text).not.toContain("NODE_AUTH_TOKEN")
  })

  test("deploys the Astro site with the official GitHub Pages actions", async () => {
    const workflow = await readWorkflow(".github/workflows/deploy-pages.yml")
    const build = workflow.jobs?.build
    const deploy = workflow.jobs?.deploy

    expect(workflow.name).toBe("Deploy site")
    expect(workflow.on).toMatchObject({
      push: {
        branches: ["main"],
        paths: expect.arrayContaining(["packages/website/**", ".github/workflows/deploy-pages.yml"])
      },
      workflow_dispatch: {}
    })
    expect(workflow.permissions).toEqual({
      contents: "read",
      pages: "write",
      "id-token": "write"
    })
    expectStep(build?.steps, { uses: "actions/configure-pages@v5" })
    expectStep(build?.steps, { run: "bun run website:build" })
    expectStep(build?.steps, {
      uses: "actions/upload-pages-artifact@v4",
      with: { path: "packages/website/dist" }
    })
    expect(deploy).toMatchObject({
      needs: "build",
      environment: {
        name: "github-pages",
        url: "${{ steps.deployment.outputs.page_url }}"
      }
    })
    expectStep(deploy?.steps, { uses: "actions/deploy-pages@v4" })
  })
})
