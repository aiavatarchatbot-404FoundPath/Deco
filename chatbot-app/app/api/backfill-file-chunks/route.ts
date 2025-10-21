import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const BATCH = 200;

async function embedBatch(texts: string[]) {
  const r = await openai.embeddings.create({ model: MODEL, input: texts });
  return r.data.map((d: { embedding: number[] }) => d.embedding as number[]);
}

export async function POST() {
  try {
    // deal with rows that don't have an embedding yet
    const { data: rows, error } = await sb
      .from("file_chunks")
      .select("row_id, content")
      .is("embedding", null)
      .limit(2000); 

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!rows?.length) return NextResponse.json({ ok: true, updated: 0, note: "nothing to backfill" });

    let updated = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const embs = await embedBatch(slice.map(r => r.content ?? ""));

      // update row-by-row to stay under payload limits
      for (let j = 0; j < slice.length; j++) {
        const { error: upErr } = await sb
          .from("file_chunks")
          .update({ embedding: embs[j] })
          .eq("row_id", slice[j].row_id);
        if (upErr) return NextResponse.json({ error: upErr.message, at: slice[j].row_id }, { status: 400 });
        updated++;
      }
    }

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
