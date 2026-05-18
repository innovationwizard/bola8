import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { extractBrandFromDocuments } from '@/lib/google-image';
import { BRAND_EXTRACTION_PROMPT, EMPTY_BRAND_DNA, type BrandDNA } from '@/lib/brand';

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

    const clientRes = await query(`SELECT id, name FROM clients WHERE id = $1`, [id]);
    if (!clientRes.rows.length)
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Receive storage paths + mime types uploaded directly from the browser.
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

    console.log(`[brand/parse] ${inlineFiles.length} file(s) for client ${id}`);

    const rawJson = await extractBrandFromDocuments(BRAND_EXTRACTION_PROMPT, inlineFiles);

    let extracted: BrandDNA;
    try {
      extracted = JSON.parse(rawJson) as BrandDNA;
    } catch {
      console.error('[brand/parse] Gemini returned invalid JSON:', rawJson.slice(0, 500));
      return NextResponse.json(
        { error: 'La IA devolvió datos malformados. Intenta de nuevo.' },
        { status: 502 }
      );
    }

    const merged: BrandDNA = {
      identity:      { ...EMPTY_BRAND_DNA.identity,      ...(extracted.identity      ?? {}) },
      colors:        { ...EMPTY_BRAND_DNA.colors,        ...(extracted.colors        ?? {}) },
      typography:    { ...EMPTY_BRAND_DNA.typography,    ...(extracted.typography    ?? {}) },
      photography:   { ...EMPTY_BRAND_DNA.photography,   ...(extracted.photography   ?? {}) },
      tone_of_voice: { ...EMPTY_BRAND_DNA.tone_of_voice, ...(extracted.tone_of_voice ?? {}) },
      visual_style:  { ...EMPTY_BRAND_DNA.visual_style,  ...(extracted.visual_style  ?? {}) },
      do_not:        extracted.do_not ?? [],
    };

    await query(
      `UPDATE clients SET brand_dna = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(merged), id]
    );

    return NextResponse.json({ brand_dna: merged });
  } catch (err) {
    console.error('[brand/parse] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Brand extraction failed' },
      { status: 500 }
    );
  }
}
