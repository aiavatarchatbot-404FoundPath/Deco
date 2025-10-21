// app/api/ingest-csv/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { parse as csvParse } from "csv-parse/sync"; 


export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const BATCH = 500;

type CsvRow = { file: string; chunk_id?: string | number; content: string };

async function embedBatch(texts: string[]): Promise<number[][]> {
  const resp = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
  return resp.data.map(d => d.embedding as number[]);
}

export async function POST(req: Request) {
  const diag: any = {};
  try {
    const body = await req.json();
    const ownerId = body.ownerId as string | undefined;

    let csvText = "";

    if (body.from === "table") {
      const table: string  = String(body.table || "csv_files");
      const rowId: string  = String(body.rowId || "");
      const column: string = String(body.column || "csv_text");
      if (!rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });
      const sb: any = supabaseAdmin;          
      const resp = await sb
        .from(table)                         
        .select(`id,title,${column}${ownerId ? ",owner_id" : ""}`)
        .eq("id", rowId)
        .single();
      if (resp.error || !resp.data) {
        return NextResponse.json({ error: resp.error?.message || "row not found" }, { status: 400 });
      }

      const idx = resp.data as unknown as Record<string, unknown>;

      csvText = String((idx[column] as string | undefined) ?? "");

      const title = typeof idx["title"] === "string" ? (idx["title"] as string) : null;
      diag.source = { table, rowId, title };
}


    if (!csvText.trim()) return NextResponse.json({ error: "CSV is empty" }, { status: 400 });

    const rows = csvParse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    // validate columns exist
    const sample = rows[0] || {};
    for (const k of ["file", "content"] as const) {
      if (!(k in sample)) {
        return NextResponse.json({ error: `CSV missing required column: ${k}` }, { status: 400 });
      }
    }

    // group by file (one document per file)
    const byFile = new Map<string, CsvRow[]>();
    for (const r of rows) {
      const file = (r.file || "").trim();
      const content = (r.content || "").trim();
      if (!file || !content) continue;
      (byFile.get(file) || byFile.set(file, []).get(file)!).push(r);
    }

    // create documents
    const docIds = new Map<string, string>();
    for (const [file] of byFile) {
      const insertDoc: any = { title: file, source: `table:${body.table ?? "csv_files"}` };
      if (ownerId) insertDoc.owner_id = ownerId;

      const { data: doc, error: docErr } = await supabaseAdmin
        .from("documents")
        .insert(insertDoc)
        .select("id")
        .single();

      if (docErr || !doc) {
        return NextResponse.json({ error: `Insert document failed for ${file}: ${docErr?.message}` }, { status: 400 });
      }
      docIds.set(file, doc.id);
    }

    // embed + insert chunks
    let total = 0;
    for (const [file, list] of byFile) {
      for (let i = 0; i < list.length; i += BATCH) {
        const slice = list.slice(i, i + BATCH);
        const embs = await embedBatch(slice.map(s => s.content));

        const toInsert = slice.map((s, j) => ({
          document_id: docIds.get(file)!,
          chunk_index:
            typeof s.chunk_id === "number"
              ? s.chunk_id
              : Number.isFinite(Number(s.chunk_id))
              ? Number(s.chunk_id)
              : i + j,
          content: s.content,
          embedding: embs[j],
          ...(ownerId ? { owner_id: ownerId } : {}),
        }));

        const { error: insErr } = await supabaseAdmin.from("chunks").insert(toInsert);
        if (insErr) return NextResponse.json({ error: `Insert chunks failed: ${insErr.message}` }, { status: 400 });

        total += toInsert.length;
      }
    }

    return NextResponse.json({ ok: true, documents: docIds.size, chunks: total, diag });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), diag }, { status: 500 });
  }
}
