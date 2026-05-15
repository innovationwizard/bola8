import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { extractBrandFromDocuments } from '@/lib/google-image';
import { BRAND_EXTRACTION_PROMPT, EMPTY_BRAND_DNA, type BrandDNA } from '@/lib/brand';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB — Gemini inline data limit

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify client exists.
    const clientRes = await query(`SELECT id, name FROM clients WHERE id = $1`, [id]);
    if (!clientRes.rows.length)
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0)
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });

    // Validate and convert files to base64 inline data.
    const inlineFiles: { mimeType: string; data: string }[] = [];

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}. Accepted: PDF, JPEG, PNG, WEBP.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds the 20 MB limit.` },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      inlineFiles.push({ mimeType: file.type, data: buffer.toString('base64') });
    }

    console.log(`[brand/parse] Extracting brand DNA from ${inlineFiles.length} file(s) for client ${id}`);

    const rawJson = await extractBrandFromDocuments(BRAND_EXTRACTION_PROMPT, inlineFiles);

    let extracted: BrandDNA;
    try {
      extracted = JSON.parse(rawJson) as BrandDNA;
    } catch {
      console.error('[brand/parse] Gemini returned invalid JSON:', rawJson.slice(0, 500));
      return NextResponse.json(
        { error: 'AI returned malformed data. Please try again.' },
        { status: 502 }
      );
    }

    // Merge with the empty template so all keys are always present.
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
