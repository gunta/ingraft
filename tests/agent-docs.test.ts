import { describe, expect, test } from "bun:test"
import { injectSection, renderVendorSection } from "../src/agent-docs.ts"

describe("agent docs", () => {
  test("injects a managed section without replacing surrounding content", () => {
    const section = renderVendorSection({
      scriptRel: "scripts/vendor.ts",
      repos: []
    })

    expect(injectSection("# Project\n", section)).toContain("# Project\n\n")
    expect(injectSection("# Project\n", section)).toContain(
      "<!-- vendor-subtree-skill:begin -->"
    )
  })

  test("replaces an existing managed section", () => {
    const first = [
      "# Project",
      "",
      "<!-- vendor-subtree-skill:begin -->",
      "old",
      "<!-- vendor-subtree-skill:end -->",
      ""
    ].join("\n")
    const next = renderVendorSection({
      scriptRel: "tools/vendor.ts",
      repos: [
        {
          name: "effect",
          prefix: "vendor/effect",
          url: "https://github.com/Effect-TS/effect.git",
          ref: "main",
          sha: "sha",
          date: "date"
        }
      ]
    })

    const result = injectSection(first, next)

    expect(result).not.toContain("old")
    expect(result).toContain("bun tools/vendor.ts list")
    expect(result).toContain("vendor/effect")
  })
})
