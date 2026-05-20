# Bola8 — Deep Audit: Current State vs Ideal State vs Gaps

_Audited: 2026-05-20_

---

## The MASTER WORKFLOW (what we intend)

| Layer | Source | Purpose |
|-------|--------|---------|
| 1 | Client `brand_dna` | Corporate look and feel — applies to every post, every project |
| 2 | Project `brand_guidelines` | Project-specific visual identity |
| 3 | Reference images for this task | Visual anchors uploaded by the user for this specific post |
| 4 | Post instructions | `idea`, `descripcion`, `texto_en_arte` — what to communicate |
| + | Regeneration feedback | Accumulated text feedback + additional reference images per iteration |

---

## Layer-by-Layer: Current State vs Ideal

---

### Layer 1 — Corporate Brand DNA

**Current state:**
- `clients.brand_dna` (JSONB) is fetched via JOIN in both `generate` and `regenerate` routes.
- `buildBrandPromptSection()` in `lib/brand.ts` serializes it into the text prompt.
- Includes: photography style/mood/lighting/composition/subjects, color palette, visual aesthetic, mood descriptors, brand keywords, do_not rules.

**Ideal state:** Exactly this.

**Gap:** None. Layer 1 is implemented correctly.

---

### Layer 2 — Project-Specific Brand

**Current state:**
- `projects.brand_guidelines` (JSONB) is fetched via JOIN in both routes.
- `buildBrandPromptSection()` serializes: atmosphere, mood, target_audience, photography_direction, key_differentiators, accent colors, project do_not rules.

**Ideal state:** Exactly this.

**Gap:** None. Layer 2 is implemented correctly.

---

### Layer 3 — Task Reference Images

**Current state:**
- `project_reference_images` table stores all reference images at project level.
- **In `generate`**: fetched (up to 3, ordered by `display_order`), passed to `applyStyleReferences()`.
- **In `regenerate`**: NOT fetched from `project_reference_images` directly. Only reference images attached to prior feedback iterations (via `images.reference_image_id`) are used.
- The `applyStyleReferences()` prompt explicitly says: _"Preserve the exact subject, composition, and concept of the generated image. Adapt its color palette, lighting, texture, mood, and photographic style."_
- ALL images in `project_reference_images` are treated identically — no distinction between style references and structural/architectural anchors.
- The feedback UI (ImageVersionNavigator) allows uploading reference images during regeneration, which saves them to `project_reference_images` (project-wide pool).

**Ideal state:**
- Reference images are split into two roles:
  - **Project renders** ("renders del proyecto"): actual renders/photos of the real property. Used as the structural base — the model must build ON TOP of these, not replace them.
  - **Style references**: mood boards, Pinterest references, atmosphere images. Used to adapt palette/lighting/mood.
- Per-task (per-post) reference images exist independently from the project pool. Uploading a reference for post #1 does not affect post #2.
- Layer 3 applies consistently in BOTH generation and regeneration.

**Gaps (critical):**
- **GAP-3a**: No role differentiation. All reference images are style hints. A user uploading an actual building render gets it treated as a mood board — the model "adapts style" from it but still generates a hallucinated building as the subject.
- **GAP-3b**: No per-post reference images. All uploads go into a shared project pool.
- **GAP-3c**: Layer 3 drops out in regeneration unless the user explicitly attaches a reference image to their feedback. The base project reference images are not re-loaded in `regenerate`.

---

### Layer 4 — Post Instructions

**Current state:**
- `idea`, `descripcion`, `texto_en_arte` are fetched and included in the prompt.
- `texto_en_arte` is passed with instruction: _"do not render the text itself"_ — the model is told to design the visual to complement it, not display it.
- `formato` is fetched from the DB but never used in the prompt.

**Ideal state:**
- All four fields used. `formato` (e.g., Reel, Carrusel, Story) should influence composition framing.
- `texto_en_arte` correctly not rendered by the AI model.
- A downstream step (even if outside Bola8) handles text overlay.

**Gap:**
- **GAP-4a**: `formato` is fetched but silently dropped. A "Story" format has different framing needs than a "Carrusel" cover.
- **GAP-4b**: No text overlay step. The `texto_en_arte` exists in the DB, the image exists in Supabase, but there is no step that composites the text onto the image. The user manually adds text in an external tool. There is no "done" state that includes text.

---

### Regeneration Feedback Loop

**Current state:**
- `collectFeedback()` walks the parent_image_id chain and aggregates all `liked_aspects` and `improvement_notes` from every prior iteration.
- `composeImageWithGoogle()` takes the previous image as input + prompt (with accumulated feedback) + optional style refs.
- Reference images attached to feedback iterations are collected and re-used.
- Rating is required to trigger regeneration (1–5). Loop is user-controlled (no auto-stop).

**Ideal state:** Exactly this structure, with Layer 3 consistently applied.

**Gap:**
- **GAP-REGEN-1**: As noted in GAP-3c, project-level reference images (Layer 3) are not included in regeneration by default. Only feedback-attached ones are.
- **GAP-REGEN-2**: The `isOriginal` flag hides the feedback panel for the very first image — but that first image IS generated (not user-uploaded). This is semantically odd; the original is the one most likely to need feedback since it's the coldest generation.

---

## The Root Cause of the Three Failure Modes

### Failure 1: Incorrect Building

**Where it breaks:** `createImageWithGoogle()` in `lib/google-image.ts`.

```typescript
// referenceBuffer is accepted for caller convenience but Imagen 4 Ultra
// text-to-image does not use it in the basic generate call.
void referenceBuffer;
```

Imagen-4-Ultra is called with TEXT ONLY. It halluccinates the building entirely from the prompt. The subsequent `applyStyleReferences()` call explicitly preserves the subject and composition — so it cannot correct the architecture. The user's prior building renders are never fed to the model as structural inputs.

**What Gemini workaround does differently:** User supplies actual building renders as input images. Gemini composes them. The building is correct because it was never invented — it was provided.

---

### Failure 2: Incorrect Look and Feel

**Where it breaks:** The two-step pipeline (Imagen → style adaptation) cannot recover from a wrong base.

Step 1 (`createImageWithGoogle`): Imagen generates a photorealistic but invented scene.
Step 2 (`applyStyleReferences`): Gemini adapts palette/mood/lighting — but the subject/composition is preserved from step 1 (the wrong one).

Style adaptation is cosmetic. It cannot fix "wrong building in a wrong setting." It can make the wrong building look warmer or greener.

Additionally, if reference images contain marketing text overlays (as prior month's content tends to), that text can bleed through the style adaptation.

---

### Failure 3: Incorrect Text

Two separate issues:

1. **`texto_en_arte` is intentionally not rendered.** The model is told not to display it. This is correct — but there is no step where the text is composited onto the image. The output image has no text. The user has to open another tool.

2. **Reference images with text overlay.** When prior marketing images (which have text overlays) are uploaded as references, those text elements influence the style adaptation. The model picks up on text-as-visual-element.

---

## Complete Gap Register

| ID | Layer | Description | Severity |
|----|-------|-------------|----------|
| GAP-3a | Layer 3 | No "render" vs "style" role for reference images — all treated as mood refs | CRITICAL |
| GAP-3b | Layer 3 | No per-post reference images — everything goes into a shared project pool | HIGH |
| GAP-3c | Layer 3 | Regeneration does not re-apply base project reference images | HIGH |
| GAP-ARCH-1 | Pipeline | `createImageWithGoogle()` is text-only — no structural image anchor possible | CRITICAL |
| GAP-ARCH-2 | Pipeline | No generation path that takes an existing render as the compositional base | CRITICAL |
| GAP-4a | Layer 4 | `formato` fetched but never used in prompt | LOW |
| GAP-4b | Layer 4 | No text overlay step — `texto_en_arte` never reaches the final image | MEDIUM |
| GAP-REGEN-2 | UX | Feedback panel hidden on first-generation image (`isOriginal` flag) | LOW |
| GAP-LEGACY | Codebase | Dead/legacy code: Leonardo AI, Stable Diffusion, GPT-4 evolution, interior design material library | MEDIUM |

---

## Legacy / Dead Code Inventory

The following files are not called by any active route. They reference providers and workflows that have been replaced:

| File | What it references | Status |
|------|--------------------|--------|
| `lib/prompt-loader.ts` | Leonardo AI, Stable Diffusion parameters | Dead |
| `lib/prompt-evolution.ts` | GPT-4 (OpenAI), Leonardo AI, SD | Dead |
| `lib/prompt-optimizer.ts` | Material replacement for interior design | Legacy |
| `lib/material-library.ts` | Interior design material catalog | Legacy |
| `lib/material-library-db.ts` | Interior design material DB | Legacy |
| `prompts/` (entire directory) | Leonardo/SD prompt versions, evolution system prompt mentioning "diseño de interiores" | Dead |
| `app/api/enhance/*` | Legacy enhancement tools | Legacy |
| `app/api/train/*` | Legacy training routes | Legacy |
| `app/tools/enhancer/page.tsx` | Legacy enhancer UI | Legacy |
| `app/train/page.tsx` | Legacy training UI | Legacy |
| `app/components/EnhancedEnhancer.tsx` | Legacy enhancer component | Legacy |
| `app/components/ColorReplacementTool.tsx` | Interior design color replacement | Legacy |
| `app/components/ElementAdditionTool.tsx` | Interior design element addition | Legacy |
| `app/components/LightingControlTool.tsx` | Interior design lighting control | Legacy |
| `app/components/MaterialPicker.tsx` | Interior design material picker | Legacy |
| `app/components/MaterialReplacementTool.tsx` | Interior design material replacement | Legacy |
| `app/components/TrainingCard.tsx` | Legacy training card | Legacy |
| `app/components/ImageSpaceAssignment.tsx` | Legacy space assignment | Legacy |

---

## What a Correct End-to-End Generation Looks Like

### With project renders (new path — solves all three failures):

```
Inputs:
  - Layer 1: brand_dna (text → prompt)
  - Layer 2: brand_guidelines (text → prompt)
  - Layer 3a: project renders (image buffers → compositional base)
  - Layer 3b: post-specific style refs (image buffers → style adaptation)
  - Layer 4: idea + descripcion + texto_en_arte (text → prompt)

Pipeline:
  1. Build prompt from Layers 1+2+4
  2. Pick best project render as base image
  3. Call composeImageWithGoogle(renderBuffer, prompt, styleRefBuffers)
     → Gemini uses the render as the structural anchor
     → Style refs adapt palette/mood/lighting
     → Prompt drives concept/message
  4. Store result
  5. (Optional) Composite texto_en_arte as text overlay

Result: correct building + right aesthetic + guided by instructions
```

### Without project renders (current fallback path):

```
Inputs:
  - Layers 1+2+4 → text prompt
  - Layer 3b: style refs → style adaptation

Pipeline:
  1. Build prompt from Layers 1+2+4
  2. createImageWithGoogle(prompt) → Imagen-4-Ultra
  3. If style refs: applyStyleReferences(baseBuffer, styleRefBuffers)
  4. Store result

Result: photorealistic but invented scene (current behavior)
```

The new workflow adds the "with renders" path. The fallback is unchanged.
