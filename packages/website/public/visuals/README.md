# Visuals

Brand image assets consumed by the website. Each file referenced below is wired into the site already — drop the rendered PNG in this directory under the exact filename and it goes live.

Source prompts (cookbook-style, with full art direction) live in [`docs/internal/branding/image-prompts.md`](../../../../docs/internal/branding/image-prompts.md). Regenerate from there; do not edit these PNGs by hand.

| File                          | Dimensions  | Consumed by                                                              |
| ----------------------------- | ----------- | ------------------------------------------------------------------------ |
| `hero-graft.png`              | 2400 × 1350 | `.hero` background in `src/styles/landing.css`                           |
| `og-default.png`              | 1200 × 630  | `og:image` / `twitter:image` in marketing layout and Starlight head      |
| `og-default@2x.png`           | 2400 × 1260 | Retina OG preview (optional)                                             |
| `strategy-subtree.png`        | 1200 × 1200 | "Subtree by default" landing card                                        |
| `strategy-submodule.png`      | 1200 × 1200 | "Submodule when needed" landing card                                     |
| `strategy-clone-ignore.png`   | 1200 × 1200 | "Clone and ignore" landing card                                          |
| `section-getting-started.png` | 1000 × 1000 | Banner on `docs/getting-started.md`                                      |
| `section-doctor.png`          | 1000 × 1000 | Banner on `docs/doctor.md`                                               |
| `section-version-sync.png`    | 1000 × 1000 | Banner on `docs/version-sync.md`                                         |
| `section-tooling.png`         | 1000 × 1000 | Banner on `docs/tooling/index.mdx`                                       |
| `section-cli-reference.png`   | 1000 × 1000 | Banner on `docs/cli-reference.md`                                        |
| `texture-blueprint.png`       | 2048 × 2048 | Tiled subtle background on marketing pages (`.landing-shell`)            |
| `logomark.png`                | 1024 × 1024 | Optional refined raster mark for social avatars                          |
| `source-map.svg`              | (existing)  | Legacy hero secondary illustration, layered behind `hero-graft.png`      |
