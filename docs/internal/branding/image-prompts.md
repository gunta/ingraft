# Image Prompts

Detailed, cookbook-style prompts for every brand image. Drop the rendered PNG into [`packages/website/public/visuals/`](../../../packages/website/public/visuals/) under the exact filename listed in each section — the website is already wired to consume them.

Prompts follow the structure recommended by the [OpenAI image-generation prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide): **Subject → Composition → Action → Setting → Style/Medium → Color → Lighting → Mood → Negative constraints**. Set the aspect ratio in the API call, not in the prompt.

## 0. Visual system (read first, applies to every image)

Hand this paragraph to the model as a leading "style preamble" before every individual prompt. It is what makes the set look like a _set_, not twelve unrelated illustrations.

> **Style preamble.** Two-color letterpress engraving on warm cream paper, with a single rust-orange accent. The aesthetic fuses three references: nineteenth-century botanical illustration in the manner of Ernst Haeckel's _Kunstformen der Natur_ and Pierre-Joseph Redouté's _Les Roses_ — fine ink line-work, parallel hatching, stippled shading; NASA Apollo-era technical drafting — measured callouts, isometric or orthographic projection, mechanical precision; and contemporary minimalist information design after Massimo Vignelli and Edward Tufte — generous negative space, plate-like composition, no decorative noise. Paper ground is uncoated cream **#f6f1e8** with a faint cold-press texture. All line-work is ink **#11110f** at 0.5–1.5 pt strokes, never pure black. A single accent — terracotta **#d85a3a** — is reserved exclusively for the _graft union_, the visual moment where scion meets rootstock. No gradients. No glow. No drop shadows. No chrome, glass, neon, or holographic effects. No glowing screens, no laptops, no hooded figures, no robots. No human faces or hands. No stock-illustration vector look. No emoji, no 3D render, no AI-art tropes. Letterforms (when present) are set in a humanist sans-serif at weight 500, sentence case, letter-tracked +20 units. Composition is centered and breathes. Aspect ratio of the canvas is specified per image. Imagine the frontispiece of a Penguin Classics edition crossed with an O'Reilly animal cover crossed with a SpaceX press-kit diagram.

---

## 1. Hero illustration — `hero-graft.png`

| Spec               | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Filename**       | `packages/website/public/visuals/hero-graft.png`      |
| **Dimensions**     | 2400 × 1350 (16:9)                                    |
| **Where it lives** | Background of `HeroSection.astro` on the landing page |
| **Format**         | PNG with transparency around the artwork edges        |

### Prompt

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A horticultural graft union shown in cross-section as a botanical-technical plate. On the left, the _rootstock_: a stout host trunk rising from below, its trunk drawn as a cluster of vertical strata that, on closer inspection, are tightly-stacked rows of monospaced source code rendered as parallel hatching — a tree whose grain is text. On the right, the _scion_: a slender upstream branch with three to five lobed leaves, drawn in the manner of an Audubon plate, its xylem visible as bundled fibers. The two meet at the center in a clean diagonal cleft graft, bound by three turns of fine raffia. **Composition.** Wide landscape plate, centered union, ample cream margins; the trunk extends below the bottom edge as if continuing into earth, the scion's top leaves brush the upper third. Eight delicate measurement callouts radiate from the union with hairlines and small serif labels (latin-binomial style, _not_ real words — invent plausible taxonomic strings such as "Cambium sutura", "Strata textūs", "Nodum vendoris"). **Style/medium.** Pen-and-ink engraving with fine crosshatching; line weights vary from 0.4 pt hairlines for shading to 1.2 pt for principal contours. **Color.** Cream **#f6f1e8** ground, ink **#11110f** line-work; the _cambium_ — the narrow living layer where scion and rootstock fuse — is filled with terracotta **#d85a3a** as the only chromatic element, a thin glowing seam no thicker than 4 px. **Lighting.** Flat plate lighting, no cast shadows; subtle paper texture only. **Mood.** Quiet, technical, reverent — a Victorian field-guide page that happens to be about software. **Negative.** No people, no tools held by hands, no computers, no roots shaped like circuits (the _trunk_ carries the code, not the roots), no rainbow palette, no watercolor bleed, no photoreal bark, no leaves rendered as printed-circuit traces.

### Notes

- Generate at 4K then downscale to 2400 px wide for crispness.
- Bleed the bottom edge into transparency so the page background can blend up into the trunk.
- Variant `hero-graft-dark.png`: invert ground to ink **#11110f** with cream line-work; keep the terracotta cambium identical. Used by the site when the user prefers dark mode.

---

## 2. Open Graph card — `og-default.png`

| Spec               | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Filename**       | `packages/website/public/visuals/og-default.png` |
| **Dimensions**     | 1200 × 630 (Open Graph 1.91:1)                   |
| **Where it lives** | `<meta property="og:image">` on every page       |
| **Format**         | PNG, sRGB, ≤300 KB                               |

### Prompt

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A horizontal social-share card. Left two-thirds: a tightly-cropped graft union — diagonal cleft, three raffia bindings, terracotta cambium — drawn as a small botanical plate centered in its own quiet rectangle. Right one-third: the wordmark "ingraft" set in a humanist sans-serif, weight 500, all lowercase, ink **#11110f**, optical size 88 pt; directly beneath it the tagline "Vendor source for agents." set at 32 pt weight 400 in the same ink, tracked +20 units; below the tagline a thin 1 pt terracotta rule, 96 px wide. **Composition.** Twelve-column grid, generous outer margin (96 px), vertical centerline divides illustration from type; a single hairline 0.5 pt frames the entire card 48 px inside the bleed. **Style/medium.** Letterpress engraving for the graft, clean digital typography for the wordmark — the two media coexist deliberately. **Color.** Cream **#f6f1e8** ground, ink line-work and type, terracotta cambium and rule. **Lighting.** Flat. **Mood.** A foundational title plate from a printed manual. **Text rendering.** The card contains exactly two pieces of text: `"ingraft"` and `"Vendor source for agents."` — render both precisely; do not invent additional copy. **Negative.** No drop shadows behind type, no gradients on the rule, no decorative flourishes, no website URL, no social-platform icons, no emoji.

### Notes

- Also export `og-default@2x.png` at 2400 × 1260 for retina previews.
- A second variant `og-docs.png` (same composition, replace the tagline string with `"The docs."`) can be wired to docs pages later.

---

## 3. Strategy illustrations (three plates)

A triptych. Each is a square botanical plate showing the same graft motif under a different mechanism. They should read as a _family_ — identical canvas, identical type block, identical scion silhouette; only the union differs.

### 3a. `strategy-subtree.png`

| Spec               | Value                                          |
| ------------------ | ---------------------------------------------- |
| **Filename**       | `public/visuals/strategy-subtree.png`          |
| **Dimensions**     | 1200 × 1200 (1:1)                              |
| **Where it lives** | "Subtree by default" card in `strategySection` |

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A botanical cross-section plate of a **cleft graft fully healed**: the scion has knitted seamlessly into the rootstock so the diagonal cambium line reads as a single, continuous, scar-like seam. Three raffia ties have been removed (their imprint visible as fine annular bruises) — the union is now mature. A small Latin label below reads `"Inoculum subtrahere"`. **Composition.** Square plate; trunk vertical, centered; union at the optical center, scion length above equals rootstock length below; six measurement callouts radiate. **Color.** Cream ground, ink line-work, terracotta seam continuous and unbroken. **Mood.** Permanence, integration. **Negative.** No visible ties, no gap at the union, no halo around the seam.

### 3b. `strategy-submodule.png`

| Spec               | Value                                   |
| ------------------ | --------------------------------------- |
| **Filename**       | `public/visuals/strategy-submodule.png` |
| **Dimensions**     | 1200 × 1200 (1:1)                       |
| **Where it lives** | "Submodule when needed" card            |

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A botanical cross-section plate of a **graft held in place by an explicit fixed pin**: the scion meets the rootstock with a small but visible air-gap across the union, bridged by a single nickel-finished horticultural staple drawn as a precise orthographic detail (top-view inset in the upper right shows the staple's profile with dimensions `"6 mm"` and `"2 mm"`). The cambium seam glows terracotta but is interrupted at the staple. A Latin label reads `"Inoculum substringere"`. **Composition.** Same square plate, same trunk position; inset detail occupies the upper-right quadrant with its own hairline frame. **Color.** Cream, ink; the staple rendered in ink with fine highlight hatching (no chrome); cambium terracotta but broken. **Mood.** Pinned, deliberate, separable. **Negative.** No metallic shading, no shiny reflections, no second color besides terracotta.

### 3c. `strategy-clone-ignore.png`

| Spec               | Value                                      |
| ------------------ | ------------------------------------------ |
| **Filename**       | `public/visuals/strategy-clone-ignore.png` |
| **Dimensions**     | 1200 × 1200 (1:1)                          |
| **Where it lives** | "Clone and ignore" card                    |

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A botanical plate showing **two saplings planted side by side in the same bed but not joined**: on the left, the rootstock trunk with its strata-of-code grain (the project); on the right, a freestanding scion-sapling of the same height, leaning slightly toward the rootstock but separated by a 24 px gap. The earth line at the bottom is a dashed ink rule labelled in small caps `".GITIGNORE"`. The two plants share a single root-zone wash of pale stippling. A Latin label reads `"Inoculum sepōnere"`. **Composition.** Square plate; both plants centered as a pair; gap visible between trunks; dashed ground line crosses the lower fifth. **Color.** Cream, ink; the dashed line in terracotta to mark the boundary; no cambium accent on either plant since no union exists. **Mood.** Adjacent, local, untracked. **Negative.** No fence, no wall, no dotted line that reads as code — it should read as horticultural marking tape.

---

## 4. Section illustrations (small spot plates)

Square 1000 × 1000 plates, used as decorative banners at the top of docs pages. Same family as the strategy triptych but simpler — one motif, less callout density.

### 4a. `section-getting-started.png`

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A single grafting knife laid diagonally across the plate, blade pointing upper-right, handle of turned cherry wood, blade of fine carbon steel rendered in ink hatching. Beside the blade, a fresh scion-cutting with two buds. A faint hand-drawn ruler runs along the bottom edge marked `"0"` `"5"` `"10"` cm. **Color.** Cream, ink; the buds tipped terracotta. **Composition.** Diagonal lay, generous negative space top-left. **Mood.** A tool laid out before work begins. **Negative.** No hands, no workbench.

### 4b. `section-doctor.png`

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A nineteenth-century field-stethoscope (a Laënnec-style wooden monaural tube) leaning against a tree trunk, the open bell pressed to the bark. Three concentric annotation arcs radiate from the contact point with small hairline labels reading `"strata"`, `"ritmus"`, `"sanitās"`. **Color.** Cream, ink; the contact point dotted in terracotta. **Composition.** Centered, vertical trunk fragment, stethoscope at 15° lean. **Mood.** Diagnostic, calm.

### 4c. `section-version-sync.png`

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A pair of pruning shears drawn in an exploded orthographic projection: the two blades separated by a small gap, connected by a single pivot pin, the two handles parallel below. To the right, a small dial-gauge labelled `"sync"` with its needle pointing at the 12-o'clock tick. **Color.** Cream, ink; the gauge needle and the pivot pin terracotta. **Composition.** Shears on the left two-thirds, gauge on the right third. **Mood.** Mechanical precision in service of horticulture.

### 4d. `section-tooling.png`

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A flat-lay of six small implements arranged in a 3×2 grid on the plate, each with a hairline frame and a tiny serif caption beneath: a grafting knife (`"cultellus"`), a pair of secateurs (`"forfex"`), a roll of raffia (`"vinculum"`), a wax pot (`"cera"`), a brass rule (`"regula"`), a tag with twine (`"signum"`). **Color.** Cream, ink; the wax pot's interior alone is filled with terracotta. **Composition.** Strict 3×2 grid, equal spacing, captions baseline-aligned. **Mood.** A neatly laid toolkit, ready.

### 4e. `section-cli-reference.png`

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A botanical-style plate of a single tag-on-twine specimen-label of the kind tied to plants in a herbarium, hanging at a slight angle from a twig that crosses the plate diagonally. On the tag, hand-set in a humanist sans-serif, the single string `"ingraft --help"`. The twig bears two small leaves and one bud. **Color.** Cream ground, ink line-work and type, the bud and the knot of the twine in terracotta. **Composition.** Twig from upper-left to lower-right, tag dangling near the center. **Mood.** A reference card you tie to the thing it documents. **Text rendering.** Render `"ingraft --help"` precisely on the tag; no other text.

---

## 5. Background texture — `texture-blueprint.png`

| Spec               | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Filename**       | `public/visuals/texture-blueprint.png`                   |
| **Dimensions**     | 2048 × 2048, designed to tile seamlessly                 |
| **Where it lives** | Subtle `background-image` on `<body>` of marketing pages |

### Prompt

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A nearly-blank botanical-blueprint plate texture: a very low-contrast grid of 24 px squares in faint ink, overlaid with three ghosted botanical specimens drawn in **8% opacity ink** — a leaf cross-section, a stamen study, and a root-tip — scattered with deliberate asymmetry so that the texture _reads as a margin doodle_ rather than a focal subject. Occasional 6% terracotta dots mark grid intersections at irregular intervals (no more than twelve dots across the whole image). **Composition.** Edge-matched so the left edge tiles seamlessly against the right and the top against the bottom. **Color.** Cream ground; everything else extremely faint. **Mood.** Almost invisible paper substrate. **Negative.** Texture must not compete with foreground content; anywhere it appears it should read as _paper_, not _graphic_. No watermarks, no logos, no dense pattern.

### Notes

- Test tile by rendering at 25% opacity on a sample page — if it draws the eye, it failed.

---

## 6. Logomark refinement (optional second pass) — `logomark.png`

The current vector logo at [`packages/website/src/assets/logo-light.svg`](../../../packages/website/src/assets/logo-light.svg) is fine for the header. For social avatars and slide intros, render a refined raster version:

| Spec           | Value                           |
| -------------- | ------------------------------- |
| **Filename**   | `public/visuals/logomark.png`   |
| **Dimensions** | 1024 × 1024                     |
| **Format**     | PNG with transparent background |

### Prompt

> _[style preamble]_ &nbsp;&nbsp; **Subject.** A single rounded-square mark, 1024 × 1024, ink **#11110f** ground, fully bleeding to the edges. Centered within: a stylized capital letter form constructed from two elements — a vertical ink stem at left, and a terracotta **#d85a3a** vertical bar of equal height set flush against its right side, separated by a 6 px ink hairline. Below the pair, a horizontal ink baseline 1.5 pt thick spans the full width of the letterform. The composition reads simultaneously as the letter "I" and as a diagrammatic cross-section of a cleft graft. **Color.** Ink ground, cream **#f6f1e8** for the principal stem, terracotta for the second bar, ink baseline. **Composition.** Mark inscribed in an 80%-of-canvas central square; equal margins. **Mood.** A logotype that earns its place by being a diagram. **Negative.** No bevel, no inner glow, no 3D effect, no text characters anywhere on the canvas.

---

## Generation cheat-sheet

| Tool                 | Suggested model | Aspect-ratio handling               |
| -------------------- | --------------- | ----------------------------------- |
| OpenAI `gpt-image-1` | `gpt-image-1`   | `size: "1536x1024"` / `"1024x1024"` |
| Nano Banana Pro      | Premium / 4K    | Aspect specified at request time    |
| Seedream v4.5        | Artistic backup | Avoid for typography-heavy plates   |

When iterating, hold the **style preamble** constant and vary only the **Subject** and **Composition** sections — that is what produces a coherent set. Generate four variations of each at 1K, pick the strongest, then re-render that single prompt at 4K for delivery.

## Post-processing checklist

After download, before committing to `public/visuals/`:

1. Open in a pixel editor and verify the cream is exactly **#f6f1e8** and the terracotta is exactly **#d85a3a**. If they drifted, do a global color replace.
2. Confirm there is **no other color** in the image. If the model snuck in a third hue, run a posterize-to-three-colors pass.
3. Crop to the listed dimensions exactly; do not let the artwork bleed past the canvas.
4. Run `pngquant --quality 80-95` to land each file under 300 KB (under 150 KB for the OG card).
5. Strip metadata: `exiftool -all= file.png`.
6. Diff against the rest of the set by laying all twelve on a contact sheet — they must read as siblings.
