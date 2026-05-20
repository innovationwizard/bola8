/**
 * Style card — designer-readable synthesis of the four style sources:
 *
 *   1. Client brand DNA   (corporate-wide)
 *   2. Project brand      (project-specific)
 *   3. Pinterest Inspo    (post-specific)
 *
 * Output is metadata, not an image. Stored in asset_packs.style_card (JSONB)
 * and rendered in the UI as a sidebar card: palette swatches + mood notes +
 * voice extract + Pinterest thumbnails. The designer uses it as reference
 * when applying adjustment layers in Photoshop.
 *
 * Pure function — no API calls, no DB queries. Safe to call freely.
 */

import type { BrandDNA, ProjectBrandGuidelines } from './brand';

export interface StyleCardSwatch {
  hex:   string;
  role:  string;   // human-readable Spanish label (e.g. 'Corporativo · acento')
  name?: string;   // optional color name from brand definition
}

export interface StyleCard {
  palette:             StyleCardSwatch[];
  mood:                string[];   // short phrases, deduped, max 6
  voice:               string;     // one-line tone summary
  pinterestThumbnails: string[];   // post Pinterest Inspo URLs
}

const MAX_MOOD_PHRASES = 6;

export function buildStyleCard(
  brand:         BrandDNA               | null,
  projectBrand:  ProjectBrandGuidelines | null,
  pinterestRefs: { url: string }[]      = [],
): StyleCard {
  const palette: StyleCardSwatch[] = [];

  if (brand) {
    for (const c of brand.colors.primary)
      palette.push({ hex: c.hex, role: 'Corporativo · primario',   name: c.name });
    for (const c of brand.colors.secondary)
      palette.push({ hex: c.hex, role: 'Corporativo · secundario', name: c.name });
    for (const c of brand.colors.accent)
      palette.push({ hex: c.hex, role: 'Corporativo · acento',     name: c.name });
    for (const c of brand.colors.neutrals)
      palette.push({ hex: c.hex, role: 'Corporativo · neutral',    name: c.name });
  }

  if (projectBrand) {
    for (const c of projectBrand.colors.accent)
      palette.push({ hex: c.hex, role: 'Proyecto · acento', name: c.name });
  }

  const mood = uniqueTrimmed(
    [
      brand?.photography.mood,
      brand?.visual_style.aesthetic,
      ...(brand?.visual_style.mood_descriptors ?? []),
      projectBrand?.atmosphere,
      projectBrand?.mood,
    ],
    MAX_MOOD_PHRASES,
  );

  const voiceParts: string[] = [];
  if (brand?.tone_of_voice.personality) voiceParts.push(brand.tone_of_voice.personality);
  if (brand?.tone_of_voice.keywords.length)
    voiceParts.push(brand.tone_of_voice.keywords.join(', '));
  const voice = voiceParts.join(' — ');

  return {
    palette,
    mood,
    voice,
    pinterestThumbnails: pinterestRefs.map((r) => r.url),
  };
}

function uniqueTrimmed(
  values: Array<string | null | undefined>,
  limit:  number,
): string[] {
  const seen: Set<string> = new Set();
  const out:  string[]    = [];
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}
