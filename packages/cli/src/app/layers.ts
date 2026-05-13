import { NodeContext } from "@effect/platform-node"
import { Layer } from "effect"
import { EditorSettings } from "../editors/service.ts"
import { IntellijSettings } from "../editors/intellij.ts"
import { VscodeSettings } from "../editors/vscode.ts"
import { ZedSettings } from "../editors/zed.ts"
import { PackageVersionSync } from "../package-sync/service.ts"
import { ProjectFiles } from "../project/service.ts"
import { ProjectSurfaces } from "../project/surfaces.ts"
import { CloudflareArtifacts } from "../services/cloudflare-artifacts.ts"
import { Git } from "../services/git.ts"
import { GitMetadata } from "../services/git-metadata.ts"
import { GitHubCli } from "../services/gh.ts"
import { GitLabCli } from "../services/glab.ts"
import { Jujutsu } from "../services/jujutsu.ts"
import { RepositoryHosts } from "../services/repository-hosts.ts"
import { Prompts } from "../services/prompts.ts"
import { VendorNotes } from "../services/vendor-notes.ts"
import { BiomeIgnore } from "../tool-ignores/biome.ts"
import { CargoIgnore } from "../tool-ignores/cargo.ts"
import { CspellIgnore } from "../tool-ignores/cspell.ts"
import { EslintIgnore } from "../tool-ignores/eslint.ts"
import { GolangciLintIgnore } from "../tool-ignores/golangci-lint.ts"
import { MarkdownlintIgnore } from "../tool-ignores/markdownlint.ts"
import { MypyIgnore } from "../tool-ignores/mypy.ts"
import { OxlintIgnore } from "../tool-ignores/oxlint.ts"
import { PrettierIgnore } from "../tool-ignores/prettier.ts"
import { PyrightIgnore } from "../tool-ignores/pyright.ts"
import { RuffIgnore } from "../tool-ignores/ruff.ts"
import { ToolIgnores } from "../tool-ignores/service.ts"
import { StylelintIgnore } from "../tool-ignores/stylelint.ts"
import { TypeScriptIgnore } from "../tool-ignores/typescript.ts"
import { ZigIgnore } from "../tool-ignores/zig.ts"
import { RuntimeConfig } from "./runtime.ts"

const PlatformLive = Layer.mergeAll(NodeContext.layer, RuntimeConfig.Default)
const CloudflareArtifactsLive = CloudflareArtifacts.Default
const GitLive = Git.Default.pipe(Layer.provide(NodeContext.layer))
const GitMetadataLive = GitMetadata.Default
const GitHubCliLive = GitHubCli.Default.pipe(Layer.provide(NodeContext.layer))
const GitLabCliLive = GitLabCli.Default.pipe(Layer.provide(NodeContext.layer))
const JujutsuLive = Jujutsu.Default.pipe(Layer.provide(PlatformLive))
const VendorNotesLive = VendorNotes.Default
const IntellijSettingsLive = IntellijSettings.Default.pipe(
  Layer.provide(PlatformLive)
)
const VscodeSettingsLive = VscodeSettings.Default.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, GitLive))
)
const ZedSettingsLive = ZedSettings.Default.pipe(Layer.provide(PlatformLive))
const ToolIgnoreProvidersLive = Layer.mergeAll(
  BiomeIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  CspellIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  EslintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  GolangciLintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  MarkdownlintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  MypyIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  OxlintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  PrettierIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  PyrightIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  RuffIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  StylelintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  TypeScriptIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  CargoIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  ZigIgnore.Default.pipe(Layer.provide(NodeContext.layer))
)
const ToolIgnoresLive = ToolIgnores.Default.pipe(
  Layer.provide(ToolIgnoreProvidersLive)
)
const EditorToolsLive = Layer.mergeAll(
  IntellijSettingsLive,
  VscodeSettingsLive,
  ZedSettingsLive
)
const EditorSettingsLive = EditorSettings.Default.pipe(
  Layer.provide(EditorToolsLive)
)
const ProjectFilesLive = ProjectFiles.Default.pipe(
  Layer.provide(
    Layer.mergeAll(
      PlatformLive,
      GitLive,
      EditorSettingsLive,
      ToolIgnoresLive,
      VendorNotesLive
    )
  )
)
const ProjectSurfacesLive = ProjectSurfaces.Default.pipe(
  Layer.provide(PlatformLive)
)
const RepositoryHostsLive = RepositoryHosts.Default.pipe(
  Layer.provide(Layer.mergeAll(GitHubCliLive, GitLabCliLive))
)
const PackageVersionSyncLive = PackageVersionSync.Default.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, GitLive))
)
const PromptsLive = Prompts.Default

export const LiveLayer = Layer.mergeAll(
  PlatformLive,
  CloudflareArtifactsLive,
  GitLive,
  GitMetadataLive,
  JujutsuLive,
  EditorSettingsLive,
  ProjectFilesLive,
  ProjectSurfacesLive,
  ToolIgnoresLive,
  RepositoryHostsLive,
  VendorNotesLive,
  PackageVersionSyncLive,
  PromptsLive
)
