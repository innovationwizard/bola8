# Implementation Batches — Render-Anchored Workflow Refactor

_Created: 2026-05-20_
_Plan: docs/REFACTOR_PLAN.md_
_Audit: docs/AUDIT_CURRENT_VS_IDEAL.md_

## How to use this file
Each batch is atomic — one clear unit of work, independently committable.
After each batch completes, status changes to ✅ DONE.
If context is lost, READ THIS FILE FIRST to know exactly where to resume.

---

## Batch Status

| # | Batch | Status |
|---|-------|--------|
| 0 | Delete all legacy/dead code | ✅ DONE |
| 1 | DB migration SQL | ✅ DONE |
| 2 | API — post_reference_images CRUD routes | ⬜ PENDING |
| 3 | API — pin/unpin render route | ⬜ PENDING |
| 4 | Lib — `generateFromRender()` function | ⬜ PENDING |
| 5 | API — update `generate` route (render-anchored path) | ⬜ PENDING |
| 6 | API — update `regenerate` route (consistent Layer 3) | ⬜ PENDING |
| 7 | UI — `PostReferenceImages` component (no page wiring) | ⬜ PENDING |
| 8 | UI — Wire Pinterest Inspo gallery to post page | ⬜ PENDING |
| 9 | UI — Split project brand page: Renders + Style sections | ⬜ PENDING |
| 10 | Polish — `formato` in prompts + `isOriginal` fix | ⬜ PENDING |

---

## Batch Detail

---

### BATCH 0 — Delete all legacy/dead code
**Status:** ✅ DONE
**Goal:** Clean slate before any new code is written.
**Files to delete:**
- `lib/prompt-loader.ts`
- `lib/prompt-evolution.ts`
- `lib/prompt-optimizer.ts`
- `lib/material-library.ts`
- `lib/material-library-db.ts`
- `lib/quotation-engine.ts` (check if used first)
- `lib/ml-client.ts` (check if used first)
- `prompts/` (entire directory)
- `app/api/enhance/` (entire directory: color, elements, lighting, status, targeted, train routes)
- `app/api/train/` (entire directory: evolve, rate, status routes)
- `app/components/EnhancedEnhancer.tsx`
- `app/components/ColorReplacementTool.tsx`
- `app/components/ElementAdditionTool.tsx`
- `app/components/LightingControlTool.tsx`
- `app/components/MaterialPicker.tsx`
- `app/components/MaterialReplacementTool.tsx`
- `app/components/TrainingCard.tsx`
- `app/components/ImageSpaceAssignment.tsx`
- `app/tools/enhancer/page.tsx` (and directory if empty)
- `app/train/page.tsx` (and directory if empty)
- `app/page.previous.tsx`
- `LEARNING_SYSTEM_TECHNICAL_DOCUMENTATION.md` (interior design residue)
- `BROKEN_REFERENCES.md` (stale)

**Verification:** `grep -r "prompt-loader\|prompt-evolution\|prompt-optimizer\|material-library\|ml-client\|quotation-engine" app/ lib/ --include="*.ts" --include="*.tsx"` returns nothing.

---

### BATCH 1 — DB migration SQL
**Status:** ✅ DONE
**Goal:** Schema changes needed for image roles and per-post references.
**Output:** A SQL file the user runs in the Supabase SQL editor.
**Changes:**
1. Add `role text NOT NULL DEFAULT 'style' CHECK (role IN ('render', 'style'))` to `project_reference_images`
2. Add `is_pinned boolean NOT NULL DEFAULT false` to `project_reference_images`
3. Add partial unique index: only one pinned render per project
4. Create `post_reference_images` table (mirrors structure, scoped to `post_id`)
**File output:** `docs/migration_001_image_roles.sql`

---

### BATCH 2 — API: post_reference_images CRUD routes
**Status:** ⬜ PENDING
**Prerequisite:** Batch 1 run
**New files:**
- `app/api/posts/[id]/reference-images/route.ts` — GET (list) + POST (create)
- `app/api/posts/[id]/reference-images/[refId]/route.ts` — DELETE
- `app/api/posts/[id]/reference-images/upload-url/route.ts` — POST (signed URL)
**Pattern:** Mirror the existing `app/api/projects/[id]/reference-images/` routes exactly, replacing `project_id` with `post_id` and querying `post_reference_images`.

---

### BATCH 3 — API: pin/unpin render route
**Status:** ⬜ PENDING
**Prerequisite:** Batch 1 run
**Change:** Add PATCH to `app/api/projects/[id]/reference-images/[refId]/route.ts`
- Accepts `{ is_pinned: true }` body
- Unsets `is_pinned` on all other renders for the project first (only one pin per project)
- Sets `is_pinned = true` on the target row
- Only applies to rows with `role = 'render'` (safety check)

---

### BATCH 4 — Lib: `generateFromRender()` function
**Status:** ⬜ PENDING
**Prerequisite:** None (pure lib change)
**File:** `lib/google-image.ts`
**Add one new export:**
```typescript
export async function generateFromRender(
  renderBuffer: Buffer,
  prompt: string,
  styleRefBuffers: Buffer[],  // Pinterest Inspo first, then project style refs
): Promise<Buffer>
```
Composition prompt clearly communicates render = structural anchor, style refs = aesthetic direction.
Pinterest Inspo labeled as "highest priority style direction for this post."

---

### BATCH 5 — API: Update `generate` route
**Status:** ⬜ PENDING
**Prerequisite:** Batches 1, 2, 4
**File:** `app/api/posts/[id]/generate/route.ts`
**Changes:**
1. After fetching post + brand, also fetch:
   - Pinned project render (`project_reference_images WHERE project_id = $1 AND role = 'render' AND is_pinned = true LIMIT 1`)
   - Post Pinterest Inspo (`post_reference_images WHERE post_id = $1 ORDER BY display_order ASC LIMIT 3`)
   - Project style refs (`project_reference_images WHERE project_id = $1 AND role = 'style' ORDER BY display_order ASC LIMIT 3`)
2. If pinned render exists:
   - Download render buffer
   - Download Pinterest Inspo buffers (first), then project style ref buffers
   - Call `generateFromRender(renderBuffer, prompt, [...pinterestBuffers, ...styleBuffers])`
3. If no pinned render:
   - Existing Imagen path (unchanged)
   - Apply project style refs + Pinterest Inspo as style refs (combined)

---

### BATCH 6 — API: Update `regenerate` route
**Status:** ⬜ PENDING
**Prerequisite:** Batches 1, 2, 4
**File:** `app/api/images/[id]/regenerate/route.ts`
**Changes:**
1. Fetch pinned project render (same query as Batch 5)
2. Look up the post_id from the posts table (via `posts WHERE image_id = $rootId`)
3. Fetch post Pinterest Inspo
4. Fetch project style refs
5. If pinned render exists: use `generateFromRender()` path (render as base)
6. If no pinned render: use existing `composeImageWithGoogle()` path
7. Style refs order: `[feedbackRefs, pinterestRefs, projectStyleRefs]`

---

### BATCH 7 — UI: `PostReferenceImages` component
**Status:** ⬜ PENDING
**Prerequisite:** Batch 2
**New file:** `app/components/PostReferenceImages.tsx`
**What it does:**
- Shows a gallery of up to 3 images (hard cap enforced in UI)
- Upload button → signed URL → PUT to Supabase → POST to save record
- Delete button on each image
- Empty state: dashed upload zone with "Imágenes de inspiración" label
- No page wiring in this batch — component only

---

### BATCH 8 — UI: Wire Pinterest Inspo gallery to post page
**Status:** ⬜ PENDING
**Prerequisite:** Batch 7
**File:** `app/projects/[id]/posts/[postId]/page.tsx`
**Change:** Add `<PostReferenceImages postId={postId} projectId={projectId} />` above `<ImageVersionNavigator>`.
Section header: "Pinterest Inspo" with explanatory note.

---

### BATCH 9 — UI: Split project brand page into Renders + Style sections
**Status:** ⬜ PENDING
**Prerequisite:** Batches 1, 3
**File:** `app/projects/[id]/brand/page.tsx`
**Changes:**
1. Replace current single "Imágenes de referencia" section with two sections:
   - **Renders del proyecto** — uploads with `role = 'render'`. Pin affordance (star icon) on each render. Only one can be pinned (toggling pin calls Batch 3 route). Empty state explains these anchor the building.
   - **Referencias de estilo** — uploads with `role = 'style'`. Existing behavior, new label. Empty state explains these guide palette/mood.
2. On load, fetch renders and style refs separately (filter by role).
3. Pin action: clicking the pin icon calls PATCH `is_pinned: true` on that render. Optimistically updates UI to show only that render as pinned.

---

### BATCH 10 — Polish: `formato` in prompts + `isOriginal` fix
**Status:** ⬜ PENDING
**Prerequisite:** None
**Changes:**
1. `app/api/posts/[id]/generate/route.ts` — add `formato` mapping to `buildPrompt()`
2. `app/api/images/[id]/regenerate/route.ts` — same `formato` mapping in `buildPrompt()`
3. `app/components/ImageVersionNavigator.tsx` — show feedback panel on ALL generated images, not just non-originals. Change condition from `!currentVersion.isOriginal` to always show (or check for `provider === 'google'` in metadata).

---

## Resume Instructions (if context is lost)

1. Read this file to find the first `⬜ PENDING` batch.
2. Read `docs/REFACTOR_PLAN.md` for the full rationale.
3. Read `docs/AUDIT_CURRENT_VS_IDEAL.md` for the gap analysis.
4. The memory file at `.claude/projects/.../memory/project_refactor_decisions.md` has confirmed decisions.
5. Implement the next PENDING batch. Mark it ✅ DONE when complete.
6. Never skip a batch or combine batches.
