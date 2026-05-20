# Plan — Layered Asset Studio for Bola8

_Drafted: 2026-05-20_
_Companion to:_
- _[RESEARCH_LAYERED_GENERATION.md](RESEARCH_LAYERED_GENERATION.md) — industry context_
- _[AUDIT_LAYERED_WORKFLOW_GAPS.md](AUDIT_LAYERED_WORKFLOW_GAPS.md) — gaps to close_

---

## North star (revised)

The user already works in Photoshop per-layer. Bola8 stops trying to be the final compositor and becomes the **layered asset prep tool** that drops cleanly into her Photoshop session. Each post becomes an **asset pack** of named, transparent layers plus a style card. The user composes the final image herself with full control.

This is a strategic pivot, not an enhancement. The recent render-anchored single-image pipeline becomes one engine inside the new layered output; the deliverable shape changes.

---

## Recommended technical path — Hybrid

After weighing the three paths in the research doc:

| Path | Cost | Control | Complexity | Recommendation |
|------|------|---------|------------|---------------|
| A — Qwen-Image-Layered decomposition | $0.085 | Lower (model chooses splits) | Low | Use as the default fast path |
| B — Per-tab generation + Bria cutout | $0.115–$0.275 | High (one prompt per layer) | Higher | Use for per-layer regeneration |
| C — Hybrid | Default $0.085, surgical edits at +$0.04–$0.06 | Best of both | Highest, but staged | **Recommended** |

**Hybrid logic:**
1. User clicks "Generar pack" → run the current render-anchored composition once, then decompose with Qwen-Image-Layered. Cheap, fast, gives the user something to look at in ~30 seconds.
2. User opens a specific tab and clicks "Regenerar solo esta capa" → run per-tab generation with a layer-focused prompt + Bria RMBG cutout. Costs more but only the layer the user wants surgical control over.
3. User downloads ZIP. Or — phase 2 polish — downloads a single PSD with all layers named.

This pattern matches Adobe Firefly's Generative Fill design (full image first, surgical edits on demand) and is the most coherent path for a small team to ship without rebuilding everything.

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│ POST DETAIL PAGE — Layered Studio                            │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [Fondo] [Edificio] [Entorno] [Destacado] [Ornamentos]    │ │
│ │ [Personas]                          Style card sidebar → │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Active tab:  ┌─────────────────────────────┐                 │
│              │ Preview (transparent)        │                 │
│              │                              │                 │
│              │ [Regenerar esta capa]        │                 │
│              │ [Reemplazar con upload]      │                 │
│              │ [Descargar PNG]              │                 │
│              └─────────────────────────────┘                 │
│                                                              │
│ Pack actions: [Generar pack completo] [Descargar ZIP]        │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ API: /api/posts/[id]/asset-pack                              │
│   POST  → generate full pack (Gemini + Qwen)                 │
│   GET   → list layers in current pack                        │
│                                                              │
│ API: /api/posts/[id]/asset-pack/layers/[type]                │
│   POST  → regenerate single layer (Gemini + Bria)            │
│   GET   → fetch single layer                                 │
│   DELETE → remove layer (mark optional layer absent)         │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ DB                                                           │
│   asset_packs (id, post_id, created_at, status)              │
│   images (+ layer_type, + asset_pack_id)                     │
│                                                              │
│ Storage (Supabase compositions bucket)                       │
│   asset-packs/{packId}/background.png                        │
│   asset-packs/{packId}/building.png                          │
│   asset-packs/{packId}/environment.png                       │
│   ...                                                        │
│   asset-packs/{packId}/composite.jpg                         │
│   asset-packs/{packId}/style.json                            │
└──────────────────────────────────────────────────────────────┘
```

---

## DB schema additions

```sql
-- New table: an asset pack groups all layers for a single post generation event.
CREATE TABLE asset_packs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'generating', 'ready', 'failed', 'partial')),
  generation_path   TEXT NOT NULL DEFAULT 'hybrid'
                    CHECK (generation_path IN ('decompose', 'per-layer', 'hybrid')),
  style_card        JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_asset_packs_post_id ON asset_packs(post_id);

-- Extend images table: tag each image with its asset pack and layer role.
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS asset_pack_id UUID REFERENCES asset_packs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS layer_type TEXT
    CHECK (layer_type IN ('background','building','environment','featured','ornaments','people','composite'));
CREATE INDEX IF NOT EXISTS idx_images_asset_pack ON images(asset_pack_id);
CREATE INDEX IF NOT EXISTS idx_images_pack_layer ON images(asset_pack_id, layer_type);

-- Update posts to link to the active pack (latest by default).
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS active_asset_pack_id UUID REFERENCES asset_packs(id) ON DELETE SET NULL;

-- Operator-only API usage log — every paid call from every route is appended here.
CREATE TABLE api_usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  route           TEXT,                    -- e.g. '/api/posts/[id]/asset-pack'
  provider        TEXT NOT NULL,           -- 'google' | 'fal'
  model           TEXT NOT NULL,           -- 'gemini-3-pro-image-preview', 'qwen-image-layered', etc.
  operation       TEXT NOT NULL,           -- 'generate', 'compose', 'decompose', 'rmbg', 'extract'
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  image_count     INTEGER NOT NULL DEFAULT 1,
  cost_usd        NUMERIC(10,6),           -- per-call cost in USD
  latency_ms      INTEGER NOT NULL,
  post_id         UUID REFERENCES posts(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  asset_pack_id   UUID REFERENCES asset_packs(id) ON DELETE SET NULL,
  layer_type      TEXT,                    -- if applicable
  success         BOOLEAN NOT NULL,
  error_message   TEXT
);
CREATE INDEX idx_api_usage_created_at  ON api_usage_logs(created_at DESC);
CREATE INDEX idx_api_usage_project     ON api_usage_logs(project_id, created_at DESC);
CREATE INDEX idx_api_usage_post        ON api_usage_logs(post_id, created_at DESC);

-- Operator gate. Choose one of:
--   (a) ALTER TABLE users ADD COLUMN is_superuser BOOLEAN NOT NULL DEFAULT FALSE;
--   (b) ENV var SUPERUSER_EMAILS allowlist checked in middleware.
```

Notes:
- `images.layer_type` is nullable to preserve existing rows (one-image generations from before this refactor).
- `asset_packs.style_card` stores the synthesized style metadata (palette swatches, mood notes, Pinterest summary).
- The existing `images.parent_image_id` chain still works for per-layer regeneration history.

---

## New library functions

In `lib/google-image.ts`:

```typescript
// Per-layer generation — opaque output, layer-focused prompt.
export async function generateLayer(args: {
  layer:        'background' | 'environment' | 'featured' | 'ornaments' | 'people';
  prompt:       string;                 // layer-specific prompt
  renderBuffer: Buffer | null;          // null for background; pinned render for others
  styleRefs:    Buffer[];               // pinterest + project style refs
  pinterestCount: number;
}): Promise<Buffer>;

// Decomposition — single composition → N RGBA layers via Qwen-Image-Layered.
export async function decomposeIntoLayers(
  compositionBuffer: Buffer,
  expectedLayers: ('background'|'building'|'environment'|'featured'|'ornaments'|'people')[],
): Promise<Record<string, Buffer>>;     // { layer_type: transparent PNG buffer }
```

New file `lib/bria.ts`:

```typescript
// Background removal via Bria RMBG 2.0 (hosted on fal.ai).
export async function removeBackground(
  imageBuffer: Buffer,
  options?: { keepEdgesSoft?: boolean }
): Promise<Buffer>;  // transparent PNG
```

New file `lib/style-card.ts`:

```typescript
// Synthesize a designer-readable style card from all four layers of brand context.
export function buildStyleCard(
  brand: BrandDNA | null,
  projectBrand: ProjectBrandGuidelines | null,
  pinterestRefs: { url: string }[],
): {
  palette: { hex: string; role: string }[];
  mood: string[];
  voice: string;
  pinterestThumbnails: string[];
};
```

---

## New API surface

### `POST /api/posts/[id]/asset-pack`

Generate (or regenerate) the full asset pack.

**Request body:**
```json
{
  "path": "hybrid",
  "layers": ["background", "building", "environment", "featured", "people"]
}
```
- `path`: `"decompose"` | `"per-layer"` | `"hybrid"` (default: `"hybrid"`).
- `layers`: which layers to include (mandatory layers always generate; optional ones are explicit).

**Response:**
```json
{
  "assetPackId": "uuid",
  "status": "generating",
  "layers": [
    { "type": "background",  "imageId": "uuid", "url": "...", "status": "ready" },
    { "type": "building",    "imageId": "uuid", "url": "...", "status": "ready" },
    ...
  ],
  "compositeUrl": "..."
}
```

### `POST /api/posts/[id]/asset-pack/layers/[type]`

Regenerate a single layer with optional refined input.

**Request body:**
```json
{
  "refinementPrompt": "person should be jogging, mid-stride, in athletic wear",
  "referenceImageId": "optional-uuid"
}
```

### `GET /api/posts/[id]/asset-pack`

Fetch current active pack with all layers and their URLs (signed).

### `GET /api/posts/[id]/asset-pack/zip`

Stream a ZIP file containing all transparent PNGs + composite.jpg + style.json. Named files for designer ergonomics.

---

## Per-layer prompt design

Each layer prompt inherits **the full brand + project + Pinterest Inspo context** to keep style coherent across layers. Only the subject and framing change.

| Layer | Subject focus | Negative cues | Background handling |
|-------|--------------|---------------|--------------------|
| Background | "Wide environmental scene, [project setting], [time/weather]" | "no buildings, no architecture, no people" | Opaque output (no cutout) |
| Building | n/a — pinned render, only Bria RMBG applied | n/a | Bria cutout of pinned render |
| Environment | "Foreground/midground vegetation, paths, ground textures appropriate to [project]" | "no central building, no people, no sky" | Generate on neutral → Bria RMBG |
| Featured | "[featured element] as the sole subject, isolated, marketing-quality detail" | "no surrounding context, no buildings" | Generate on neutral → Bria RMBG |
| Ornaments | "[ornament list] arranged as compositional accents" | "no central subject, just objects" | Generate on neutral → Bria RMBG |
| People | "[person description] performing [action], full body, dynamic pose" | "no background, isolated subject" | Imagen on neutral → Bria RMBG |
| Composite | Full prompt = current render-anchored prompt | n/a | Opaque preview |

The **Style** tab is not a generation. It's `buildStyleCard()` — pure metadata synthesis from the user's already-existing brand DNA, project brand, and Pinterest Inspo. Zero API cost.

---

## UI design — Layered Studio panel

### Replaces the current "Generar" affordance on the post page

```
Post header (existing — idea, descripcion, texto en arte)
─────────────────────────────────────────────────────────
Pinterest Inspo gallery (existing, unchanged)
─────────────────────────────────────────────────────────

┌─ Capas del post ─────────────────────────────────────┐
│                                                       │
│  Estado del pack: ●●●●●○○○ (5 of 8 ready)            │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Fondo  │ Edificio │ Entorno │ Detalle │ Personas │ │ ← tabs
│  │  ●     │   ●      │   ●     │   ○     │    ●     │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌────────────────────┐  Notas para esta capa:        │
│  │                    │  ┌──────────────────────────┐ │
│  │   Layer preview    │  │ Person running on the    │ │
│  │   (transparent)    │  │ ciclovía at sunset...    │ │
│  │                    │  └──────────────────────────┘ │
│  └────────────────────┘                               │
│                                                       │
│  [Regenerar esta capa]  [Subir mi propia]  [↓ PNG]    │
│                                                       │
└───────────────────────────────────────────────────────┘

[Style card sidebar — palette + mood + Pinterest thumbnails]

─────────────────────────────────────────────────────────
[Generar pack completo]  [Descargar ZIP]
```

**Interaction principles:**
- All 7 image tabs visible at once — Fondo, Edificio, Entorno, Destacado, Ornamentos, Personas. Maximum discoverability so the designer immediately sees the full toolkit.
- Style card lives in a sidebar (not a tab) because it is metadata, not an image asset.
- Status dots tell the user at a glance which layers are ready / generating / absent.
- Per-tab notes field lets the user say "person should be jogging, not standing" before regenerating that layer.
- "Subir mi propia" lets the user replace any generated layer with her own PNG upload — important escape hatch.
- "Descargar ZIP" is the primary terminal action. The user is going to Photoshop.
- **No cost information of any kind in user UI** — no per-action prices, no "spent so far," no rate-limit warnings. Costs are operator-only (see `/admin/usage`).

**No emojis. No auto-stop on rating. Spanish copy.** Follows existing UX standards in memory.

---

## Phased delivery — atomic batches

Mirroring the pattern from the previous refactor: small, atomic, resumable.

| # | Batch | Output | Status |
|---|-------|--------|--------|
| 0 | DB migration: `asset_packs` table, `layer_type` + `asset_pack_id` on `images`, `api_usage_logs` table, `is_superuser` flag on `users` (or env allowlist) | Schema ready | ⬜ |
| 1 | `lib/api-usage.ts` — thin logging wrapper for every paid API call (Gemini, Imagen, Bria, Qwen); inserts a row into `api_usage_logs` | All paid calls logged | ⬜ |
| 2 | `lib/bria.ts` — Bria RMBG integration with env config, error handling, test fixture (wraps through `api-usage`) | Cutout function works + logged | ⬜ |
| 3 | `lib/google-image.ts` — `generateLayer()` for one non-trivial layer (Environment) end-to-end (wraps through `api-usage`) | Single-layer generation proven | ⬜ |
| 4 | `lib/google-image.ts` — `generateLayer()` for all remaining layers | Per-layer engine complete | ⬜ |
| 5 | `lib/google-image.ts` — `decomposeIntoLayers()` via Qwen-Image-Layered on fal.ai (wraps through `api-usage`) | Decomposition path proven | ⬜ |
| 6 | `lib/style-card.ts` — synthesize style card from existing brand data | Style card generation works | ⬜ |
| 7 | API: `POST /api/posts/[id]/asset-pack` (hybrid path) | Server can generate a pack | ⬜ |
| 8 | API: `POST /api/posts/[id]/asset-pack/layers/[type]` (per-layer regen) | Per-layer regen works | ⬜ |
| 9 | API: `GET /api/posts/[id]/asset-pack/zip` (named ZIP download) | Designer can download the pack | ⬜ |
| 10 | API: `GET /api/admin/usage` — list, filter, aggregate `api_usage_logs` with auth gate | Operator dashboard data layer | ⬜ |
| 11 | UI: tabbed Layered Studio panel on post page — all 7 image tabs visible (Background, Building, Environment, Featured, Ornaments, People), Style as sidebar; preview-only | Visible but read-only | ⬜ |
| 12 | UI: per-layer regenerate + replace-with-upload + per-layer notes | Full editing surface | ⬜ |
| 13 | UI: Style card sidebar (palette + mood + Pinterest thumbnails) | Style guidance visible | ⬜ |
| 14 | UI: Pack-level "Generar pack" + "Descargar ZIP" actions | Terminal flow complete | ⬜ |
| 15 | UI: `/admin/usage` page — total spend, per-project breakdown, per-model stats, recent calls log | Operator visibility complete | ⬜ |
| 16 | Cleanup: default new posts to layered output; legacy single-image route stays accessible but unlinked from UI | Layered becomes default | ⬜ |

Batches 0–10 are backend. Batches 11–15 are UI. Batch 16 is the cutover.

**Explicit non-goals for this refactor:**
- No PSD export (deferred — revisit only after adoption is verified).
- No backfill of existing posts (forward-only).
- No cost UI of any kind for end users (no caps, no warnings, no copy).

Each batch is independently committable. Implementation will mirror the previous refactor's pattern: an `IMPLEMENTATION_BATCHES_LAYERED.md` tracker that survives context compaction.

---

## Environment & cost decisions

**New environment variables:**
```
FAL_API_KEY                # for Qwen-Image-Layered + Bria RMBG (both hosted on fal.ai)
LAYERED_DEFAULT_PATH       # "hybrid" | "decompose" | "per-layer" (default: "hybrid")
LAYERED_DEFAULT_LAYERS     # comma-separated; default: background,building,environment,style
```

**Per-post budget projections (typical post — 5 layers):**
| Path | Estimated cost | Latency |
|------|---------------|---------|
| Hybrid first-pass (Gemini + Qwen) | $0.085 | ~30s |
| + 2 per-layer regens (typical iteration) | +$0.10 | +20s each |
| Total per refined post | ~$0.185 | ~70s |

For comparison, current production cost per post is $0.035. The increase buys layered output that the user actually uses; current single composite is being discarded by the user post-download.

---

## Compatibility with the recent refactor

The 2026-05-20 render-anchored refactor (Batches 0–10, just shipped) is fully preserved:

- The pinned render concept stays — it remains the structural anchor for the Building layer and for the hybrid path's first-pass composition.
- Pinterest Inspo + project style refs are still inputs — they feed every layer's prompt, the composition, and the style card.
- The current `generateFromRender` becomes the engine for the hybrid path's first composition (before decomposition).
- Existing posts with single-image output keep working. New posts default to layered output.
- The legacy single-image route stays accessible behind a `?legacy=true` query flag during the transition (Batch 13 makes layered the default).

Nothing about the prior refactor is wasted; it becomes the inner core of the new pipeline.

---

## Decisions confirmed (2026-05-20)

| # | Question | Decision |
|---|----------|----------|
| 1 | Default generation path | **Hybrid** — Gemini composition → Qwen decomposition by default; per-layer regen on demand |
| 2 | Default visible tabs | **All 7 image tabs visible** — Background, Building, Environment, Featured, Ornaments, People; Style as sidebar card. Maximum discoverability. |
| 3 | Background removal | **Bria RMBG 2.0 via fal.ai** — hosted, production-grade, ~$0.003/cutout |
| 4 | PSD export | **Skip for MVP** — ship ZIP of named PNGs. Revisit only if layered output is adopted. |
| 5 | Migration strategy | **Forward-only** — old posts keep their composite. New posts use packs. No backfill, no convert button. |
| 6 | Cost visibility | **No user-facing cost UI of any kind.** No caps, no warnings, no rate-limit copy. Build an operator-only superuser dashboard with complete API call logs, cost, latency, model, and per-post/per-user aggregation. See [[feedback-hide-costs-from-users]]. |

### Consequence of decision 6 — new infrastructure required

A separate concern enters the plan: **complete operational logging of every paid API call** (Gemini, Imagen, Bria, Qwen) so that the operator dashboard has real data.

- New table `api_usage_logs` with: `id, created_at, route, model, operation, input_tokens, output_tokens, image_count, cost_usd, latency_ms, post_id, project_id, asset_pack_id, layer_type, success, error_message`.
- Every code path that calls a paid API must log to this table — implemented as a thin wrapper around the API clients so it cannot be forgotten.
- New admin/superuser page at `/admin/usage` (or `/superuser/costs`) showing:
  - Total spend (today / this week / this month).
  - Per-project and per-post cost breakdown.
  - Per-model call counts and average latency.
  - Recent calls log with full detail (model, cost, latency, success/error).
  - Top spenders (which projects / posts / users drive cost).
- Access control: only Jorge's account sees this page. Out-of-band gate (env var allowlist or a `users.is_superuser` flag).

This adds three new batches to the implementation list (see updated batch table below).

---

## Success criteria

This pivot succeeds when:

1. The user opens Photoshop, drags the ZIP contents in, and her layer panel matches her mental model — no renaming or reorganizing needed.
2. She does not feel the urge to open Gemini for missing pieces.
3. Per-layer regeneration feels "free" — fast enough and cheap enough that she explores variations.
4. The style card eliminates the second-monitor Pinterest tab habit.
5. Adoption metric: posts with layered packs > posts with legacy composites within 30 days of Batch 13 ship.

If these hold, Bola8 stops being the tool she abandoned and becomes the tool she opens before Photoshop.
