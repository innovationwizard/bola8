import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { filename } = await request.json();

    const safeName = (filename as string).replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `brand-docs/${id}/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from('uploads')
      .createSignedUploadUrl(path);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ signedUrl: data.signedUrl, path });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}
