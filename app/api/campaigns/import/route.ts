import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { query } from '@/lib/db';

type RawPost = {
  post_number: number;
  fecha_raw: string;
  idea: string;
  caption: string;
  texto_en_arte: string;
  hashtags: string;
  formato: string;
  plataforma: string;
  proyecto: string;
  estatus: string;
};

// The XLSX content plan has this structure per post:
// Main row:  col[9]=number, col[10]="Fecha", col[11]=date, col[12]=idea, col[13]=caption, col[14]=texto_en_arte, col[15]=hashtags
// Sub-rows:  col[9]="",     col[10]=key,      col[11]=value  (Proyecto, Plataforma, Formato, Estatus)
function parseSheet(rows: unknown[][]): RawPost[] {
  const posts: RawPost[] = [];
  let current: Partial<RawPost> | null = null;

  for (const row of rows) {
    const c9  = row[9];
    const c10 = row[10] != null ? String(row[10]).trim() : '';
    const c11 = row[11] != null ? String(row[11]).trim() : '';
    const c12 = row[12] != null ? String(row[12]).trim() : '';
    const c13 = row[13] != null ? String(row[13]).trim() : '';
    const c14 = row[14] != null ? String(row[14]).trim() : '';
    const c15 = row[15] != null ? String(row[15]).trim() : '';

    const isPostHeader =
      c9 != null && c9 !== '' && !isNaN(Number(c9)) && Number(c9) > 0 && c10 === 'Fecha';

    if (isPostHeader) {
      if (current?.proyecto) posts.push(current as RawPost);
      current = {
        post_number: Number(c9),
        fecha_raw:    c11,
        idea:         c12,
        caption:      c13,
        texto_en_arte: c14,
        hashtags:     c15,
        formato:      '',
        plataforma:   '',
        proyecto:     '',
        estatus:      'Pendiente',
      };
    } else if (current) {
      switch (c10) {
        case 'Proyecto':   current.proyecto   = c11; break;
        case 'Plataforma': current.plataforma = c11; break;
        case 'Formato':    current.formato    = c11; break;
        case 'Estatus':    current.estatus    = c11 || 'Pendiente'; break;
      }
    }
  }
  if (current?.proyecto) posts.push(current as RawPost);

  return posts;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // SheetJS may return a date serial — handle both string and number
  const n = Number(raw);
  if (!isNaN(n) && n > 40000) {
    // Excel date serial → JS Date
    const d = XLSX.SSF.parse_date_code(n);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  // String like "Fri, May 1" or "Fri, May 1, 2026"
  const parsed = new Date(`${raw} 2026`);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function monthLabel(posts: RawPost[]): string {
  for (const p of posts) {
    const d = parseDate(p.fecha_raw);
    if (d) {
      const dt = new Date(d + 'T12:00:00Z');
      return dt.toLocaleDateString('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
  }
  return new Date().toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

    // Find the right sheet: prefer next month → current month → highest-numbered month sheet
    const today = new Date();
    const thisMonth = String(today.getMonth() + 1).padStart(2, '0');
    const nextMonth = String(today.getMonth() + 2).padStart(2, '0');
    const monthSheets = workbook.SheetNames.filter(n => /^\d{2}$/.test(n.trim())).sort();

    const sheetName =
      workbook.SheetNames.find(n => n.trim() === nextMonth) ??
      workbook.SheetNames.find(n => n.trim() === thisMonth) ??
      monthSheets.at(-1) ??
      workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    const posts = parseSheet(rows);
    if (posts.length === 0) {
      return NextResponse.json({ error: 'No posts found in file. Check format.' }, { status: 422 });
    }

    const label = monthLabel(posts);

    // Group by proyecto
    const byProject = new Map<string, RawPost[]>();
    for (const p of posts) {
      const key = p.proyecto.trim();
      if (!key) continue;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(p);
    }

    const created: { campaign: string; posts: number }[] = [];

    for (const [projectName, projectPosts] of byProject) {
      const campaignName = `${projectName} — ${label}`;

      // Upsert campaign: create only if it doesn't exist yet
      const existing = await query(
        `SELECT id FROM projects WHERE project_name = $1 AND client_name = $2 LIMIT 1`,
        [campaignName, 'Puerta Abierta']
      );

      let projectId: string;
      if (existing.rows.length > 0) {
        projectId = existing.rows[0].id;
        // Delete existing posts so re-import is idempotent
        await query(`DELETE FROM posts WHERE project_id = $1`, [projectId]);
      } else {
        const newProject = await query(
          `INSERT INTO projects (client_name, project_name, project_type, status, notes)
           VALUES ($1, $2, 'space_design', 'lead', $3)
           RETURNING id`,
          ['Puerta Abierta', campaignName, `Importado del plan de contenido — ${label}`]
        );
        projectId = newProject.rows[0].id;
      }

      // Insert posts
      for (const p of projectPosts) {
        const fecha = parseDate(p.fecha_raw);
        await query(
          `INSERT INTO posts
             (project_id, post_number, fecha, idea, caption, texto_en_arte, hashtags, formato, plataforma, estatus)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            projectId,
            p.post_number,
            fecha,
            p.idea        || null,
            p.caption     || null,
            p.texto_en_arte || null,
            p.hashtags    || null,
            p.formato     || null,
            p.plataforma  || null,
            p.estatus     || 'Pendiente',
          ]
        );
      }

      created.push({ campaign: campaignName, posts: projectPosts.length });
    }

    return NextResponse.json({ ok: true, created, label }, { status: 201 });
  } catch (error: unknown) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
