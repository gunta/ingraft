export interface ToolIntegrationCategory {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly description: string
}

export interface ToolIntegration {
  readonly id: string
  readonly name: string
  readonly categoryId: string
  readonly logoSlug?: string
  readonly initials: string
  readonly accent: string
  readonly summary: string
  readonly detects: string
  readonly writes: string
  readonly keepsVisible: string
  readonly useCase: string
  readonly docsUrl?: string
}

export const toolIntegrationCategories = [
  {
    id: "editors",
    slug: "editors",
    title: "Editors",
    description: "Workspace settings that reduce explorer, watcher, and file-color noise."
  },
  {
    id: "linters",
    slug: "linters",
    title: "Linters",
    description: "Analysis tools that should avoid spending diagnostics on vendored source."
  },
  {
    id: "formatters",
    slug: "formatters",
    title: "Formatters",
    description: "Formatting tools that should leave upstream snapshots untouched."
  },
  {
    id: "language-analyzers",
    slug: "language-analyzers",
    title: "Language Analyzers",
    description: "Compilers, type checkers, and language-specific project surfaces."
  },
  {
    id: "package-managers",
    slug: "package-managers",
    title: "Package Managers",
    description: "Workspace package discovery rules for JavaScript and TypeScript monorepos."
  },
  {
    id: "task-runners",
    slug: "task-runners",
    title: "Task Runners",
    description: "Monorepo task hashing and pipeline runners."
  },
  {
    id: "build-systems",
    slug: "build-systems",
    title: "Build Systems",
    description: "Cross-language build systems that scan or index the repository root."
  }
] as const satisfies ReadonlyArray<ToolIntegrationCategory>

export const toolIntegrations = [
  {
    id: "vscode",
    name: "VS Code",
    categoryId: "editors",
    logoSlug: "visual-studio-code",
    initials: "VS",
    accent: "#007acc",
    summary: "Keeps the vendor folder quiet in VS Code without removing it from the project.",
    detects: ".vscode/settings.json.",
    writes:
      "files.exclude, files.watcherExclude, search.exclude, Material Icon Theme folder association, and JavaScript or TypeScript auto-import exclude patterns when those languages are detected.",
    keepsVisible:
      "The files remain on disk and available to agents, TypeScript, and normal git operations.",
    useCase:
      "Use this when VS Code is the main workspace editor and vendored code should not dominate search, file watching, or auto-import suggestions.",
    docsUrl: "https://code.visualstudio.com/docs"
  },
  {
    id: "zed",
    name: "Zed",
    categoryId: "editors",
    logoSlug: "zed",
    initials: "ZD",
    accent: "#084ccf",
    summary: "Detects Zed settings while intentionally avoiding scan exclusions.",
    detects: ".zed/settings.json.",
    writes: "Nothing today. Zed vendor source stays visible to language servers.",
    keepsVisible:
      "Zed integration is report-only because scan exclusions can hide useful source context.",
    useCase:
      "Use this to confirm Zed is present in doctor output without changing how Zed indexes the repo.",
    docsUrl: "https://zed.dev/docs"
  },
  {
    id: "jetbrains",
    name: "JetBrains IDEs",
    categoryId: "editors",
    logoSlug: "jetbrains",
    initials: "JB",
    accent: "#ff318c",
    summary:
      "Adds a shared vendor scope and file color for IntelliJ, WebStorm, PyCharm, and other JetBrains IDEs.",
    detects: ".idea, .idea/scopes/Vendor.xml, and .idea/fileColors.xml.",
    writes: ".idea/scopes/Vendor.xml and .idea/fileColors.xml through XML parsing.",
    keepsVisible:
      "The scope marks vendor files as recognizable project material without excluding them from the IDE.",
    useCase:
      "Use this when JetBrains users need a visual boundary around vendored source without breaking navigation.",
    docsUrl: "https://www.jetbrains.com/help/idea/getting-started.html"
  },
  {
    id: "vim-neovim",
    name: "Vim and Neovim",
    categoryId: "editors",
    logoSlug: "neovim",
    initials: "NV",
    accent: "#57a143",
    summary:
      "Reports Vim and Coc settings so the doctor can show editor surfaces in terminal-heavy projects.",
    detects: ".vimrc and .vim/coc-settings.json.",
    writes: "Nothing today.",
    keepsVisible:
      "Vendor source stays visible to terminal workflows and language tooling unless the user configures their editor separately.",
    useCase:
      "Use this when the project is mostly edited from Vim, Neovim, or Coc and you want doctor visibility.",
    docsUrl: "https://neovim.io/doc/"
  },
  {
    id: "biome",
    name: "Biome",
    categoryId: "linters",
    logoSlug: "biome",
    initials: "BI",
    accent: "#60a5fa",
    summary:
      "Adds a vendor exclusion to Biome file includes while preserving existing JSONC comments.",
    detects: "biome.json, biome.jsonc, or a @biomejs/biome dependency.",
    writes: "files.includes with !vendor/** when a Biome config file exists.",
    keepsVisible: "Only Biome's lint and format scan is narrowed; source remains readable.",
    useCase:
      "Use this when Biome should lint first-party code but ignore committed upstream snapshots.",
    docsUrl: "https://biomejs.dev/reference/configuration/"
  },
  {
    id: "cspell",
    name: "CSpell",
    categoryId: "linters",
    initials: "CS",
    accent: "#7c3aed",
    summary: "Prevents spell-check diagnostics from flooding vendored files.",
    detects: "cspell.json, .cspell.json, cspell.config.* files, or a cspell dependency.",
    writes: "ignorePaths entries for vendor/** when a CSpell config is present.",
    keepsVisible: "Spell checking is narrowed without changing project structure.",
    useCase:
      "Use this when upstream comments, changelogs, fixtures, or generated files create noisy spelling results.",
    docsUrl: "https://cspell.org/docs/Configuration"
  },
  {
    id: "eslint",
    name: "ESLint",
    categoryId: "linters",
    logoSlug: "eslint",
    initials: "ES",
    accent: "#4b32c3",
    summary: "Keeps ESLint focused on first-party JavaScript and TypeScript source.",
    detects: "eslint.config.*, .eslintrc* files, .eslintignore, or an eslint dependency.",
    writes: "ignorePatterns in JSON configs or a managed .eslintignore section for legacy setups.",
    keepsVisible: "Vendor source stays available to editors and agents while ESLint skips it.",
    useCase: "Use this when vendored packages introduce unrelated lint rules or parser settings.",
    docsUrl: "https://eslint.org/docs/latest/use/configure/ignore"
  },
  {
    id: "golangci-lint",
    name: "golangci-lint",
    categoryId: "linters",
    logoSlug: "go",
    initials: "GO",
    accent: "#00add8",
    summary: "Reports Go linter configuration and vendor visibility.",
    detects: ".golangci.yml, .golangci.yaml, .golangci.toml, or .golangci.json.",
    writes: "Nothing today; doctor reports whether vendor is already ignored.",
    keepsVisible:
      "Go source remains present for agents and tooling unless the existing config excludes it.",
    useCase:
      "Use this when Go projects vendor external source for context but lint only local modules.",
    docsUrl: "https://golangci-lint.run/usage/configuration/"
  },
  {
    id: "markdownlint",
    name: "markdownlint",
    categoryId: "linters",
    logoSlug: "markdown",
    initials: "MD",
    accent: "#111827",
    summary: "Adds a managed markdownlint ignore section for vendored docs.",
    detects: ".markdownlintignore, .markdownlint.*, or a markdownlint dependency.",
    writes: ".markdownlintignore with a managed vendor/ entry.",
    keepsVisible: "Vendored Markdown remains readable but stops generating style diagnostics.",
    useCase:
      "Use this when upstream README files and generated docs should not control local doc style.",
    docsUrl: "https://github.com/DavidAnson/markdownlint"
  },
  {
    id: "oxlint",
    name: "Oxlint",
    categoryId: "linters",
    logoSlug: "oxc",
    initials: "OX",
    accent: "#f59e0b",
    summary: "Adds vendor ignore patterns to Oxlint configuration.",
    detects: ".oxlintrc.json, oxlint.json, or an oxlint dependency.",
    writes: "ignorePatterns with vendor/** when an Oxlint JSON config exists.",
    keepsVisible: "Only Oxlint scanning is narrowed.",
    useCase: "Use this when Oxc-powered linting should stay fast and project-local.",
    docsUrl: "https://oxc.rs/docs/guide/usage/linter.html"
  },
  {
    id: "ruff",
    name: "Ruff",
    categoryId: "linters",
    logoSlug: "ruff",
    initials: "RF",
    accent: "#d7ff64",
    summary: "Detects Ruff configuration and reports whether vendor is excluded.",
    detects: "ruff.toml, .ruff.toml, or pyproject.toml with a [tool.ruff] section.",
    writes: "Nothing today; TOML state is reported but not rewritten automatically.",
    keepsVisible:
      "Python vendored source stays available while doctor explains the current Ruff state.",
    useCase: "Use this when Python linting should avoid upstream snapshots.",
    docsUrl: "https://docs.astral.sh/ruff/configuration/"
  },
  {
    id: "stylelint",
    name: "Stylelint",
    categoryId: "linters",
    logoSlug: "stylelint",
    initials: "SL",
    accent: "#263238",
    summary: "Adds vendor ignore files to Stylelint JSON-style configs.",
    detects:
      ".stylelintrc, .stylelintrc.json, stylelint.config.* files, or a stylelint dependency.",
    writes: "ignoreFiles entries with vendor/** for supported JSON configs.",
    keepsVisible:
      "CSS and design assets remain in the repo but stop producing local style diagnostics.",
    useCase: "Use this when vendored CSS should be inspected by agents but not restyled locally.",
    docsUrl: "https://stylelint.io/user-guide/configure/"
  },
  {
    id: "prettier",
    name: "Prettier",
    categoryId: "formatters",
    logoSlug: "prettier",
    initials: "PR",
    accent: "#f7b93e",
    summary: "Adds a managed .prettierignore section for vendored source.",
    detects: ".prettierrc* files, prettier.config.* files, or a prettier dependency.",
    writes: ".prettierignore with a managed vendor/ entry.",
    keepsVisible:
      "Prettier skips upstream snapshots without hiding them from agents or language servers.",
    useCase: "Use this when committed vendor code should preserve upstream formatting.",
    docsUrl: "https://prettier.io/docs/ignore"
  },
  {
    id: "cargo",
    name: "Cargo",
    categoryId: "language-analyzers",
    logoSlug: "rust",
    initials: "RS",
    accent: "#ce412b",
    summary: "Detects Rust workspaces and reports vendor visibility.",
    detects: "Cargo.toml.",
    writes: "Nothing today.",
    keepsVisible: "Rust source stays present for code agents and normal Cargo behavior.",
    useCase:
      "Use this to see Rust project status in doctor output before choosing tool-specific ignores.",
    docsUrl: "https://doc.rust-lang.org/cargo/"
  },
  {
    id: "mypy",
    name: "mypy",
    categoryId: "language-analyzers",
    logoSlug: "mypy",
    initials: "MY",
    accent: "#2f6db3",
    summary: "Detects mypy configuration and reports vendor ignore status.",
    detects: "mypy.ini, .mypy.ini, setup.cfg, or pyproject.toml.",
    writes: "Nothing today.",
    keepsVisible: "Type-checking behavior is not changed until the user configures mypy.",
    useCase:
      "Use this when Python projects need visibility into whether vendored code enters mypy.",
    docsUrl: "https://mypy.readthedocs.io/en/stable/config_file.html"
  },
  {
    id: "pyright",
    name: "Pyright",
    categoryId: "language-analyzers",
    logoSlug: "python",
    initials: "PY",
    accent: "#3776ab",
    summary: "Adds vendor to Pyright excludes while preserving existing JSON settings.",
    detects: "pyrightconfig.json.",
    writes: "exclude entries containing vendor.",
    keepsVisible:
      "The source remains available for agents and editors outside Pyright's analysis set.",
    useCase: "Use this when Python vendor snapshots should not affect type-checking.",
    docsUrl: "https://microsoft.github.io/pyright/#/configuration"
  },
  {
    id: "typescript",
    name: "TypeScript",
    categoryId: "language-analyzers",
    logoSlug: "typescript",
    initials: "TS",
    accent: "#3178c6",
    summary:
      "Reports TypeScript and JavaScript config validity without hiding vendor from tsserver.",
    detects: "tsconfig.json, jsconfig.json, or a typescript dependency.",
    writes: "Nothing today.",
    keepsVisible:
      "Vendor source intentionally remains visible for LSP navigation; VS Code auto-import exclusions handle suggestion noise.",
    useCase:
      "Use this when vendored TypeScript should be navigable by agents and editors but not suggested for imports.",
    docsUrl: "https://www.typescriptlang.org/tsconfig/"
  },
  {
    id: "zig",
    name: "Zig",
    categoryId: "language-analyzers",
    logoSlug: "zig",
    initials: "ZG",
    accent: "#f7a41d",
    summary: "Detects Zig build files and reports vendor visibility.",
    detects: "build.zig or build.zig.zon.",
    writes: "Nothing today.",
    keepsVisible: "Zig source stays available for agents and build tooling.",
    useCase: "Use this to keep Zig projects represented in doctor output.",
    docsUrl: "https://ziglang.org/documentation/master/"
  },
  {
    id: "pnpm",
    name: "pnpm workspaces",
    categoryId: "package-managers",
    logoSlug: "pnpm",
    initials: "PN",
    accent: "#f69220",
    summary: "Excludes vendor from pnpm workspace package discovery.",
    detects: "pnpm-workspace.yaml.",
    writes: "packages entries with !vendor/** when a packages list already exists.",
    keepsVisible: "Only package discovery is narrowed; vendor source remains in the working tree.",
    useCase: "Use this when vendored packages should not become local workspace packages.",
    docsUrl: "https://pnpm.io/pnpm-workspace_yaml"
  },
  {
    id: "package-workspaces",
    name: "package.json workspaces",
    categoryId: "package-managers",
    logoSlug: "json",
    initials: "PJ",
    accent: "#5f6368",
    summary: "Reports root package.json workspaces that already exclude vendor.",
    detects: "package.json workspaces arrays or workspaces.packages.",
    writes: "Nothing today.",
    keepsVisible:
      "Vendor remains visible; the doctor reports whether workspace patterns already avoid it.",
    useCase: "Use this when npm, Yarn, Bun, or generic package.json workspaces are in play.",
    docsUrl: "https://docs.npmjs.com/cli/configuring-npm/package-json#workspaces"
  },
  {
    id: "rush",
    name: "Rush",
    categoryId: "package-managers",
    initials: "RU",
    accent: "#0078d4",
    summary: "Detects Rush monorepo configuration and reports vendor status.",
    detects: "rush.json.",
    writes: "Nothing today.",
    keepsVisible: "Rush configuration is reported without rewriting project inventory.",
    useCase:
      "Use this when a Rush repo may contain vendored packages outside its managed projects.",
    docsUrl: "https://rushjs.io/pages/maintainer/setup_new_repo/"
  },
  {
    id: "turbo",
    name: "Turborepo",
    categoryId: "task-runners",
    logoSlug: "turborepo",
    initials: "TB",
    accent: "#ef4444",
    summary: "Adds vendor exclusions to task inputs without dropping Turbo defaults.",
    detects: "turbo.json, turbo.jsonc, or a turbo dependency.",
    writes: "task input arrays with !$TURBO_ROOT$/vendor/**.",
    keepsVisible: "Task hashing ignores vendor while files remain available to the repo.",
    useCase: "Use this when vendor snapshots should not invalidate every Turbo task cache.",
    docsUrl: "https://turborepo.com/docs/reference/configuration"
  },
  {
    id: "nx",
    name: "Nx",
    categoryId: "task-runners",
    logoSlug: "nx",
    initials: "NX",
    accent: "#143055",
    summary: "Adds a vendor exclusion to Nx namedInputs.default.",
    detects: "nx.json or an nx dependency.",
    writes: "namedInputs.default with !{workspaceRoot}/vendor/**.",
    keepsVisible: "Nx hashing ignores vendor while source remains readable.",
    useCase: "Use this when upstream snapshots should not affect Nx cache keys.",
    docsUrl: "https://nx.dev/reference/nx-json"
  },
  {
    id: "moon",
    name: "Moonrepo",
    categoryId: "task-runners",
    logoSlug: "moonrepo",
    initials: "MR",
    accent: "#6d5dfc",
    summary: "Adds vendor to Moon's hasher ignore patterns.",
    detects: ".moon/workspace.yml or .moon/workspace.yaml.",
    writes: "hasher.ignorePatterns with vendor/**.",
    keepsVisible: "Moon hashing skips vendor without removing source from the workspace.",
    useCase: "Use this when Moon task hashes should react only to first-party files.",
    docsUrl: "https://moonrepo.dev/docs/config/workspace"
  },
  {
    id: "lerna",
    name: "Lerna",
    categoryId: "task-runners",
    logoSlug: "lerna",
    initials: "LR",
    accent: "#9333ea",
    summary: "Detects Lerna configuration and reports vendor status.",
    detects: "lerna.json.",
    writes: "Nothing today.",
    keepsVisible:
      "Vendor source stays available while the doctor reports whether the repo uses Lerna.",
    useCase: "Use this when legacy or modern Lerna workspaces coexist with vendored source.",
    docsUrl: "https://lerna.js.org/docs/api-reference/configuration"
  },
  {
    id: "lage",
    name: "Lage",
    categoryId: "task-runners",
    initials: "LA",
    accent: "#2563eb",
    summary: "Detects Lage configuration and reports vendor status.",
    detects: "lage.config.js, lage.config.ts, or a lage dependency.",
    writes: "Nothing today.",
    keepsVisible: "Lage configuration is reported without changing pipeline behavior.",
    useCase: "Use this when Lage powers a JavaScript monorepo and vendor should stay observable.",
    docsUrl: "https://microsoft.github.io/lage/docs"
  },
  {
    id: "bazel",
    name: "Bazel",
    categoryId: "build-systems",
    logoSlug: "bazel",
    initials: "BZ",
    accent: "#43a047",
    summary: "Creates or updates .bazelignore so Bazel skips vendor.",
    detects: "MODULE.bazel, WORKSPACE, WORKSPACE.bazel, .bazelrc, .bazelversion, or BUILD.bazel.",
    writes: ".bazelignore with a managed vendor entry.",
    keepsVisible: "Bazel ignores vendor for package loading; source remains present for agents.",
    useCase: "Use this when large vendored repos should not become Bazel packages.",
    docsUrl: "https://bazel.build/reference/be/workspace"
  },
  {
    id: "buck2",
    name: "Buck2",
    categoryId: "build-systems",
    initials: "B2",
    accent: "#0866ff",
    summary: "Detects Buck2 project files and reports vendor visibility.",
    detects: ".buckconfig, .buckroot, BUCK, or BUCK.v2.",
    writes: "Nothing today.",
    keepsVisible: "Buck source stays present and doctor reports whether vendor is already handled.",
    useCase: "Use this when Buck2 projects need vendor status in the doctor report.",
    docsUrl: "https://buck2.build/docs/"
  },
  {
    id: "gradle",
    name: "Gradle",
    categoryId: "build-systems",
    logoSlug: "gradle",
    initials: "GR",
    accent: "#02303a",
    summary: "Detects Gradle builds and reports vendor status.",
    detects: "settings.gradle, settings.gradle.kts, build.gradle, or build.gradle.kts.",
    writes: "Nothing today.",
    keepsVisible: "Gradle behavior is not changed; vendor status is visible in doctor output.",
    useCase: "Use this when JVM or Android repos include vendored source for agent context.",
    docsUrl: "https://docs.gradle.org/current/userguide/userguide.html"
  },
  {
    id: "maven",
    name: "Maven",
    categoryId: "build-systems",
    logoSlug: "apache-maven",
    initials: "MV",
    accent: "#c71a36",
    summary: "Detects Maven builds and reports vendor status.",
    detects: "pom.xml.",
    writes: "Nothing today.",
    keepsVisible: "Maven project files are left untouched.",
    useCase: "Use this when Java repos vendor external code but Maven should remain authoritative.",
    docsUrl: "https://maven.apache.org/guides/"
  },
  {
    id: "pants",
    name: "Pants",
    categoryId: "build-systems",
    initials: "PT",
    accent: "#5b6ee1",
    summary: "Detects Pants configuration and reports vendor status.",
    detects: "pants.toml or pants.ci.toml.",
    writes: "Nothing today.",
    keepsVisible: "Pants configuration is reported without rewriting options.",
    useCase: "Use this when Pants owns a mixed-language repo and vendor status should be visible.",
    docsUrl: "https://www.pantsbuild.org/stable/docs/using-pants/key-concepts/options"
  },
  {
    id: "please",
    name: "Please",
    categoryId: "build-systems",
    initials: "PL",
    accent: "#0f766e",
    summary: "Detects Please build files and reports vendor status.",
    detects: ".plzconfig, BUILD, or BUILD.plz.",
    writes: "Nothing today.",
    keepsVisible: "Please project files are left unchanged while doctor reports the surface.",
    useCase: "Use this when Please users need visibility into vendored source handling.",
    docsUrl: "https://please.build/"
  }
] as const satisfies ReadonlyArray<ToolIntegration>

export const toolIntegrationById = Object.fromEntries(
  toolIntegrations.map((tool) => [tool.id, tool])
) as Record<string, ToolIntegration>

export const toolIntegrationCategoryById = Object.fromEntries(
  toolIntegrationCategories.map((category) => [category.id, category])
) as Record<string, ToolIntegrationCategory>

export const toolsForCategory = (categoryId: string): ReadonlyArray<ToolIntegration> =>
  toolIntegrations.filter((tool) => tool.categoryId === categoryId)
