import alchemy from "alchemy"
import { Website } from "alchemy/cloudflare"

const app = await alchemy("ingraft-website", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up"
})

const site = await Website("ingraft-website", {
  build: "bun run build",
  assets: {
    directory: "./dist",
    html_handling: "auto-trailing-slash",
    not_found_handling: "404-page"
  },
  domains: ["ingraft.dev"]
})

console.log({ url: site.url })

await app.finalize()
