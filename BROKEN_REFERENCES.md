# Broken References

Tracking dangling references created during the `latina` → `Bola8` rename.

## Deleted assets

- `public/LATINABLUE.png` — hard-deleted on 2026-04-24. No replacement file exists at `public/BOLA8BLUE.png`.

## Dangling references to `/BOLA8BLUE.png`

The text rename rewrote every `LATINABLUE` reference to `BOLA8BLUE`, but the underlying image file was deleted rather than renamed. Each reference below now points at a non-existent asset and will 404 at runtime.

| File | Line | Context | Impact |
| --- | --- | --- | --- |
| [app/layout.tsx](app/layout.tsx#L21) | 21 | `icon: "/BOLA8BLUE.png"` | Favicon 404 |
| [app/layout.tsx](app/layout.tsx#L22) | 22 | `shortcut: "/BOLA8BLUE.png"` | Shortcut icon 404 |
| [app/layout.tsx](app/layout.tsx#L23) | 23 | `apple: "/BOLA8BLUE.png"` | Apple touch icon 404 |
| [app/page.tsx](app/page.tsx#L12) | 12 | `src="/BOLA8BLUE.png"` | Broken `<img>`/`<Image>` on landing page |

## Documentation mention (not a runtime reference, but stale)

- [docs/controlnet-compatibility.md:108](docs/controlnet-compatibility.md#L108) — "using `BOLA8BLUE` for favicon/OG". The asset no longer exists; the line is now historically inaccurate.

## Resolution options

1. Provide a new `public/BOLA8BLUE.png` (or whatever final filename is chosen) and update the references to match.
2. Replace each reference with a different existing asset.
3. Remove the references entirely (drop favicon metadata and the landing-page image).
