import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://vendor-subtree.dev",
  integrations: [
    starlight({
      title: "vendor-subtree",
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
            { label: "Tooling Integration", slug: "docs/tooling" },
            { label: "Doctor", slug: "docs/doctor" }
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
