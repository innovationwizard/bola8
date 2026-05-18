// Shared brand types and prompt-building utilities.
// Both generate and regenerate routes import from here.

export interface BrandColor {
  name:  string;
  hex:   string;
  usage: string;
}

export interface BrandDNA {
  identity: {
    tagline:      string | null;
    mission:      string | null;
    positioning:  string | null;
  };
  colors: {
    primary:   BrandColor[];
    secondary: BrandColor[];
    neutrals:  BrandColor[];
    accent:    BrandColor[];
  };
  typography: {
    primary_font:     string | null;
    secondary_font:   string | null;
    hierarchy_notes:  string | null;
  };
  photography: {
    style:       string | null;
    mood:        string | null;
    lighting:    string | null;
    composition: string | null;
    subjects:    string | null;
    avoid:       string | null;
  };
  tone_of_voice: {
    personality: string | null;
    keywords:    string[];
    avoid:       string[];
  };
  visual_style: {
    aesthetic:        string | null;
    mood_descriptors: string[];
  };
  do_not: string[];
}

export interface ProjectBrandGuidelines {
  mood:                  string | null;
  target_audience:       string | null;
  key_differentiators:   string | null;
  photography_direction: string | null;
  atmosphere:            string | null;
  colors: {
    accent: BrandColor[];
  };
  do_not: string[];
}

export const EMPTY_BRAND_DNA: BrandDNA = {
  identity:      { tagline: null, mission: null, positioning: null },
  colors:        { primary: [], secondary: [], neutrals: [], accent: [] },
  typography:    { primary_font: null, secondary_font: null, hierarchy_notes: null },
  photography:   { style: null, mood: null, lighting: null, composition: null, subjects: null, avoid: null },
  tone_of_voice: { personality: null, keywords: [], avoid: [] },
  visual_style:  { aesthetic: null, mood_descriptors: [] },
  do_not:        [],
};

export const EMPTY_PROJECT_BRAND: ProjectBrandGuidelines = {
  mood:                  null,
  target_audience:       null,
  key_differentiators:   null,
  photography_direction: null,
  atmosphere:            null,
  colors:                { accent: [] },
  do_not:                [],
};

// Build the brand section of a generation prompt.
// Returns an empty string if neither brand object has meaningful content.
export function buildBrandPromptSection(
  brand:   BrandDNA | null,
  project: ProjectBrandGuidelines | null,
): string {
  const lines: string[] = [];

  if (brand) {
    const { photography, colors, visual_style, tone_of_voice, do_not } = brand;

    if (photography.style)       lines.push(`Photography style: ${photography.style}.`);
    if (photography.mood)        lines.push(`Photographic mood: ${photography.mood}.`);
    if (photography.lighting)    lines.push(`Lighting: ${photography.lighting}.`);
    if (photography.composition) lines.push(`Composition: ${photography.composition}.`);
    if (photography.subjects)    lines.push(`Subjects: ${photography.subjects}.`);

    const allColors = [
      ...colors.primary,
      ...colors.secondary,
      ...colors.accent,
    ];
    if (allColors.length > 0) {
      const palette = allColors.map(c => `${c.name} (${c.hex})`).join(', ');
      lines.push(`Brand color palette: ${palette}.`);
    }

    if (visual_style.aesthetic) lines.push(`Visual aesthetic: ${visual_style.aesthetic}.`);
    if (visual_style.mood_descriptors.length > 0)
      lines.push(`Mood: ${visual_style.mood_descriptors.join(', ')}.`);

    if (tone_of_voice.keywords.length > 0)
      lines.push(`Brand keywords to convey: ${tone_of_voice.keywords.join(', ')}.`);

    const brandDonts = [
      ...(photography.avoid ? [photography.avoid] : []),
      ...do_not,
    ];
    if (brandDonts.length > 0)
      lines.push(`Brand prohibitions — never include: ${brandDonts.join('; ')}.`);
  }

  if (project) {
    if (project.atmosphere)            lines.push(`Project atmosphere: ${project.atmosphere}.`);
    if (project.mood)                  lines.push(`Project mood: ${project.mood}.`);
    if (project.target_audience)       lines.push(`Target audience: ${project.target_audience}.`);
    if (project.photography_direction) lines.push(`Photography direction for this project: ${project.photography_direction}.`);
    if (project.key_differentiators)   lines.push(`Visual differentiators: ${project.key_differentiators}.`);

    if (project.colors.accent.length > 0) {
      const palette = project.colors.accent.map(c => `${c.name} (${c.hex})`).join(', ');
      lines.push(`Project accent colors: ${palette}.`);
    }

    if (project.do_not.length > 0)
      lines.push(`Project-specific prohibitions: ${project.do_not.join('; ')}.`);
  }

  return lines.join(' ');
}

// Extraction prompt for project-specific brand guidelines.
export const PROJECT_BRAND_EXTRACTION_PROMPT = `You are a brand identity extraction specialist analyzing project-specific creative briefs, mood boards, and brand documents for a real-estate development.

Extract every piece of project-specific visual direction present in the provided files and return it as valid JSON matching this exact schema. Extract only what is explicitly stated or clearly demonstrated. Do not invent or infer data not present in the materials. Use null for missing strings and [] for missing arrays.

Return ONLY the JSON object, no markdown, no explanation:

{
  "mood": "string or null",
  "target_audience": "string or null",
  "key_differentiators": "string or null",
  "photography_direction": "string or null",
  "atmosphere": "string or null",
  "colors": {
    "accent": [{ "name": "string", "hex": "#rrggbb", "usage": "string" }]
  },
  "do_not": ["string"]
}`;

// The extraction prompt sent to Gemini when parsing brand documents.
export const BRAND_EXTRACTION_PROMPT = `You are a brand identity extraction specialist analyzing brand guideline documents.

Extract every piece of brand identity information present in the provided files and return it as valid JSON matching this exact schema. Extract only what is explicitly stated or clearly demonstrated. Do not invent or infer data not present in the materials. Use null for missing strings and [] for missing arrays.

Return ONLY the JSON object, no markdown, no explanation:

{
  "identity": {
    "tagline": "string or null",
    "mission": "string or null",
    "positioning": "string or null"
  },
  "colors": {
    "primary":   [{ "name": "string", "hex": "#rrggbb", "usage": "string" }],
    "secondary": [{ "name": "string", "hex": "#rrggbb", "usage": "string" }],
    "neutrals":  [{ "name": "string", "hex": "#rrggbb", "usage": "string" }],
    "accent":    [{ "name": "string", "hex": "#rrggbb", "usage": "string" }]
  },
  "typography": {
    "primary_font":    "string or null",
    "secondary_font":  "string or null",
    "hierarchy_notes": "string or null"
  },
  "photography": {
    "style":       "string or null",
    "mood":        "string or null",
    "lighting":    "string or null",
    "composition": "string or null",
    "subjects":    "string or null",
    "avoid":       "string or null"
  },
  "tone_of_voice": {
    "personality": "string or null",
    "keywords":    ["string"],
    "avoid":       ["string"]
  },
  "visual_style": {
    "aesthetic":        "string or null",
    "mood_descriptors": ["string"]
  },
  "do_not": ["string"]
}`;
