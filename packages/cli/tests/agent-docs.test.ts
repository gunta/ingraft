import { describe, expect, test } from "bun:test"

import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import { injectSection, renderVendorSection } from "../src/project/agent-docs.ts"

describe("agent docs", () => {
  test("injects a managed section without replacing surrounding content", () => {
    const section = renderVendorSection({
      repos: []
    })

    expect(injectSection({ content: "# Project\n", section })).toContain("# Project\n\n")
    expect(injectSection({ content: "# Project\n", section })).toContain(
      "<!-- vendor-subtree:begin -->"
    )
  })

  test("replaces an existing managed section", () => {
    const first = [
      "# Project",
      "",
      "<!-- vendor-subtree:begin -->",
      "old",
      "<!-- vendor-subtree:end -->",
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
          strategy: "subtree",
          filter: EMPTY_VENDOR_FILTER,
          sha: "sha",
          date: "date"
        }
      ]
    })

    const result = injectSection({ content: first, section: next })

    expect(result).not.toContain("old")
    expect(result).toContain("bun tools/vendor.ts list")
    expect(renderVendorSection({ repos: [] })).toContain("bunx vendor-subtree@latest list")
    expect(result).toContain("vendor/effect")
  })
})
