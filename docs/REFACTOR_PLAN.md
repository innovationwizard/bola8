# Bola8 — Refactor Plan: Closing the Gaps

_Plan date: 2026-05-20_
_References: AUDIT_CURRENT_VS_IDEAL.md_

---

## North Star

The user must never need to leave Bola8 and go to Gemini. Every input she feeds Gemini manually (prior renders + Pinterest references + instructions) must be available in Bola8 as first-class inputs. The generation pipeline must use them correctly.

---

## Gap Closure Plan

---

### CHANGE 1 — Split reference images into three distinct roles
**Closes: GAP-3a, GAP-3b, GAP-ARCH-2**

**Current:** One table (`project_reference_images`), one role (style hints).

**New architecture — three image roles, two scopes:**

| Role | Scope | Where stored | How used in generation |
|------|-------|-------------|----------------------|
| **Project renders** | Project-level | `project_reference_images` with `role = 'render'` | Fed as the BASE IMAGE to Gemini — structural anchor. The building. |
| **Style references** | Project-level | `project_reference_images` with `role = 'style'` | Fed as style refs — palette, lighting, mood adaptation. |
| **Pinterest Inspo** | Post-level (per task) | New table: `post_reference_images` (or `project_reference_images` with `post_id`) | Fed as style refs specific to this post's generation. |

**Implementation:**
1. Add `role` column to `project_reference_images`: `'render' | 'style'`. Default: `'style'` (backwards compatible).
2. Create `post_reference_images` table mirroring `project_reference_images` structure, with `post_id` instead of `project_id`:
   ```sql
   CREATE TABLE post_reference_images (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
     project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     storage_path  text NOT NULL,
     url           text,
     caption       text,
     display_order integer NOT NULL DEFAULT 0,
     created_at    timestamptz NOT NULL DEFAULT now()
   );
   ```
3. Add API routes:
   - `GET/POST /api/posts/[id]/reference-images` — list + add Pinterest Inspo for a post
   - `DELETE /api/posts/[id]/reference-images/[refId]`
   - `POST /api/posts/[id]/reference-images/upload-url`

**Why this structure:**
- Project renders live at project level because they represent the property itself — every post for Bosque Las Tapias should have access to the same building renders.
- Pinterest Inspo lives at post level because it's task-specific. The running track post uses running references; a pool post uses pool references. They don't cross-pollinate.
- Style references (mood boards, atmosphere) live at project level because they apply to the whole campaign's visual identity.

---

### CHANGE 2 — New generation pipeline: "render-anchored" path
**Closes: GAP-ARCH-1, GAP-ARCH-2, Failure 1, Failure 2**

**Current:** `createImageWithGoogle(prompt)` → Imagen (text only, hallucinated building) → `applyStyleReferences()` (style only).

**New logic in `generate` route:**

```
IF project has renders (role='render' in project_reference_images):
  → Use render-anchored path (Gemini composition)
ELSE:
  → Use current Imagen path (unchanged fallback)
```

**Render-anchored path:**
1. Fetch the most recent project render (or let user pin one — see CHANGE 4).
2. Fetch post-level Pinterest Inspo images — **these have more weight** than project-level style refs because they were specifically chosen for this task.
3. Fetch project-level style references as supporting context.
4. Build prompt from Layers 1+2+4.
5. Call `composeImageWithGoogle(renderBuffer, prompt, [...pinterestRefs, ...styleRefs])`.

**Pinterest Inspo weight rationale:** The user spent time on Pinterest specifically for this post. Those images represent a deliberate creative decision — "this is what I want this image to feel like." They must lead the style adaptation, not be diluted equally among all project-level references. Implementation: Pinterest Inspo images come first in the style refs array, and the composition prompt explicitly names them:

```
Style direction for this specific post (highest priority):
[pinterest inspo images]

Brand style references (project context):
[project style refs]
```
   - The render IS the base image — Gemini preserves its structure (the real building).
   - Style refs drive the aesthetic.
   - Prompt drives the concept and message.

**New function needed in `lib/google-image.ts`:**
```typescript
export async function generateFromRender(
  renderBuffer: Buffer,          // project render — structural anchor
  prompt: string,                // layers 1+2+4
  styleRefBuffers: Buffer[],     // pinterest inspo + style refs
): Promise<Buffer>
```

This is essentially `composeImageWithGoogle` with a composition-focused prompt rather than an edit prompt. The key difference in the system instruction:
- Current edit prompt: "preserve exact subject, adapt style"
- New render prompt: "use this property render as the foundation, apply the concept and style from references, create a marketing image"

**Why Gemini and not Imagen for this path:**
Imagen 4 Ultra is excellent at generating photorealistic scenes from text. But it has no mechanism for structural image conditioning — there is no "here is what the building looks like, generate with this building" mode in the current SDK call. Gemini's multimodal composition is precisely the right tool here: it's what the user is already successfully using in her workaround.

---

### CHANGE 3 — Pinterest Inspo gallery on the post page
**Closes: GAP-3b, supports CHANGE 1**

**Current:** Post page (`app/projects/[id]/posts/[postId]/page.tsx`) shows post metadata + ImageVersionNavigator. No way to upload per-post references.

**New section on post page — above ImageVersionNavigator:**

```
┌─────────────────────────────────────────┐
│ Pinterest Inspo                 + Agregar│
│ Imágenes de inspiración para este post   │
│ ┌────┐ ┌────┐ ┌────┐                   │
│ │ 1  │ │ 2  │ │ 3  │                   │
│ └────┘ └────┘ └────┘                   │
└─────────────────────────────────────────┘
```

- Upload flow: signed URL → Supabase → save to `post_reference_images`
- Delete flow: remove from DB + Supabase
- These images appear in the gallery before generation — user uploads them, THEN hits "Generar"
- On generation: the route fetches them and feeds them as style refs (alongside project-level ones)

**Why on the post page, not project brand page:**
The post page is where the user is already working. She has the content plan open (the idea, the texto_en_arte). She mentally assembles the image while on this page. The Pinterest downloads should go in immediately, in context, without navigating away.

---

### CHANGE 4 — Project renders section on project brand page
**Closes: GAP-3a, supports CHANGE 2**

**Current:** Project brand page (`app/projects/[id]/brand/page.tsx`) has one reference images section with no role differentiation. Description says "renders, fotografías de inspiración, mood board" — everything mixed.

**New: split into two sections:**

```
┌────────────────────────────────────────────┐
│ RENDERS DEL PROYECTO                        │
│ Renders o fotos reales del desarrollo.      │
│ La IA los usa como base estructural —       │
│ el edificio siempre será el correcto.       │
│ ┌────┐ ┌────┐                              │
│ │ R1 │ │ R2 │                              │
│ └────┘ └────┘                              │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ REFERENCIAS DE ESTILO                       │
│ Mood boards, atmósfera, paleta visual.      │
│ La IA adapta el estilo de cada imagen       │
│ para coincidir con estas referencias.       │
│ ┌────┐ ┌────┐ ┌────┐                      │
│ │ S1 │ │ S2 │ │ S3 │                      │
│ └────┘ └────┘ └────┘                      │
└────────────────────────────────────────────┘
```

- Renders section: uploads with `role = 'render'`
- Style references section: uploads with `role = 'style'` (existing behavior, unchanged)
- UI clearly communicates the difference so the user knows which section the building renders go in

**Migration:** Existing records in `project_reference_images` default to `role = 'style'` — no data loss. User can re-upload or reclassify renders after the migration.

---

### CHANGE 5 — Fix regeneration Layer 3 gap
**Closes: GAP-3c, GAP-REGEN-1**

**Current:** `regenerate` route fetches only feedback-attached reference images, not base project references.

**Fix in `app/api/images/[id]/regenerate/route.ts`:**
1. After fetching `image.project_id`, also fetch project renders + style refs from `project_reference_images`.
2. Fetch post-level Pinterest Inspo from `post_reference_images` if `post_id` is available.
3. Merge: `[feedbackRefs, postRefs, projectStyleRefs]` as style refs.
4. If project renders exist → use render-anchored path (CHANGE 2) for regeneration too.

**Why this matters:** Every regeneration iteration starts from a base that was generated using all layers. If Layer 3 drops out on the second iteration, the model has less grounding and tends to drift from the original concept. Consistency is what builds quality across iterations.

---

### CHANGE 6 — Fix `isOriginal` feedback panel gap
**Closes: GAP-REGEN-2**

**Current:** `ImageVersionNavigator` hides the feedback panel when `currentVersion.isOriginal` is true. But the "original" in this context is the first AI-generated image — not a user upload. It's the image that most needs feedback.

**Fix:** The feedback panel should show for all AI-generated images. The `isOriginal` flag should only suppress feedback for user-uploaded source images (which don't come from this flow).

**Implementation:** In `ImageVersionNavigator`, check whether the image has a generation source (e.g., `enhancement_type !== null` or a `metadata.provider === 'google'` flag) rather than `isOriginal`. Alternatively, always show the feedback panel for all versions.

---

### CHANGE 7 — Add `formato` to prompt
**Closes: GAP-4a**

**Current:** `formato` is fetched in both `generate` and `regenerate` but never used.

**Fix in `buildPrompt()`:**
```typescript
const formatoMap: Record<string, string> = {
  'Reel':     'Vertical video-cover format. Strong single visual, minimal scene complexity.',
  'Carrusel': 'First slide of a carousel. Composition must work as standalone and invite swiping.',
  'Story':    'Ephemeral story format. Full-bleed vertical, bold visual impact.',
  'Post':     'Standard square/portrait feed post.',
};
if (post.formato && formatoMap[post.formato]) {
  parts.push(`Format: ${formatoMap[post.formato]}`);
}
```

Small change, meaningful signal — especially for "Reel" vs "Carrusel" cover which have very different composition needs.

---

### CHANGE 8 — Remove dead/legacy code
**Closes: GAP-LEGACY**

Delete the following (they are not imported by any active route):

**Files to delete:**
- `lib/prompt-loader.ts`
- `lib/prompt-evolution.ts`
- `lib/prompt-optimizer.ts`
- `lib/material-library.ts`
- `lib/material-library-db.ts`
- `prompts/` (entire directory)
- `app/api/enhance/` (entire directory)
- `app/api/train/` (entire directory)
- `app/components/EnhancedEnhancer.tsx`
- `app/components/ColorReplacementTool.tsx`
- `app/components/ElementAdditionTool.tsx`
- `app/components/LightingControlTool.tsx`
- `app/components/MaterialPicker.tsx`
- `app/components/MaterialReplacementTool.tsx`
- `app/components/TrainingCard.tsx`
- `app/components/ImageSpaceAssignment.tsx`
- `app/tools/enhancer/page.tsx`
- `app/train/page.tsx`
- `app/page.previous.tsx`

**Why now:** These files reference "diseño de interiores" in their comments and system prompts. Every new developer (or AI assistant) who reads this codebase gets confused about what Bola8 actually is. The memory file `project_fundamental_intent.md` says this explicitly: "Bola8 IS a marketing images automation system, NOT interior design. All ID residue is legacy to be replaced."

---

## Implementation Sequence

Changes are ordered by dependency and impact:

| Phase | Changes | Prerequisite | Output |
|-------|---------|-------------|--------|
| **Phase 1 — Data layer** | DB migration: add `role` to `project_reference_images`, create `post_reference_images` | None | Schema ready |
| **Phase 2 — API layer** | New routes for `post_reference_images`; update `generate` + `regenerate` to use roles and post refs | Phase 1 | Backend ready |
| **Phase 3 — New pipeline** | `generateFromRender()` in `lib/google-image.ts`; render-anchored path in `generate` + `regenerate` | Phase 2 | Core failure fixed |
| **Phase 4 — UI: post page** | Pinterest Inspo gallery on post page | Phase 2 | User can upload per-post refs |
| **Phase 5 — UI: brand page** | Split project brand page into Renders + Style sections | Phase 1 | User can upload renders |
| **Phase 6 — Cleanup** | `formato` in prompt; `isOriginal` fix; delete legacy code | None | Code hygiene |

Phases 4 and 5 can run in parallel. Phase 6 can run any time.

---

## Decisions (confirmed)

| Question | Decision |
|----------|----------|
| Multiple renders — which one is base? | **User pins one.** Star/pin indicator in the renders gallery. The pinned render becomes the structural anchor for all generation. |
| Text overlay? | **Out of app.** Bola8 delivers the clean background image. User adds `texto_en_arte` in her design tool. No change to current behavior. |
| Pinterest Inspo limit? | **Hard limit of 3.** Gallery caps at 3 images, matching `MAX_STYLE_REFS`. Keeps the interface tight and generation cost predictable. |
| Legacy code? | **Delete all now, one clean commit** before writing any new code. Starts the refactor from a clean base. |
