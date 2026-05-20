# Layered Asset Studio

**Date:** 2026-05-20 (continuation of the render-anchored refactor that landed earlier the same day)
**Commits:** 34 atomic batches across `main` (A1 → G2)
**Status:** Complete — all batches shipped

---

## Why this was built

The render-anchored refactor (earlier on 2026-05-20) fixed the "wrong building, wrong style" failure mode by feeding the pinned project render to Gemini as a structural anchor. But the user — watched working in real time — was still abandoning Bola8 for Photoshop. The reason was structural, not stylistic: she works in **layers**. Bola8 was producing one composed image. She wanted the parts.

The pivot:

- Bola8 stops trying to be the final compositor.
- The deliverable becomes a **layered asset pack** that drops into Photoshop.
- Each layer is its own PNG with a semantic name (`background.png`, `building.png`, `people.png`, …).
- The designer composes the final image herself, with full control over scale, position, blending, and color grading.

This matches the 2026 industry standard for AI-augmented architectural visualization (per `docs/RESEARCH_LAYERED_GENERATION.md`): hybrid pipelines where AI handles speed at the front and Photoshop handles precision at the back. The user wasn't being unreasonable; she was on the standard path.

---

## What changed

### Database

Migration `scripts/migration_002_layered_studio.sql`:

- `asset_packs` table — groups all layers for one post generation event.
  - Columns: `post_id`, `project_id`, `status` (pending/generating/ready/failed/partial), `generation_path` (decompose/per-layer/hybrid), `style_card` JSONB, `parent_pack_id`, timestamps.
- `images.asset_pack_id` + `images.layer_type` — each layer image is a row linked to its pack. `layer_type` constrained to one of: background, building, environment, featured, ornaments, people, composite.
- `posts.active_asset_pack_id` — points at the most recently built pack for fast reads.
- `api_usage_logs` table — operator-only audit trail. Every paid API call (Google Imagen, Gemini, fal.ai Bria, fal.ai Qwen) lands here with model, operation, cost USD, latency, success/error, and post/project/pack/layer linkage.

### Library — orchestration & primitives

- `lib/api-usage.ts` — pricing constants table (per-call USD) + `logApiCall()` (fire-and-forget DB insert, never blocks the API call) + `withUsageLogging()` wrapper that times an async fn and logs success or failure.
- `lib/fal.ts` — `@fal-ai/client` initialization gated behind `FAL_AVAILABLE = !!process.env.FAL_API_KEY`. Module loads cleanly even when the key is missing.
- `lib/bria.ts` — `removeBackground()` via Bria RMBG 2.0. **Graceful fallback**: when FAL is missing or Bria fails, re-encodes the input as opaque PNG and returns with `transparencyApplied: false`. Never throws.
- `lib/qwen-layered.ts` — `decomposeIntoLayers()` via Qwen-Image-Layered. Returns `null` when FAL is missing or qwen fails; hybrid orchestrator detects null and falls back to per-layer.
- `lib/style-card.ts` — `buildStyleCard()` pure synthesis from BrandDNA + ProjectBrandGuidelines + Pinterest refs → `{ palette, mood, voice, pinterestThumbnails }`.
- `lib/superuser.ts` — `isSuperuser()` / `requireSuperuser()` checking Supabase auth + `SUPERUSER_EMAILS` env allowlist.
- `lib/asset-pack-builder.ts` — the orchestration core. Three exports:
  - `createAssetPackPerLayer()` — generates all 7 layers in parallel via `Promise.all` with per-job try/catch isolation; tolerates partial failure (pack ends up `partial`, individual failed layers can be regenerated later).
  - `createAssetPackHybrid()` — Gemini composition → Qwen decompose → upload; falls back to per-layer when Qwen returns null. Building always sourced from pinned render via Bria, never trusted to Qwen.
  - `regenerateLayer()` — replaces a single layer in place; canonical storage path overwritten, images row swapped.
- `lib/google-image.ts` — six new per-layer generators (`generateBackgroundLayer`, `generateEnvironmentLayer`, `generateFeaturedLayer`, `generateOrnamentsLayer`, `generatePeopleLayer`) each wrapping Imagen + optional `applyStyleReferences` with layer-specific framing prompts. All 5 existing Google API functions now route through `withUsageLogging`.

### API surface — asset packs

- `POST /api/posts/[id]/asset-pack` — build a new pack (hybrid by default, falls back to per-layer when needed).
- `GET  /api/posts/[id]/asset-pack` — fetch the active pack with both signed inline URLs (for `<img>`) and signed attachment URLs (for the download button) per layer.
- `POST /api/posts/[id]/asset-pack/layers/[type]` — regenerate a single layer; optional `refinementPrompt` body.
- `PUT  /api/posts/[id]/asset-pack/layers/[type]` — register a user-uploaded layer after direct PUT to Supabase.
- `POST /api/posts/[id]/asset-pack/layers/[type]/upload-url` — mint a signed Supabase upload URL for the layer's canonical path.

No bulk-ZIP endpoint. The designer downloads layers individually via per-tab "Descargar PNG" buttons that use `Content-Disposition: attachment; filename=<layer>.png` signed URLs.

### API surface — admin

- `GET /api/admin/usage` — aggregations: totals (today/week/month/lifetime), byProvider, byModel (30d), topProjects (30d top 10), FAL availability flag.
- `GET /api/admin/usage/calls?page=N` — paginated calls list, 20 per page, most recent first.
- Both gated by `requireSuperuser()`.

### UI

- `app/components/AssetPackPanel.tsx` — the new Layered Studio surface on the post detail page. Composite preview thumbnail + 6 layer tabs (Fondo, Edificio, Entorno, Destacado, Ornamentos, Personas) + Style card sidebar. Per-tab actions: notes textarea + Regenerar / Generar button + Subir mi propia upload + Descargar PNG. Generation progress banner with `~Ns restantes` countdown + fill bar (60s estimate). Per-layer status dots, checkerboard background under transparent layers, sticky style sidebar.
- `app/admin/usage/page.tsx` + `UsageDashboard.tsx` — operator dashboard. Totals cards, provider/project/model tables, paginated recent calls with Prev/Next, FAL availability indicator, Refrescar button. Server-side `isSuperuser()` gate with `notFound()` on fail so non-operators can't discover the page exists.
- Campaign page — replaced the legacy "Generar" button with a single "Abrir" / "Refinar" link that routes to the post detail page. The legacy single-image generate flow is no longer a UI entry point.
- Post detail page — `AssetPackPanel` placed between Pinterest Inspo and the legacy `ImageVersionNavigator`. The legacy navigator now only renders when the post has a legacy single image (`image_id`); no more misleading empty state.

### Memory / behavioral rules added

- **Hide costs from users** — no cost UI for end users ever. Operator dashboard absorbs the cost-visibility load.
- **Phase completion summary** — when a phase of a multi-phase plan ships, show the standard phase-totals list with ✅ markers.
- **Show progress for long ops** — any user-facing wait >5s needs a roughly realistic progress indicator (countdown, fill, step count). Spinners alone read as "frozen."

---

## Operating constraints honored throughout

1. **FAL_API_KEY may be missing.** Every FAL-dependent path checks `FAL_AVAILABLE` and degrades gracefully. Packs still build end-to-end without FAL; layers come out opaque.
2. **No cost UI for end users.** Costs flow into `api_usage_logs` only.
3. **All paid API calls pass through `withUsageLogging`.** Nothing bypasses logging.
4. **Forward-only migration.** No backfill of old posts. Existing legacy single-image posts continue to work; new posts use the layered studio.
5. **Spanish for user-facing copy. No emojis. Lucide icons only.**
6. **All images 1080×1350.** Constants in `lib/google-image.ts`.
7. **The render-anchored refactor stays intact.** `generateFromRender()` is preserved and used as the engine for the hybrid path's composition step + the composite layer in the per-layer path.

---

## Cost projections (operator-facing)

| Path | Typical cost | Typical latency |
|------|--------------|------------------|
| Hybrid (default) | ~$0.085 / pack | ~30–60s |
| Per-layer (fallback) | ~$0.20–$0.28 / pack | ~40–60s |
| Single-layer regeneration | ~$0.035–$0.063 | ~10–20s |
| Manual upload-replace | $0.003 (Bria N/A — file is user-supplied) | < 5s |

Compared to the previous all-in-one composition (~$0.035), the daily-flow cost roughly doubles on the hybrid path, in exchange for output the designer actually uses.

---

## Files changed summary

| File | Change |
|------|--------|
| `scripts/migration_002_layered_studio.sql` | New — DB migration |
| `lib/api-usage.ts` | New — pricing constants + logging primitive |
| `lib/fal.ts` | New — fal.ai client init |
| `lib/bria.ts` | New — `removeBackground()` + `getBuildingLayer()` |
| `lib/qwen-layered.ts` | New — `decomposeIntoLayers()` |
| `lib/style-card.ts` | New — style card synthesis |
| `lib/superuser.ts` | New — Supabase auth + SUPERUSER_EMAILS allowlist |
| `lib/asset-pack-builder.ts` | New — orchestration core (types, storage, DB, per-layer, hybrid, regenerateLayer) |
| `lib/google-image.ts` | 5 layer generators added; 5 existing functions wrapped with `withUsageLogging` |
| `lib/db/index.ts` | `QueryParam` widened to allow `string[]`, `number[]`, `Buffer`, `Date` |
| `lib/db/image-storage.ts` | `render_anchored` + `post_id` added to `ImageMetadata` |
| `app/api/posts/[id]/asset-pack/route.ts` | New — POST (build) + GET (fetch active) |
| `app/api/posts/[id]/asset-pack/layers/[type]/route.ts` | New — POST (regen) + PUT (register upload) |
| `app/api/posts/[id]/asset-pack/layers/[type]/upload-url/route.ts` | New — signed upload URL |
| `app/api/admin/usage/route.ts` | New — aggregations |
| `app/api/admin/usage/calls/route.ts` | New — paginated calls |
| `app/admin/usage/page.tsx` + `UsageDashboard.tsx` | New — operator dashboard |
| `app/components/AssetPackPanel.tsx` | New — Layered Studio UI |
| `app/projects/[id]/page.tsx` | Legacy Generar button replaced with Abrir/Refinar link |
| `app/projects/[id]/posts/[postId]/page.tsx` | AssetPackPanel wired in; legacy empty state removed |
| 4 existing route files | `withUsageLogging` context threaded through |
| `docs/RESEARCH_LAYERED_GENERATION.md` | New — industry research findings |
| `docs/AUDIT_LAYERED_WORKFLOW_GAPS.md` | New — gap analysis |
| `docs/PLAN_LAYERED_WORKFLOW.md` | New — implementation plan |
| `docs/IMPLEMENTATION_BATCHES_LAYERED.md` | New — 34-batch tracker |

---

## What's next

The cutover is complete. Practical next steps live outside the refactor itself:

- Add `FAL_API_KEY` to production env to activate transparency + Qwen decomposition.
- Add `SUPERUSER_EMAILS=jorgeluiscontrerasherrera@gmail.com` to production env to access `/admin/usage`.
- Test with a real post on Bosque Las Tapias — the original failure case that triggered the entire refactor sequence.
- Watch the dashboard for a few days to confirm hybrid cost and latency match projections.
- Revisit PSD export if/when adoption is validated.
