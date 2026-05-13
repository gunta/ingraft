import { NodeContext } from "@effect/platform-node"
import { Layer } from "effect"

import { RepositoryAliases } from "../aliases/service.ts"
import { IntellijSettings } from "../editors/intellij.ts"
import { EditorSettings } from "../editors/service.ts"
import { VscodeSettings } from "../editors/vscode.ts"
import { ZedSettings } from "../editors/zed.ts"
import { PackageVersionSync } from "../package-sync/service.ts"
import { ProjectFiles } from "../project/service.ts"
import { ProjectSurfaces } from "../project/surfaces.ts"
import { CloudflareArtifacts } from "../services/cloudflare-artifacts.ts"
import { GitHubCli } from "../services/gh.ts"
import { GitMetadata } from "../services/git-metadata.ts"
import { Git } from "../services/git.ts"
import { GitLabCli } from "../services/glab.ts"
import { Jujutsu } from "../services/jujutsu.ts"
import { Prompts } from "../services/prompts.tsx"
import { RepositoryHosts } from "../services/repository-hosts.ts"
import { VendorNotes } from "../services/vendor-notes.ts"
import { PrettierIgnore } from "../tool-ignores/formatters/index.ts"
import {
  CargoIgnore,
  MypyIgnore,
  PyrightIgnore,
  TypeScriptIgnore,
  ZigIgnore
} from "../tool-ignores/language-analyzers/index.ts"
import {
  BiomeIgnore,
  CspellIgnore,
  EslintIgnore,
  GolangciLintIgnore,
  MarkdownlintIgnore,
  OxlintIgnore,
  RuffIgnore,
  StylelintIgnore
} from "../tool-ignores/linters/index.ts"
import { MonorepoTools } from "../tool-ignores/monorepo.ts"
import { ToolIgnores } from "../tool-ignores/service.ts"
import { RuntimeConfig } from "./runtime.ts"

const PlatformLive = Layer.mergeAll(NodeContext.layer, RuntimeConfig.Default)
const RepositoryAliasesLive = RepositoryAliases.Default.pipe(Layer.provide(PlatformLive))
const CloudflareArtifactsLive = CloudflareArtifacts.Default
const GitLive = Git.Default.pipe(Layer.provide(NodeContext.layer))
const GitMetadataLive = GitMetadata.Default
const GitHubCliLive = GitHubCli.Default.pipe(Layer.provide(NodeContext.layer))
const GitLabCliLive = GitLabCli.Default.pipe(Layer.provide(NodeContext.layer))
const JujutsuLive = Jujutsu.Default.pipe(Layer.provide(PlatformLive))
const VendorNotesLive = VendorNotes.Default
const IntellijSettingsLive = IntellijSettings.Default.pipe(Layer.provide(PlatformLive))
const VscodeSettingsLive = VscodeSettings.Default.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, GitMetadataLive))
)
const ZedSettingsLive = ZedSettings.Default.pipe(Layer.provide(PlatformLive))
const ToolIgnoreProvidersLive = Layer.mergeAll(
  BiomeIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  CspellIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  EslintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  GolangciLintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  MarkdownlintIgnore.Default.pipe(Layer.provide(NodeContext.layer)),
  MonorepoTools.Default.pipe(Layer.provide(NodeContext.layer)),
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
const ToolIgnoresLive = ToolIgnores.Default.pipe(Layer.provide(ToolIgnoreProvidersLive))
const EditorToolsLive = Layer.mergeAll(IntellijSettingsLive, VscodeSettingsLive, ZedSettingsLive)
const EditorSettingsLive = EditorSettings.Default.pipe(Layer.provide(EditorToolsLive))
const ProjectFilesLive = ProjectFiles.Default.pipe(
  Layer.provide(
    Layer.mergeAll(PlatformLive, GitLive, EditorSettingsLive, ToolIgnoresLive, VendorNotesLive)
  )
)
const ProjectSurfacesLive = ProjectSurfaces.Default.pipe(Layer.provide(PlatformLive))
const RepositoryHostsLive = RepositoryHosts.Default.pipe(
  Layer.provide(Layer.mergeAll(GitHubCliLive, GitLabCliLive))
)
const PackageVersionSyncLive = PackageVersionSync.Default.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, GitLive))
)
const PromptsLive = Prompts.Default

export const LiveLayer = Layer.mergeAll(
  PlatformLive,
  RepositoryAliasesLive,
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
