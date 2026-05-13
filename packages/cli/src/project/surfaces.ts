import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"

import { AGENT_DOCS, SECTION_BEGIN, SECTION_END } from "../domain/constants.ts"
import type { VendoredRepo } from "../domain/vendor-state.ts"
import { mergeIntellijFileColorsText, mergeIntellijVendorScopeText } from "../editors/intellij.ts"
import { mergeVscodeSettingsText } from "../editors/vscode.ts"
import {
  GITATTRIBUTES_VENDOR_BEGIN,
  GITATTRIBUTES_VENDOR_END,
  mergeGitattributesText
} from "./gitattributes.ts"

export type ProjectSurfaceKind = "agent" | "editor" | "repository"

export type ProjectSurfaceStatus = "absent" | "configured" | "invalid" | "managed" | "present"

export interface ProjectSurfaceReport {
  readonly _tag: "ProjectSurfaceReport"
  readonly kind: ProjectSurfaceKind
  readonly message: string
  readonly name: string
  readonly path: string
  readonly present: boolean
  readonly status: ProjectSurfaceStatus
}

export interface ProjectSurfacesReport {
  readonly agentFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly editorFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repositoryFiles: ReadonlyArray<ProjectSurfaceReport>
}

export interface ProjectSurfacesDoctorParams {
  readonly cwd: string
  readonly repos?: ReadonlyArray<VendoredRepo>
}

interface SurfaceSpec {
  readonly absentMessage?: string
  readonly kind: ProjectSurfaceKind
  readonly name: string
  readonly path: string
  readonly detector?: (content: string) => Pick<ProjectSurfaceReport, "message" | "status">
}

interface DetectSurfaceParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly spec: SurfaceSpec
}

const markdownAgentSpecs: ReadonlyArray<SurfaceSpec> = AGENT_DOCS.map((name) => ({
  kind: "agent" as const,
  name,
  path: name,
  detector: (content) =>
    content.includes(SECTION_BEGIN) && content.includes(SECTION_END)
      ? {
          message: "managed vendor section present",
          status: "managed" as const
        }
      : {
          message: "present without managed vendor section",
          status: "present" as const
        }
}))

const agentSpecs: ReadonlyArray<SurfaceSpec> = [
  ...markdownAgentSpecs,
  {
    kind: "agent",
    name: "GEMINI.md",
    path: "GEMINI.md"
  },
  {
    kind: "agent",
    name: "Cursor rules",
    path: ".cursor/rules"
  },
  {
    kind: "agent",
    name: ".cursorrules",
    path: ".cursorrules"
  },
  {
    kind: "agent",
    name: "Copilot instructions",
    path: ".github/copilot-instructions.md"
  },
  {
    kind: "agent",
    name: "Windsurf rules",
    path: ".windsurfrules"
  }
]

const vscodeDetector = (content: string): Pick<ProjectSurfaceReport, "message" | "status"> => {
  const merged = mergeVscodeSettingsText(content)
  switch (merged._tag) {
    case "Invalid":
      return {
        message: `invalid settings: ${merged.message}`,
        status: "invalid"
      }
    case "Unchanged":
      return {
        message: "vendor settings present",
        status: "configured"
      }
    case "Updated":
      return {
        message: "present; refresh can update vendor settings",
        status: "present"
      }
  }
}

const mergeDetector =
  (merge: (content: string) => ReturnType<typeof mergeVscodeSettingsText>, invalidLabel: string) =>
  (content: string): Pick<ProjectSurfaceReport, "message" | "status"> => {
    const merged = merge(content)
    switch (merged._tag) {
      case "Invalid":
        return {
          message: `invalid ${invalidLabel}: ${merged.message}`,
          status: "invalid"
        }
      case "Unchanged":
        return {
          message: "vendor settings present",
          status: "configured"
        }
      case "Updated":
        return {
          message: "present; refresh can update vendor settings",
          status: "present"
        }
    }
  }

const intellijScopeDetector = mergeDetector(mergeIntellijVendorScopeText, "scope")
const intellijFileColorsDetector = mergeDetector(mergeIntellijFileColorsText, "file colors")

const gitattributesDetector =
  (
    repos: ReadonlyArray<VendoredRepo> | undefined
  ): ((content: string) => Pick<ProjectSurfaceReport, "message" | "status">) =>
  (content: string) => {
    const hasManagedSection =
      content.includes(GITATTRIBUTES_VENDOR_BEGIN) && content.includes(GITATTRIBUTES_VENDOR_END)
    if (repos === undefined) {
      return hasManagedSection
        ? {
            message: "GitHub diff hiding configured for subtree vendor paths",
            status: "configured"
          }
        : {
            message: "present; refresh can add GitHub diff hiding",
            status: "present"
          }
    }

    const prefixes = repos.filter((repo) => repo.strategy === "subtree").map((repo) => repo.prefix)
    return mergeGitattributesText({ content, prefixes }) === content
      ? {
          message: "GitHub diff hiding configured for subtree vendor paths",
          status: "configured"
        }
      : {
          message: "present; refresh can update GitHub diff hiding",
          status: "present"
        }
  }

const editorSpecs: ReadonlyArray<SurfaceSpec> = [
  {
    kind: "editor",
    name: "VS Code settings",
    path: ".vscode/settings.json",
    detector: vscodeDetector
  },
  {
    kind: "editor",
    name: "Zed settings",
    path: ".zed/settings.json"
  },
  {
    kind: "editor",
    name: "JetBrains project",
    path: ".idea"
  },
  {
    kind: "editor",
    name: "JetBrains vendor scope",
    path: ".idea/scopes/Vendor.xml",
    detector: intellijScopeDetector
  },
  {
    kind: "editor",
    name: "JetBrains file colors",
    path: ".idea/fileColors.xml",
    detector: intellijFileColorsDetector
  },
  {
    kind: "editor",
    name: "Vim config",
    path: ".vimrc"
  },
  {
    kind: "editor",
    name: "Coc settings",
    path: ".vim/coc-settings.json"
  }
]

const repositorySpecs = (
  repos: ReadonlyArray<VendoredRepo> | undefined
): ReadonlyArray<SurfaceSpec> => {
  const subtreeCount = repos?.filter((repo) => repo.strategy === "subtree").length ?? undefined
  return [
    {
      absentMessage:
        subtreeCount === 0
          ? "not needed; no subtree vendor paths"
          : "refresh can create GitHub diff hiding for subtree vendor paths",
      kind: "repository",
      name: ".gitattributes",
      path: ".gitattributes",
      detector: gitattributesDetector(repos)
    }
  ]
}

const absentReport = (absolutePath: string, spec: SurfaceSpec): ProjectSurfaceReport => ({
  _tag: "ProjectSurfaceReport",
  kind: spec.kind,
  message: spec.absentMessage ?? "not found",
  name: spec.name,
  path: absolutePath,
  present: false,
  status: "absent"
})

const presentReport = (
  absolutePath: string,
  spec: SurfaceSpec,
  content: string
): ProjectSurfaceReport => {
  const detected = spec.detector?.(content) ?? {
    message: "present",
    status: "present" as const
  }
  return {
    _tag: "ProjectSurfaceReport",
    kind: spec.kind,
    message: detected.message,
    name: spec.name,
    path: absolutePath,
    present: true,
    status: detected.status
  }
}

const detectSurface = ({ cwd, fs, path, spec }: DetectSurfaceParams) =>
  Effect.gen(function* () {
    const target = path.resolve(cwd, spec.path)
    if (!(yield* fs.exists(target))) return absentReport(target, spec)
    const content = spec.detector
      ? yield* fs.readFileString(target).pipe(Effect.orElseSucceed(() => ""))
      : ""
    return presentReport(target, spec, content)
  })

const detectSurfacesWith = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  { cwd, repos }: ProjectSurfacesDoctorParams
) =>
  Effect.gen(function* () {
    const [agentFiles, editorFiles, repositoryFiles] = yield* Effect.all(
      [
        Effect.forEach(agentSpecs, (spec) => detectSurface({ cwd, fs, path, spec })),
        Effect.forEach(editorSpecs, (spec) => detectSurface({ cwd, fs, path, spec })),
        Effect.forEach(repositorySpecs(repos), (spec) => detectSurface({ cwd, fs, path, spec }))
      ],
      { concurrency: 3 }
    )
    return { agentFiles, editorFiles, repositoryFiles } satisfies ProjectSurfacesReport
  })

export class ProjectSurfaces extends Effect.Service<ProjectSurfaces>()(
  "vendor-subtree/ProjectSurfaces",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return {
        doctor: (params: ProjectSurfacesDoctorParams) => detectSurfacesWith(fs, path, params)
      }
    })
  }
) {}
