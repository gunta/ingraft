import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://ingraft.dev",
  integrations: [
    starlight({
      title: "ingraft",
      description:
        "Vendor upstream source into agent-ready repositories without letting vendor code take over the project.",
      favicon: "/favicon.svg",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true
      },
      customCss: ["./src/styles/site.css"],
      lastUpdated: true,
      pagefind: false,
      head: [
        { tag: "meta", attrs: { property: "og:type", content: "website" } },
        {
          tag: "meta",
          attrs: { property: "og:image", content: "https://ingraft.dev/visuals/og-default.png" }
        },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: "https://ingraft.dev/visuals/og-default.png" }
        }
      ],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Overview", slug: "docs" },
            { label: "Getting Started", slug: "docs/getting-started" },
            { label: "Strategies", slug: "docs/strategies" }
          ]
        },
        {
          label: "Automation",
          items: [
            { label: "Synced Versions", slug: "docs/version-sync" },
            { label: "Doctor", slug: "docs/doctor" }
          ]
        },
        {
          label: "Tool Integrations",
          items: [
            { label: "Overview", slug: "docs/tooling" },
            {
              label: "Editors",
              items: [
                { label: "VS Code", slug: "docs/tooling/editors/vscode" },
                { label: "Zed", slug: "docs/tooling/editors/zed" },
                { label: "JetBrains IDEs", slug: "docs/tooling/editors/jetbrains" },
                {
                  label: "Vim and Neovim",
                  slug: "docs/tooling/editors/vim-neovim"
                }
              ]
            },
            {
              label: "Linters",
              items: [
                { label: "Biome", slug: "docs/tooling/linters/biome" },
                { label: "CSpell", slug: "docs/tooling/linters/cspell" },
                { label: "ESLint", slug: "docs/tooling/linters/eslint" },
                {
                  label: "golangci-lint",
                  slug: "docs/tooling/linters/golangci-lint"
                },
                { label: "markdownlint", slug: "docs/tooling/linters/markdownlint" },
                { label: "Oxlint", slug: "docs/tooling/linters/oxlint" },
                { label: "Ruff", slug: "docs/tooling/linters/ruff" },
                { label: "Stylelint", slug: "docs/tooling/linters/stylelint" }
              ]
            },
            {
              label: "Formatters",
              items: [{ label: "Prettier", slug: "docs/tooling/formatters/prettier" }]
            },
            {
              label: "Language Analyzers",
              items: [
                { label: "Cargo", slug: "docs/tooling/language-analyzers/cargo" },
                { label: "mypy", slug: "docs/tooling/language-analyzers/mypy" },
                { label: "Pyright", slug: "docs/tooling/language-analyzers/pyright" },
                {
                  label: "TypeScript",
                  slug: "docs/tooling/language-analyzers/typescript"
                },
                { label: "Zig", slug: "docs/tooling/language-analyzers/zig" }
              ]
            },
            {
              label: "Package Managers",
              items: [
                { label: "pnpm workspaces", slug: "docs/tooling/package-managers/pnpm" },
                {
                  label: "package.json workspaces",
                  slug: "docs/tooling/package-managers/package-workspaces"
                },
                { label: "Rush", slug: "docs/tooling/package-managers/rush" }
              ]
            },
            {
              label: "Task Runners",
              items: [
                { label: "Turborepo", slug: "docs/tooling/task-runners/turbo" },
                { label: "Nx", slug: "docs/tooling/task-runners/nx" },
                { label: "Moonrepo", slug: "docs/tooling/task-runners/moon" },
                { label: "Lerna", slug: "docs/tooling/task-runners/lerna" },
                { label: "Lage", slug: "docs/tooling/task-runners/lage" }
              ]
            },
            {
              label: "Build Systems",
              items: [
                { label: "Bazel", slug: "docs/tooling/build-systems/bazel" },
                { label: "Buck2", slug: "docs/tooling/build-systems/buck2" },
                { label: "Gradle", slug: "docs/tooling/build-systems/gradle" },
                { label: "Maven", slug: "docs/tooling/build-systems/maven" },
                { label: "Pants", slug: "docs/tooling/build-systems/pants" },
                { label: "Please", slug: "docs/tooling/build-systems/please" }
              ]
            }
          ]
        },
        {
          label: "Reference",
          items: [
            { label: "CLI Reference", slug: "docs/cli-reference" },
            { label: "Editable Vendors", slug: "docs/editable-vendors" },
            {
              label: "Dangerous Removal",
              slug: "docs/dangerous-removal"
            }
          ]
        }
      ]
    })
  ]
})
