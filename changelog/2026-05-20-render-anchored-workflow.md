# Render-Anchored Image Generation Workflow

**Date:** 2026-05-20
**Commits:** Batches 0–10 across multiple commits on `main`
**Status:** Complete — all 11 batches shipped

---

## Why this was built

Bola8 was producing images that failed on three dimensions simultaneously:

1. **Wrong building.** The generated image showed a generic or invented building instead of the actual project render. This happened because the old `createImageWithGoogle()` function was text-only — the reference image passed into it was silently discarded with `void referenceBuffer`. The architectural render never reached the model.

2. **Wrong look and feel.** Project-level style references existed in the database but were not consistently applied at generation time, and had no priority ordering relative to post-specific inspiration.

3. **Feedback loop invisible on first image.** The feedback and regeneration panel only appeared on re-generated images (`!isOriginal`), meaning the very first AI-generated image — the one users evaluate first — offered no way to rate it or request a revision without going elsewhere in the UI.

The cumulative effect: users abandoned Bola8 for Gemini or ChatGPT, manually assembling the prompt and reference images there instead. This refactor closes all three gaps by introducing a render-anchored generation pipeline and per-post Pinterest Inspo images.

---

## What changed

### Database

Two structural changes to support the new workflow:

**`project_reference_images` — new columns:**
- `role TEXT NOT NULL DEFAULT 'style' CHECK (role IN ('render', 'style'))` — distinguishes architectural renders (structural anchors) from style references (aesthetic guidance). All existing rows default to `'style'`, preserving current behavior.
- `is_pinned BOOLEAN NOT NULL DEFAULT FALSE` — marks the one render chosen as the structural base for generation. A partial unique index (`WHERE is_pinned = TRUE AND role = 'render'`) enforces the one-per-project constraint at the database level.

**New table: `post_reference_images`:**
Mirrors the structure of `project_reference_images` but scoped to a specific post. Stores the Pinterest Inspo images the user downloads and attaches to each post. Cascades on post deletion. Indexed on `post_id` for fast lookups.

```sql
CREATE TABLE post_reference_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_path   TEXT NOT NULL,
  url            TEXT,
  caption        TEXT,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### API — project reference images

**`GET /api/projects/[id]/reference-images`**
Now accepts an optional `?role=render` or `?role=style` query parameter. The brand page uses this to load renders and style references into separate sections. The parameter is whitelisted before use to prevent SQL injection. Returns signed URLs for display.

**`POST /api/projects/[id]/reference-images`**
Now accepts a `role` field in the request body (`'render'` or `'style'`, defaults to `'style'`). `display_order` is scoped within each role bucket so renders and style refs have independent ordering. Returns `role` and `is_pinned` in the response.

**`PATCH /api/projects/[id]/reference-images/[refId]`** *(new)*
Accepts `{ is_pinned: true }`. Validates that the target row has `role = 'render'` (safety check — style refs cannot be pinned). Unpins all other renders for the project first, then sets `is_pinned = true` on the target. Two-step update avoids a unique index violation that would occur if both writes were combined.

---

### API — post reference images (all new)

**`GET /api/posts/[id]/reference-images`**
Lists all Pinterest Inspo images attached to a post, ordered by `display_order`. Returns signed Supabase Storage URLs for thumbnail display.

**`POST /api/posts/[id]/reference-images`**
Saves a record after the client has uploaded the file directly to Supabase. Enforces the hard cap of 3 images per post — returns HTTP 422 if the cap is already reached. Assigns `display_order` automatically.

**`DELETE /api/posts/[id]/reference-images/[refId]`**
Removes the record and frees the storage slot. Validates ownership (the reference must belong to the specified post).

**`POST /api/posts/[id]/reference-images/upload-url`**
Issues a signed Supabase Storage upload URL for a file in the `post-inspo/{postId}/` path prefix. The client PUTs the file directly to Supabase — the file bytes never pass through Vercel, avoiding the 4.5 MB body limit.

---

### Core library — `generateFromRender()`

**File:** `lib/google-image.ts`

New export that solves the "wrong building" failure. Instead of generating from text alone, it uses the architectural render as the structural base image and passes style references as visual context.

```typescript
export async function generateFromRender(
  renderBuffer: Buffer,     // The pinned architectural render — structural anchor
  prompt: string,           // Full brand + post prompt
  styleRefBuffers: Buffer[], // Pinterest Inspo first, then project style refs
  pinterestCount: number,   // How many of styleRefBuffers are Pinterest Inspo
): Promise<Buffer>
```

The Gemini prompt structure separates roles explicitly:
- **PROPERTY RENDER** — labeled as the structural anchor; the model is told to preserve the building's architecture, geometry, and spatial layout exactly.
- **PINTEREST INSPIRATION (N images)** — labeled as highest-priority style direction for this specific post. These are the images the user downloaded for this post.
- **PROJECT BRAND STYLE REFERENCES** — labeled as supporting visual context, secondary priority. These are the project-level references that apply across all posts.

This label hierarchy ensures the model understands the intent: keep the building, apply the style.

---

### API — generate route

**File:** `app/api/posts/[id]/generate/route.ts`

Full rewrite of the generation pipeline. On each request:

1. Fetches the pinned project render, the post's Pinterest Inspo images, and the project's style references in a single parallel `Promise.all`.
2. If a pinned render exists → **render-anchored path**: downloads all buffers, calls `generateFromRender()` with Pinterest Inspo buffers listed before project style buffers.
3. If no pinned render → **fallback path**: calls `createImageWithGoogle()` (text-to-image via Imagen 4 Ultra), then `applyStyleReferences()` with Pinterest Inspo + project style refs combined.
4. Stores `render_anchored: boolean` in the image metadata so the regenerate route and any future tooling knows which path was used.

Added `FORMATO_NOTES` — a map from post format (`Reel`, `Carrusel`, `Story`, `Post`) to a short English composition instruction that is appended to the prompt. This gives the model layout guidance specific to the intended platform use.

---

### API — regenerate route

**File:** `app/api/images/[id]/regenerate/route.ts`

Rewritten to match the same pipeline as the generate route, extended with accumulated feedback.

For each regeneration request:
1. Traverses the image parent chain to find the root image ID.
2. Fetches the post linked to that image chain (via `posts WHERE image_id = ANY(...)`).
3. In parallel, fetches: pinned render, post Pinterest Inspo, project style refs, and any reference images attached to prior feedback iterations.
4. If pinned render exists → render-anchored path. Style ref order: feedback reference images (most specific, from prior iterations) → Pinterest Inspo → project style refs.
5. If no pinned render → fallback path using `composeImageWithGoogle()` on the current image.

The `pinterestCount` passed to `generateFromRender()` in the render-anchored path includes both feedback refs and Pinterest Inspo buffers, since both are post-specific and should outweigh the project-level references.

`buildPrompt()` now includes `formato` via the same `FORMATO_NOTES` map added to the generate route, ensuring format guidance is consistent across first-generation and all re-generations.

---

### UI — PostReferenceImages component

**File:** `app/components/PostReferenceImages.tsx`

New component that manages the per-post Pinterest Inspo gallery. Placed above the image generation panel on the post detail page so the user sees and fills it before generating.

**Behavior:**
- On mount, fetches existing images from `GET /api/posts/[id]/reference-images`.
- **Empty state:** Full-width dashed upload zone with instructional text ("Descarga imágenes de Pinterest y agrégalas aquí").
- **Non-empty state:** Row of 80×80px thumbnails. A delete button appears on hover over each thumbnail. If fewer than 3 images are present, an additional upload slot (dashed `+` square) is shown at the end of the row.
- **Upload flow:** On file selection, fetches a signed URL, PUTs the file directly to Supabase, then POSTs to save the record. Supports multiple file selection; stops when the cap of 3 is reached.
- **Hard cap:** Enforced both client-side (stops the upload loop at 3) and server-side (API returns 422 if cap is exceeded). The header always shows the count: `X/3`.
- **Label:** "Pinterest Inspo — X/3 — la IA les da más peso por ser específicas de este post" communicates to the user that these images carry higher weight in generation than the project-level references.

---

### UI — Post detail page

**File:** `app/projects/[id]/posts/[postId]/page.tsx`

Added `<PostReferenceImages postId={postId} projectId={projectId} />` above `<ImageVersionNavigator>`. The Pinterest Inspo gallery is now part of the standard post workflow — the user sees it, fills it, then generates.

---

### UI — Project brand page

**File:** `app/projects/[id]/brand/page.tsx`

Replaced the single "Imágenes de referencia" section with two distinct sections:

**Renders del proyecto**
- Upload gallery for architectural renders (`role = 'render'`).
- Each thumbnail has a **Pin button** (bottom-left, `Pin` icon from Lucide) that appears on hover. The pinned render gets a dark border + ring to make its special status obvious at a glance.
- Clicking the pin icon calls `PATCH /api/projects/[id]/reference-images/[refId]` with `{ is_pinned: true }`. The UI optimistically updates: all other renders are unset, the clicked one is marked pinned. No page reload required.
- Empty state explains the purpose: "Sube renders del edificio o amenidades — la IA los usa como base estructural."
- Fetched at load time via `?role=render`.

**Referencias de estilo**
- Upload gallery for style references (`role = 'style'`).
- Delete-on-hover only — no pin affordance.
- Empty state: "Fotografías de inspiración, mood board, renders de amenidades."
- Fetched at load time via `?role=style`.

The two sections load in parallel (`Promise.all`). The shared `handleUpload(files, role)` function routes each upload to the correct bucket by passing `role` in the POST body.

---

### UI — ImageVersionNavigator

**File:** `app/components/ImageVersionNavigator.tsx`

The feedback and regeneration panel previously used `!currentVersion.isOriginal` as its render condition. This blocked the panel on the first AI-generated image for a post, which has no parent image and is therefore marked `isOriginal: true`.

Changed to `currentVersion.enhancement_metadata?.provider === 'google'`. This condition is `true` on every image generated by the Gemini/Imagen pipeline (both first-generation and re-generations), and `false` on user-uploaded originals (which have no `provider` in their metadata). The feedback panel now appears immediately on the first generated image, enabling users to rate and request revisions without workarounds.

---

## Legacy code removed

Batch 0 deleted 35 files of interior design residue that had accumulated from the system's previous life as a design tool. This included:

- `lib/prompt-loader.ts`, `lib/prompt-evolution.ts`, `lib/prompt-optimizer.ts` — versioned prompt management system
- `lib/material-library.ts`, `lib/material-library-db.ts` — material database
- `lib/ml-client.ts` — custom ML client
- `lib/quotation-engine.ts` — price quotation engine (was still being called from `lib/db/image-storage.ts` via a dynamic import; that call was also removed)
- `app/api/enhance/` — color, elements, lighting, status, targeted, train enhancement routes
- `app/api/train/` — evolve, rate, status training routes
- Eight enhancement UI components (`EnhancedEnhancer`, `ColorReplacementTool`, `ElementAdditionTool`, `LightingControlTool`, `MaterialPicker`, `MaterialReplacementTool`, `TrainingCard`, `ImageSpaceAssignment`)
- `app/tools/enhancer/` and `app/train/` tool pages
- `app/projects/[id]/images/page.tsx` — project-wide image gallery page (was importing deleted components and using the legacy model)
- `prompts/` directory — Leonardo/Stable Diffusion versioned prompts and an "interior design" system prompt
- `LEARNING_SYSTEM_TECHNICAL_DOCUMENTATION.md`, `BROKEN_REFERENCES.md`

---

## Architecture after this refactor

```
Generation pipeline (new post):
  POST /api/posts/[id]/generate
    ├── Fetch: pinned render + Pinterest Inspo + project style refs (parallel)
    ├── If pinned render:
    │     generateFromRender(render, prompt, [pinterest..., style...], pinterestCount)
    │     └── Gemini: render as base, pinterest as primary style, brand refs as secondary
    └── If no pinned render:
          createImageWithGoogle(prompt)           ← Imagen 4 Ultra, text only
          applyStyleReferences(buffer, styleRefs) ← Gemini compose

Regeneration pipeline (feedback iteration):
  POST /api/images/[id]/regenerate
    ├── Traverse parent chain → rootId
    ├── Fetch: post, feedback history, pinned render, Pinterest Inspo,
    │         project style refs, feedback reference images (parallel)
    ├── buildPrompt(feedback, post, brand, projectBrand)
    │     └── Includes: format notes, concept, liked aspects (PRESERVE),
    │                   improvement notes (IMPROVE)
    ├── If pinned render:
    │     generateFromRender(render, prompt,
    │       [feedbackRefs..., pinterest..., style...], feedbackCount + pinterestCount)
    └── If no pinned render:
          composeImageWithGoogle(currentImage, prompt, styleRefs)

Reference image priority order (highest → lowest):
  1. Feedback reference images (user-selected in prior iterations, post-specific)
  2. Pinterest Inspo (post-specific, 3 max, downloaded for this exact post)
  3. Project style references (project-wide, brand aesthetic)
```

---

## Files changed summary

| File | Change |
|------|--------|
| `scripts/migration_001_image_roles.sql` | New — DB migration |
| `scripts/migrate.js` | New — migration runner using `DATABASE_URL` |
| `lib/google-image.ts` | Added `generateFromRender()` export |
| `lib/db/image-storage.ts` | Removed dynamic `quotation-engine` import |
| `app/api/projects/[id]/reference-images/route.ts` | Added `?role` filter to GET; added `role` to POST |
| `app/api/projects/[id]/reference-images/[refId]/route.ts` | Added PATCH for pin/unpin |
| `app/api/posts/[id]/reference-images/route.ts` | New — GET + POST |
| `app/api/posts/[id]/reference-images/[refId]/route.ts` | New — DELETE |
| `app/api/posts/[id]/reference-images/upload-url/route.ts` | New — signed URL |
| `app/api/posts/[id]/generate/route.ts` | Full rewrite — render-anchored pipeline |
| `app/api/images/[id]/regenerate/route.ts` | Full rewrite — consistent Layer 3 |
| `app/components/PostReferenceImages.tsx` | New — Pinterest Inspo gallery |
| `app/components/ImageVersionNavigator.tsx` | Fixed feedback panel condition |
| `app/projects/[id]/posts/[postId]/page.tsx` | Added PostReferenceImages |
| `app/projects/[id]/brand/page.tsx` | Split into Renders + Style sections |
| `docs/REFACTOR_PLAN.md` | New — plan document |
| `docs/AUDIT_CURRENT_VS_IDEAL.md` | New — gap analysis |
| `docs/IMPLEMENTATION_BATCHES.md` | New — batch progress tracker |
| 35 legacy files | Deleted (see Legacy code removed above) |
