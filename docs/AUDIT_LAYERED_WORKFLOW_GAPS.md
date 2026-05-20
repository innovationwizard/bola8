# Audit — Current State vs Layered Workflow Ideal

_Audited: 2026-05-20_
_Companion to: [RESEARCH_LAYERED_GENERATION.md](RESEARCH_LAYERED_GENERATION.md)_
_Premise: user works in Photoshop per-layer; Bola8 must output layered assets, not a single composite._

---

## Current state (after the 2026-05-20 render-anchored refactor)

Bola8 produces **one composed image per post**. The pipeline is:

```
Inputs:
  ├─ Layer 1: brand_dna (text)
  ├─ Layer 2: project brand_guidelines (text)
  ├─ Layer 3a: pinned project render (image, structural anchor)
  ├─ Layer 3b: post Pinterest Inspo (up to 3 images, post-specific style)
  ├─ Layer 3c: project style refs (up to 3 images, project-wide style)
  └─ Layer 4: post idea + descripcion + texto_en_arte + formato

Pipeline (with pinned render):
  generateFromRender(render, prompt, [pinterest..., style...], pinterestCount)
  → single composed JPEG, 1080×1350, opaque, sRGB
  → stored in compositions bucket
  → metadata.provider = 'google', metadata.render_anchored = true

Output: ONE image. User downloads. User opens Photoshop and reverse-engineers
        the parts she needs by masking, cutting, regenerating in Gemini.
```

**Stack:**
- `imagen-4.0-ultra-generate-001` for text-to-image
- `gemini-3-pro-image-preview` for composition / render-anchored
- `sharp` for final 1080×1350 resize
- `gemini-2.5-flash` for brand extraction
- Supabase Storage (uploads + compositions buckets)
- PostgreSQL via `pg` Pool

**What the recent refactor solved:**
- Wrong building → fixed by render-anchored path using the actual project render as compositional base.
- Style priority → Pinterest Inspo (post-specific) outweighs project style refs.
- Layer 3 consistency in regenerate → all three reference sources fetched on every regenerate call.
- Feedback panel on first generated image → fixed via `provider === 'google'` check.

**What the refactor did not solve (the new gap):**
- The user does not consume the composed image as the deliverable. She opens Photoshop and reconstructs the parts. The all-in-one composition is wasted compute and creates an extra reverse-engineering step.

---

## The user's actual workflow (observed, Photoshop)

| # | Layer | Optional? | Example | What it is |
|---|-------|-----------|---------|-----------|
| 1 | Background | No | Sky, distant landscape, urban context | Opaque environment behind everything |
| 2 | Building selection | No | The pinned render of the project | Specific structure being marketed |
| 3 | Building size / position / orientation | No | Scaled to fit comp, anchored bottom-center | Compositional control over #2 |
| 4 | Environment surrounding the building | No | Greenery at base, paths, fence, hedges | Foreground and midground around the building |
| 5 | Featured feature | Yes | Running track (for the ciclovía post) | The amenity being highlighted in this specific image |
| 6 | Ornamental features | Yes | Lampposts, benches, flowers, balloons | Atmospheric objects that add depth and appeal |
| 7 | People + activity | Yes | Person running, family walking, child playing | Human element doing something narrative |
| 8 | Style / look / feel | No (always implicit) | Yellow hues for "flower day"; cool tones for sunrise | Global color grading / vibe applied across all layers |

Each layer is a Photoshop layer (or layer group). The user arranges, scales, color-grades, and exports. The composition is hers, not the AI's.

---

## Gap analysis layer-by-layer

### Layer 1 — Background

| Aspect | Current | Ideal |
|--------|---------|-------|
| Generation | Implicit inside the composed image | Standalone opaque PNG of sky/environment only (no building) |
| Prompt control | Mixed with everything else | Dedicated prompt: "wide landscape, no buildings, [project location], [time of day], [weather]" |
| Output | Part of composite | `background.png` — opaque, 1080×1350, sRGB |

**Gap: LAYER-1.** No standalone background generation. The current pipeline cannot produce a sky-and-setting layer divorced from the building.

---

### Layer 2 — Building selection

| Aspect | Current | Ideal |
|--------|---------|-------|
| Source | Pinned render in `project_reference_images` with `role = 'render'` | Same — already in place |
| Output | Used internally as input to `generateFromRender` | Delivered to user as `building.png` — transparent PNG, building cut out |
| Cutout | None | Apply Bria RMBG to the pinned render |

**Gap: LAYER-2.** The pinned render exists as a database row but is never delivered to the user as a standalone transparent asset. We have the data; we lack the export step.

---

### Layer 3 — Building size / position / orientation

| Aspect | Current | Ideal |
|--------|---------|-------|
| Control | None — embedded in composed image | Photoshop Free Transform handles this |
| Bola8 role | n/a | Deliver `building.png` at a known canonical scale and with crop info so it slots predictably into the user's PSD |

**Gap: LAYER-3.** This is a Photoshop responsibility. Bola8's only obligation is to deliver the building layer at a predictable resolution and aspect — which the existing 1080×1350 + render-anchored pipeline already handles. No new gap, but documentation/metadata about scale would help.

---

### Layer 4 — Environment surrounding the building

| Aspect | Current | Ideal |
|--------|---------|-------|
| Generation | Implicit in composite | Standalone transparent PNG of vegetation, paths, ground plane |
| Prompt control | None — emerges from composite prompt | Dedicated prompt: "foreground and midground vegetation appropriate to [project], anchored to ground plane, no building" |
| Output | n/a | `environment.png` — transparent PNG |

**Gap: LAYER-4.** No way to generate "just the surroundings." This is one of the most powerful Photoshop levers — designers tune greenery and ground separately from buildings. We don't surface it.

---

### Layer 5 — Featured feature (optional)

| Aspect | Current | Ideal |
|--------|---------|-------|
| Generation | Implicit | Standalone transparent PNG of the highlighted element |
| Source of feature identity | Embedded in `idea` / `descripcion` text | Explicit field: "featured feature for this post" with optional reference image |
| Output | n/a | `featured.png` — transparent PNG |

**Gap: LAYER-5.** The feature is mentioned in the post copy (`idea` field) but is not its own first-class concept. The user cannot say "regenerate just the running track."

---

### Layer 6 — Ornamental features (optional)

| Aspect | Current | Ideal |
|--------|---------|-------|
| Generation | Implicit | Standalone transparent PNG of ornamental objects |
| Source | Inferred from style refs | Explicit field with optional examples |
| Output | n/a | `ornaments.png` — transparent PNG |

**Gap: LAYER-6.** Ornamental objects (flowers for a celebration, lamps for evening, balloons for opening day) are mentioned ad-hoc in the prompt or expected to emerge from style refs. They cannot be controlled independently.

---

### Layer 7 — People

| Aspect | Current | Ideal |
|--------|---------|-------|
| Generation | Implicit; the model decides whether people appear | Standalone transparent PNG of a person doing a specific action |
| Action specification | Buried in `idea` / `descripcion` | Explicit field: "person + action" |
| Multi-person support | None | Multiple person layers possible |
| Output | n/a | `people-{action}.png` — transparent PNG(s) |

**Gap: LAYER-7.** This is the layer the user most consistently inserts manually in Gemini because Imagen/Gemini are unpredictable about whether to render people, how many, and what they're doing. Bola8 has no surface for "I want this person, doing this thing, here."

---

### Layer 8 — Style / look / feel

| Aspect | Current | Ideal |
|--------|---------|-------|
| Where it lives | Spread across Pinterest Inspo + brand DNA + project brand + post copy | Aggregated into a "style card" the user can reference in Photoshop |
| Form | Text (in prompt) + images (in refs) | Color palette swatches + mood notes + brand voice extract + linked Pinterest thumbnails |
| Output | n/a | `style.json` + a viewable card in the UI; NOT an image layer |
| Photoshop use | n/a | Designer applies adjustment layers (curves, HSL, gradient maps) using these as reference |

**Gap: LAYER-8.** Style is the most context-dense input we already have, but we never present it as a deliverable to the user. She is currently re-extracting it visually from Pinterest tabs on her second monitor. We could hand her a synthesized card.

---

## Cross-cutting gaps

### CC-1: Transparency

Gemini 3 Pro Image and Imagen 4 Ultra **do not** generate transparent PNGs natively. Every layer that needs transparency (2, 4, 5, 6, 7) requires a post-generation cutout step. Currently we have zero infrastructure for this — no Bria integration, no rembg fallback, no transparency in our storage pipeline.

**Severity: CRITICAL.** Cannot deliver a layered workflow without this.

### CC-2: One-shot vs per-layer surface

The current UI is one big "Generar" button. Going to a tabbed per-layer surface means restructuring the post detail page and the underlying generate route. The recent refactor's `generateFromRender` becomes one of several layer generators rather than the only path.

**Severity: HIGH.** This is the largest UX and API change in this plan.

### CC-3: Storage and naming

`images` table is flat — one row per generated image. There is no notion of "this image is the people layer of post X." The asset pack concept needs:
- A grouping object (an "asset pack" or "layer set") that owns multiple images.
- A `layer_type` enum on `images` (`background`, `building`, `environment`, `featured`, `ornaments`, `people`, `composite`).
- File naming on storage that humans can read (`background.png`, not `1716234567-post-abc123.jpg`).

**Severity: HIGH.** Without this, downloads are unmanageable and the user cannot tell layers apart.

### CC-4: Feedback loop on a layered output

The existing feedback loop operates on a single image. With layers, the user might say "the people look wrong" — and we should regenerate only the people layer, not the whole pack. This requires:
- Layer-targeted regeneration ("regenerate people layer only with this feedback").
- Cost predictability ("regenerating people will cost X, regenerating the whole pack will cost Y").
- Version history per layer (not per pack).

**Severity: MEDIUM.** Can ship without this on day one; users can manually re-trigger a layer. But missing this caps user satisfaction.

### CC-5: Brand consistency across independently-generated layers

If we generate 8 layers with 8 separate Gemini calls, the model can drift between calls — slightly different palette, slightly different style, slightly different lighting angle. The user will notice and have to color-correct in Photoshop.

**Mitigations:**
- Every layer prompt inherits the full brand + project + Pinterest Inspo context.
- Optionally: generate a "style key" first (one image whose palette is committed), then pass that style key as a reference to every subsequent layer.
- Optionally: use the Qwen-Image-Layered decomposition path, which guarantees layer coherence because all layers come from one composition.

**Severity: HIGH.** This is the artistic-quality risk of the layered approach. Must be designed for.

### CC-6: Cost

Current: ~$0.035–$0.095 per post (one composition or Imagen + composition).

Per-tab generation worst case: ~$0.275 per post (all 8 layers + final composite).

Decomposition-based (Path A from research doc): ~$0.085 per post (1 composition + 1 Qwen decompose).

**Severity: MEDIUM.** A ~3× cost increase for full layered output is acceptable for a quality leap, but should be discussed with the user before implementation.

### CC-7: Photoshop integration depth

We don't actually need a Photoshop plugin. We just need to deliver a clean, well-named PSD-friendly asset pack. Options:
- Per-layer PNGs in a ZIP download.
- A single PSD file written server-side (libraries: `psd-writer`, `agpsd-js`, or `ag-psd`).
- A Photoshop-importable JSON manifest alongside PNGs.

**Severity: LOW.** ZIP of named PNGs is the right MVP. PSD generation is a polish step.

---

## Code locations affected (current → ideal)

| Concern | Current file(s) | Change |
|---------|-----------------|--------|
| Generation pipeline | [lib/google-image.ts](../lib/google-image.ts) (`generateFromRender`, `createImageWithGoogle`, `applyStyleReferences`, `composeImageWithGoogle`) | Add per-layer generation functions; add Bria cutout step or Qwen decompose call |
| Generate route | [app/api/posts/[id]/generate/route.ts](../app/api/posts/[id]/generate/route.ts) | Split into per-layer routes OR add `?layer=` parameter |
| Regenerate route | [app/api/images/[id]/regenerate/route.ts](../app/api/images/[id]/regenerate/route.ts) | Add `layer_type` awareness; regenerate single layer in place |
| Post page UI | [app/projects/[id]/posts/[postId]/page.tsx](../app/projects/[id]/posts/[postId]/page.tsx) | Replace single "Generar" button with tabbed layer panel |
| Image storage helper | [lib/db/image-storage.ts](../lib/db/image-storage.ts) | Add `layer_type`, `asset_pack_id` |
| Image versions API | [app/api/images/[id]/versions/route.ts](../app/api/images/[id]/versions/route.ts) | Group by asset pack; show layer rows |
| Brand prompt builder | [lib/brand.ts](../lib/brand.ts) | Add per-layer prompt variants (background-only, people-only, etc.) |
| DB schema | (no existing migration) | New: `asset_packs` table, `layer_type` column on `images`, layer-aware `display_order` |

---

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-1 | Layers from independent generations look stylistically incoherent | High | High | Pass shared style refs into every layer prompt; consider Qwen decomposition path |
| R-2 | Bria/Gemini API outages stop the whole pack from generating | Medium | High | Generate layers in parallel with `Promise.allSettled`; deliver partial packs; clearly mark missing layers |
| R-3 | Cost balloons because users regenerate liberally | Medium | Medium | Show predicted cost in the UI before regeneration; cap auto-retries; consider per-month budget |
| R-4 | Tab UI overwhelms the user (8 tabs is a lot) | Medium | Medium | Defaults: 4 visible tabs (background, building, environment, style); 3 optional behind a "Más capas" expander; Style as sidebar card |
| R-5 | The user wants the single composite back for quick previews | Medium | Low | Always generate a `composite.jpg` alongside the layers as a preview |
| R-6 | Bria's RMBG fails on edge cases (translucent, busy backgrounds) | Medium | Medium | Provide manual mask refinement is out of scope — fallback: generate on solid white, lower threshold |
| R-7 | Qwen decomposition splits the image in ways that don't match the user's mental model | Medium | High | Validate with real Bosque Las Tapias posts before committing to that path |
| R-8 | Migration adds new tables/columns mid-project freeze | Low | Medium | Single migration file, run during a known maintenance window |

---

## What this audit closes with

Bola8 currently delivers the **wrong shape of output** — one composite when the user wants seven assets. The render-anchored refactor (just shipped) closes the "wrong building" failure but leaves the structural shape unchanged. To recover adoption we have to deliver layered assets natively.

The technical path is clear (Gemini for generation, Bria for transparency, optional Qwen for decomposition). The work falls into four buckets:

1. **Transparency infrastructure** — Bria RMBG integration, transparent PNG storage.
2. **Layer-aware data model** — asset packs, layer types, named storage paths.
3. **Per-layer generation API** — new routes that accept a layer type and return that one PNG.
4. **Tabbed UI** — replace the single Generate button with a tabbed layer panel; deliver a ZIP download.

The plan document describes how to sequence these.
