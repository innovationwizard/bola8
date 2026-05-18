import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { extractBrandFromDocuments } from '@/lib/google-image';
import {
  PROJECT_BRAND_EXTRACTION_PROMPT,
  EMPTY_PROJECT_BRAND,
  type ProjectBrandGuidelines,
} from '@/lib/brand';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const projectRes = await query(`SELECT id FROM projects WHERE id = $1`, [id]);
    if (!projectRes.rows.length)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const { files }: { files: { path: string; mimeType: string }[] } = await request.json();

    if (!files?.length)
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });

    const inlineFiles: { mimeType: string; data: string }[] = [];

    for (const { path, mimeType } of files) {
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json(
          { error: `Tipo de archivo no admitido: ${mimeType}. Acepta: PDF, JPEG, PNG, WEBP.` },
          { status: 400 }
        );
      }

      const { data: blob, error: dlError } = await supabase.storage
        .from('uploads')
        .download(path);
      if (dlError) throw new Error(`Storage download failed: ${dlError.message}`);

      const buffer = Buffer.from(await blob.arrayBuffer());
      inlineFiles.push({ mimeType, data: buffer.toString('base64') });
    }

    console.log(`[projects/brand/parse] ${inlineFiles.length} file(s) for project ${id}`);

    const rawJson = await extractBrandFromDocuments(PROJECT_BRAND_EXTRACTION_PROMPT, inlineFiles);

    let extracted: ProjectBrandGuidelines;
    try {
      extracted = JSON.parse(rawJson) as ProjectBrandGuidelines;
    } catch {
      console.error('[projects/brand/parse] Gemini returned invalid JSON:', rawJson.slice(0, 500));
      return NextResponse.json(
        { error: 'La IA devolvió datos malformados. Intenta de nuevo.' },
        { status: 502 }
      );
    }

    const merged: ProjectBrandGuidelines = {
      mood:                  extracted.mood                  ?? EMPTY_PROJECT_BRAND.mood,
      target_audience:       extracted.target_audience       ?? EMPTY_PROJECT_BRAND.target_audience,
      key_differentiators:   extracted.key_differentiators   ?? EMPTY_PROJECT_BRAND.key_differentiators,
      photography_direction: extracted.photography_direction ?? EMPTY_PROJECT_BRAND.photography_direction,
      atmosphere:            extracted.atmosphere            ?? EMPTY_PROJECT_BRAND.atmosphere,
      colors:                { accent: extracted.colors?.accent ?? [] },
      do_not:                extracted.do_not                ?? [],
    };

    await query(
      `UPDATE projects SET brand_guidelines = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(merged), id]
    );

    return NextResponse.json({ brand_guidelines: merged });
  } catch (err) {
    console.error('[projects/brand/parse] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Brand extraction failed' },
      { status: 500 }
    );
  }
}
