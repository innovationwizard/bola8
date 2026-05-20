# Implementation Batches — Layered Asset Studio Refactor

_Created: 2026-05-20_
_Plan: [docs/PLAN_LAYERED_WORKFLOW.md](PLAN_LAYERED_WORKFLOW.md)_
_Audit: [docs/AUDIT_LAYERED_WORKFLOW_GAPS.md](AUDIT_LAYERED_WORKFLOW_GAPS.md)_
_Research: [docs/RESEARCH_LAYERED_GENERATION.md](RESEARCH_LAYERED_GENERATION.md)_

## How to use this file

Each batch is atomic — one clear unit of work, independently committable. After each batch completes, status changes to ✅ DONE.

If context is lost mid-implementation, **READ THIS FILE FIRST** to know exactly where to resume. Find the first ⬜ PENDING row and continue from there. Never skip a batch or combine batches.

---

## Operating constraints (must hold throughout)

1. **FAL_API_KEY may be missing at any time.** Every code path that needs FAL must check `FAL_AVAILABLE` and degrade gracefully without throwing.
2. **No cost UI for end users.** Costs go to `api_usage_logs` only. The `/admin/usage` page is the operator surface.
3. **All paid API calls pass through `lib/api-usage.ts`.** No direct SDK calls bypass logging.
4. **Forward-only migration.** Existing posts keep their single-image output. Layered studio applies to new pack generations only.
5. **Spanish for user-facing copy. No emojis.** Lucide icons only.
6. **All images 1080×1350.** Constants in `lib/google-image.ts`.
7. **The render-anchored refactor stays intact.** `generateFromRender()` becomes the engine inside the hybrid path's first composition step. Do not break or replace it.

---

## Decisions (locked 2026-05-20)

| # | Decision |
|---|----------|
| 1 | Hybrid generation path: Gemini composition → Qwen decomposition; per-layer regen on demand |
| 2 | All 7 image tabs visible (Fondo, Edificio, Entorno, Destacado, Ornamentos, Personas); Style as sidebar |
| 3 | Bria RMBG 2.0 via fal.ai for background removal |
| 4 | Skip PSD export (ZIP only) |
| 5 | Forward-only migration — no backfill, no convert button |
| 6 | No user-facing cost UI; build operator dashboard at /admin/usage with Supabase auth + SUPERUSER_EMAILS env var gate |

---

## Batch Status

### Phase A — Backend foundation (no FAL needed)

| # | Batch | Status |
|---|-------|--------|
| A1 | DB migration: `asset_packs`, `images` columns, `posts.active_asset_pack_id`, `api_usage_logs` | ✅ DONE |
| A2 | `lib/api-usage.ts` — logging primitive + pricing constants table | ✅ DONE |
| A3 | Wire `api-usage` into existing Google API functions (instrumentation only, no behavior change) | ✅ DONE |
| A4 | `lib/style-card.ts` — pure synthesis function (no API calls) | ✅ DONE |
| A5 | `lib/superuser.ts` — Supabase auth check + SUPERUSER_EMAILS allowlist | ✅ DONE |

### Phase B — FAL integration with graceful fallback

| # | Batch | Status |
|---|-------|--------|
| B1 | `lib/fal.ts` — FAL_AVAILABLE constant + client init helper + fal API wrapper | ✅ DONE |
| B2 | `lib/bria.ts` — `removeBackground()` with graceful fallback (returns input unchanged if !FAL_AVAILABLE) | ✅ DONE |
| B3 | `lib/qwen-layered.ts` — `decomposeIntoLayers()` with graceful fallback (returns null if !FAL_AVAILABLE) | ✅ DONE |

### Phase C — Per-layer generation (opaque output, FAL optional for cutout)

| # | Batch | Status |
|---|-------|--------|
| C1 | `lib/google-image.ts` — `generateBackgroundLayer()` — Imagen text-to-image, no buildings | ⬜ PENDING |
| C2 | `lib/google-image.ts` — `generateEnvironmentLayer()` — Gemini composition, vegetation | ⬜ PENDING |
| C3 | `lib/google-image.ts` — `generateFeaturedLayer()` — Gemini composition, featured element | ⬜ PENDING |
| C4 | `lib/google-image.ts` — `generateOrnamentsLayer()` — Gemini composition, ornamental objects | ⬜ PENDING |
| C5 | `lib/google-image.ts` — `generatePeopleLayer()` — Imagen on neutral bg + Bria | ⬜ PENDING |
| C6 | `lib/google-image.ts` — `getBuildingLayer()` — pinned render passed through Bria | ⬜ PENDING |

### Phase D — Asset pack API surface

| # | Batch | Status |
|---|-------|--------|
| D1 | `POST /api/posts/[id]/asset-pack` — orchestrate hybrid pipeline (composition + decompose OR per-layer fallback) | ⬜ PENDING |
| D2 | `GET /api/posts/[id]/asset-pack` — fetch active pack with signed URLs per layer | ⬜ PENDING |
| D3 | `POST /api/posts/[id]/asset-pack/layers/[type]` — single-layer regeneration | ⬜ PENDING |
| D4 | `GET /api/posts/[id]/asset-pack/zip` — stream ZIP of named layer PNGs + composite + style.json | ⬜ PENDING |

### Phase E — Operator dashboard

| # | Batch | Status |
|---|-------|--------|
| E1 | `GET /api/admin/usage` — aggregations (totals, per-project, per-model, daily/weekly/monthly) | ⬜ PENDING |
| E2 | `GET /api/admin/usage/calls` — paginated recent calls list with full detail | ⬜ PENDING |
| E3 | UI page `/admin/usage` — totals + breakdowns + recent calls table + FAL availability indicator | ⬜ PENDING |

### Phase F — User UI: Layered Studio

| # | Batch | Status |
|---|-------|--------|
| F1 | New component `AssetPackPanel.tsx` — tab structure (7 tabs + sidebar slot), read-only scaffolding | ⬜ PENDING |
| F2 | Wire `AssetPackPanel` into post detail page (below Pinterest Inspo, above ImageVersionNavigator) | ⬜ PENDING |
| F3 | Per-tab preview rendering (layer image + status dot) | ⬜ PENDING |
| F4 | Per-layer "Regenerar esta capa" button + per-layer notes field | ⬜ PENDING |
| F5 | Per-layer "Subir mi propia" upload-replace flow | ⬜ PENDING |
| F6 | Pack-level "Generar pack completo" + "Descargar ZIP" actions | ⬜ PENDING |
| F7 | Style card sidebar (palette swatches + mood text + Pinterest thumbnails) | ⬜ PENDING |

### Phase G — Cutover

| # | Batch | Status |
|---|-------|--------|
| G1 | New posts default to layered output (single-image generate still reachable as legacy) | ⬜ PENDING |
| G2 | Documentation pass: changelog entry + update master workflow memory | ⬜ PENDING |

---

## Resume Instructions (if context is lost)

1. Read this file. Find the first `⬜ PENDING` batch.
2. Read [PLAN_LAYERED_WORKFLOW.md](PLAN_LAYERED_WORKFLOW.md) for the architectural context.
3. Read [AUDIT_LAYERED_WORKFLOW_GAPS.md](AUDIT_LAYERED_WORKFLOW_GAPS.md) for the gap analysis behind that batch.
4. Read the memory files for project context — especially:
   - `feedback_hide_costs_from_users.md` — never put cost UI in front of users
   - `feedback_professional_ux.md` — no emojis, Lucide icons, user controls when done
   - `feedback_tone_and_soul.md` — Spanish, poetic, warm
   - `project_master_workflow.md` — 4-layer prompt architecture (still authoritative)
   - `feedback_git_workflow.md` — never run git commit; stage and stop
5. Implement the next PENDING batch only. Mark it ✅ DONE when complete.
6. Never skip a batch or combine batches.
7. Before any FAL-dependent code: re-read the operating constraint "FAL_API_KEY may be missing" — every FAL path must degrade gracefully.

---

## Verification per batch (mandatory checks)

Before marking a batch DONE:

- **DB batch (A1):** Migration runs cleanly via `node scripts/migrate.js`. New tables/columns exist. Existing routes still work.
- **Library batch (A2–A5, B1–B3, C1–C6):** TypeScript compiles. No runtime import errors. If a function is callable in isolation, test it via a small script (don't commit the test).
- **API batch (D1–D4, E1–E2):** Route returns expected JSON shape. Auth middleware still applies. Error paths return appropriate status codes.
- **UI batch (E3, F1–F7):** Component renders without console errors. Spanish copy. No emojis. Loading + empty + error states all present.
- **Cutover batch (G1, G2):** No regression in existing post detail pages. Legacy single-image flow remains accessible.

---

## Glossary

- **Asset pack** — Grouping of layers for one post. Each pack has multiple layer images + a composite preview + a style card.
- **Layer** — One of: `background`, `building`, `environment`, `featured`, `ornaments`, `people`, `composite`.
- **Hybrid path** — Default generation strategy: one Gemini composition → Qwen-Image-Layered decomposition → per-layer regen on demand.
- **FAL_AVAILABLE** — Boolean: `!!process.env.FAL_API_KEY`. Computed once at module init.
- **Operator** — Jorge (or anyone in SUPERUSER_EMAILS). Sees `/admin/usage`. End users do not.
