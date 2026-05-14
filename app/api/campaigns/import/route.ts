import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import { query } from '@/lib/db';

// ─── Shared types ────────────────────────────────────────────────────────────

type RawPost = {
  post_number: number;
  fecha_raw:   string;       // ISO date string or empty
  idea:         string;
  descripcion:  string;
  caption:      string;
  texto_en_arte: string;
  hashtags:     string;
  formato:      string;
  plataforma:   string;
  proyecto:     string;
  estatus:      string;
};

// ─── XLSX parser ─────────────────────────────────────────────────────────────
// Layout per post:
//   Main row:  col[9]=number, col[10]="Fecha", col[11]=date, col[12]=idea,
//              col[13]=caption, col[14]=texto_en_arte, col[15]=hashtags
//   Sub-rows:  col[9]="", col[10]=key, col[11]=value
//              (Proyecto, Plataforma, Formato, Estatus)

function parseXlsx(rows: unknown[][]): RawPost[] {
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
        post_number:   Number(c9),
        fecha_raw:     c11,
        idea:          c12,
        descripcion:   '',
        caption:       c13,
        texto_en_arte: c14,
        hashtags:      c15,
        formato:       '',
        plataforma:    '',
        proyecto:      '',
        estatus:       'Pendiente',
      };
    } else if (current) {
      switch (c10) {
        case 'Proyecto':   current.proyecto   = c11; break;
        case 'Plataforma': current.plataforma = c11 || 'Pendiente'; break;
        case 'Formato':    current.formato    = c11 || 'Pendiente'; break;
        case 'Estatus':    current.estatus    = c11 || 'Pendiente'; break;
      }
    }
  }
  if (current?.proyecto) posts.push(current as RawPost);

  return posts;
}

// ─── DOCX parser ─────────────────────────────────────────────────────────────
// DOCX = ZIP containing word/document.xml
// Structure: 10 tables (5 header banners + 5 data tables)
// Data tables: 16 rows × 5 cols
//   col 0: "N ProjectName"  →  post_number + proyecto
//   col 1: Idea de Publicación
//   col 2: Descripción
//   col 3: Texto en Arte
//   col 4: Copy listo para publicar (caption)

function extractCellText(cellXml: string): string {
  // Join all <w:t> text nodes within a cell, preserving spaces
  const matches = cellXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [];
  return matches
    .map(m => m.replace(/<[^>]+>/g, ''))
    .join('')
    .trim();
}

function parseDocxXml(xml: string): RawPost[] {
  const posts: RawPost[] = [];

  // Extract all <w:tbl> blocks
  const tblRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  const tables = xml.match(tblRegex) || [];

  for (const tbl of tables) {
    // Extract all <w:tr> rows
    const trRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    const rows = tbl.match(trRegex) || [];
    if (rows.length !== 16) continue;   // data tables have exactly 16 rows (1 header + 15 posts)

    // Skip header row (row 0), process rows 1–15
    for (let i = 1; i < rows.length; i++) {
      const tcRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
      const cells = rows[i].match(tcRegex) || [];
      if (cells.length !== 5) continue;

      const col0 = extractCellText(cells[0]);
      const col1 = extractCellText(cells[1]);
      const col2 = extractCellText(cells[2]);
      const col3 = extractCellText(cells[3]);
      const col4 = extractCellText(cells[4]);

      // col0 = "N ProjectName" e.g. "1Benestare" or "15 Santa Elena" (space optional)
      const numMatch = col0.match(/^(\d+)\s*(.+)$/);
      if (!numMatch) continue;

      posts.push({
        post_number:   parseInt(numMatch[1], 10),
        proyecto:      numMatch[2].trim(),
        idea:          col1,
        descripcion:   col2,
        texto_en_arte: col3,
        caption:       col4,
        fecha_raw:     '',          // not in DOCX — resolved to 1st of month below
        hashtags:      '',
        formato:       'Pendiente',
        plataforma:    'Pendiente',
        estatus:       'Pendiente',
      });
    }
  }

  return posts;
}

function parseDocx(buffer: Buffer): RawPost[] {
  const unzipped = unzipSync(new Uint8Array(buffer));
  const xmlEntry = unzipped['word/document.xml'];
  if (!xmlEntry) throw new Error('word/document.xml not found in DOCX');
  const xml = new TextDecoder('utf-8').decode(xmlEntry);
  return parseDocxXml(xml);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

// Infer target month's first day from filename, e.g. "SocialMediaPlan2026Junio.docx"
// Falls back to next-month or current-month logic matching the XLSX behaviour.
function inferFirstOfMonth(filename: string): string {
  const lower = filename.toLowerCase();
  const yearMatch = lower.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

  for (const [name, mm] of Object.entries(SPANISH_MONTHS)) {
    if (lower.includes(name)) return `${year}-${mm}-01`;
  }

  // Fallback: next month then current month (mirrors XLSX sheet-selection logic)
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return nextMonth.toISOString().slice(0, 10);
}

function parseXlsxDate(raw: string): string | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const parsed = new Date(`${raw} 2026`);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function monthLabel(firstOfMonth: string): string {
  const dt = new Date(firstOfMonth + 'T12:00:00Z');
  return dt.toLocaleDateString('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ─── Shared DB logic ──────────────────────────────────────────────────────────

async function upsertCampaignAndPosts(
  projectName: string,
  label: string,
  posts: RawPost[],
  defaultFecha: string,
): Promise<void> {
  const campaignName = `${projectName} — ${label}`;

  const existing = await query(
    `SELECT id FROM projects WHERE project_name = $1 AND client_name = $2 LIMIT 1`,
    [campaignName, 'Puerta Abierta'],
  );

  let projectId: string;
  if (existing.rows.length > 0) {
    projectId = existing.rows[0].id;
    await query(`DELETE FROM posts WHERE project_id = $1`, [projectId]);
  } else {
    const newProject = await query(
      `INSERT INTO projects (client_name, project_name, project_type, status, notes)
       VALUES ($1, $2, 'space_design', 'lead', $3)
       RETURNING id`,
      ['Puerta Abierta', campaignName, `Importado del plan de contenido — ${label}`],
    );
    projectId = newProject.rows[0].id;
  }

  for (const p of posts) {
    const fecha = p.fecha_raw ? (parseXlsxDate(p.fecha_raw) ?? defaultFecha) : defaultFecha;
    await query(
      `INSERT INTO posts
         (project_id, post_number, fecha, idea, descripcion, caption,
          texto_en_arte, hashtags, formato, plataforma, estatus)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        projectId,
        p.post_number,
        fecha,
        p.idea          || null,
        p.descripcion   || null,
        p.caption       || null,
        p.texto_en_arte || null,
        p.hashtags      || null,
        p.formato       || 'Pendiente',
        p.plataforma    || 'Pendiente',
        p.estatus       || 'Pendiente',
      ],
    );
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isDocx = file.name.toLowerCase().endsWith('.docx');

    let posts: RawPost[];
    let firstOfMonth: string;

    if (isDocx) {
      posts = parseDocx(buffer);
      firstOfMonth = inferFirstOfMonth(file.name);
    } else {
      // XLSX path (unchanged logic)
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      const today = new Date();
      const thisMonth  = String(today.getMonth() + 1).padStart(2, '0');
      const nextMonth  = String(today.getMonth() + 2).padStart(2, '0');
      const monthSheets = workbook.SheetNames.filter(n => /^\d{2}$/.test(n.trim())).sort();
      const sheetName =
        workbook.SheetNames.find(n => n.trim() === nextMonth) ??
        workbook.SheetNames.find(n => n.trim() === thisMonth) ??
        monthSheets.at(-1) ??
        workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      posts = parseXlsx(rows);

      // Infer first-of-month from actual post dates for the label
      const firstDate = posts.map(p => parseXlsxDate(p.fecha_raw)).find(d => d != null);
      firstOfMonth = firstDate
        ? firstDate.slice(0, 8) + '01'
        : new Date().toISOString().slice(0, 8) + '01';
    }

    if (posts.length === 0) {
      return NextResponse.json({ error: 'No posts found in file. Check format.' }, { status: 422 });
    }

    const label = monthLabel(firstOfMonth);

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
      await upsertCampaignAndPosts(projectName, label, projectPosts, firstOfMonth);
      created.push({ campaign: `${projectName} — ${label}`, posts: projectPosts.length });
    }

    return NextResponse.json({ ok: true, created, label }, { status: 201 });
  } catch (error: unknown) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
