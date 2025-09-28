import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const runtime = "nodejs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false}});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

async function embedOne(q:string){ const e=await openai.embeddings.create({model:MODEL,input:q}); return e.data[0].embedding as number[]; }

export async function POST(req: Request){
  try{
    const { query, topK=5, threshold=0.2 } = await req.json();
    if(!query) return NextResponse.json({ error:"query required" }, { status:400 });
    const qEmb = await embedOne(query);
    const { data, error } = await sb.rpc("match_file_chunks", {
      query_embedding: qEmb, match_count: topK, similarity_threshold: threshold
    });
    if(error) throw error;
    const hits = (data??[]).map((h:any,i:number)=>({
      rank:i+1, file:h.file, chunk_id:String(h.chunk_id),
      similarity:Number((h.similarity||0).toFixed(3)),
      preview:(h.content||"").slice(0,200),
    }));
    return NextResponse.json({ ok:true, hits });
  }catch(e:any){ return NextResponse.json({ error:e?.message||String(e) }, { status:500 }); }
}
