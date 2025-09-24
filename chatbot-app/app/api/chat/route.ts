// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // SERVER ONLY
);

// ---- config ----
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL  = process.env.CHAT_MODEL  || "gpt-4o-mini";
const TOP_K = Number(process.env.RAG_TOP_K || 6);
const SIM_THRESHOLD = Number(process.env.RAG_SIM_THRESHOLD || 0.2);

// pick the RPC you actually created ("match_file_chunks" vs "match_chunks")
const RPC_NAME = process.env.RPC_NAME || "match_file_chunks";

const DANGER_WORDS = ["suicide","die","kill myself","end my life","death","murder myself"];

async function embedOne(text: string): Promise<number[]> {
  const e = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  return e.data[0].embedding as number[];
}

function dangerTier(userText: string): "Imminent Danger" | null {
  const q = userText.toLowerCase();
  return DANGER_WORDS.some((w) => q.includes(w)) ? "Imminent Danger" : null;
}

// Health check
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/chat" });
}

export async function POST(req: Request) {
  try {
    const { conversationId, userMessage } = await req.json();
    if (!userMessage) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

    // 1) retrieve from pgvector
    let hits: any[] = [];
    try {
      const qEmb = await embedOne(userMessage);
      const { data, error } = await supabase.rpc(RPC_NAME, {
        query_embedding: qEmb,
        match_count: TOP_K,
        similarity_threshold: SIM_THRESHOLD,
      });
      if (error) throw error;
      hits = data ?? [];
    } catch (rpcErr) {
      console.error(`${RPC_NAME} RPC failed:`, rpcErr);
    }

    // Build context from hits
    const context = hits.map(h => h.content).join("\n---\n").slice(0, 12000);

    // 2) STRICT mode while testing so you can verify it’s doc-grounded
    const STRICT = true; // flip to false later
    const sys = STRICT
      ? "Answer ONLY from the provided context. If not found in context, reply: \"I don't know based on the documents.\""
      : "Prioritise the provided context; be concise and supportive.";

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: sys },
      { role: "system", content: [
          "You are a helpful, supportive chatbot for young people in Queensland's youth justice system.",
          "Detect the user's emotion (Positive, Neutral, Negative) and the intensity (Low, Moderate, High, Imminent Danger).",
          "Respond with JSON: {answer, emotion, tier, suggestions}."
        ].join(" ") },
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${userMessage}` },
    ];

    // 3) call chat model
    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.2,
    });

    const modelText = resp.choices?.[0]?.message?.content || "";

    // 4) parse JSON payload with fallback
    let payload: { answer: string; emotion: string; tier: string; suggestions: string[] };
    try {
      const parsed = JSON.parse(modelText);
      payload = {
        answer: parsed.answer ?? modelText,
        emotion: parsed.emotion ?? "Neutral",
        tier: parsed.tier ?? "None",
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch {
      payload = {
        answer: modelText || "Sorry, I couldn't generate an answer right now.",
        emotion: "Neutral",
        tier: "None",
        suggestions: [],
      };
    }

    // 5) danger-word override
    const forcedTier = dangerTier(userMessage);
    if (forcedTier) {
      payload.tier = forcedTier;
      if (!payload.suggestions?.length) {
        payload.suggestions = [
          "If you are in immediate danger, call 000 (Australia) or local emergency services.",
          "You can contact Lifeline on 13 11 14 (24/7).",
        ];
      }
    }

    // 6) include citations so you can see exactly what chunks were used
    const citations = hits.map((h, i) => ({
      rank: i + 1,
      file: h.file,
      chunk_id: String(h.chunk_id),
      similarity: Number((h.similarity || 0).toFixed(3)),
      preview: (h.content || "").slice(0, 180),
    }));

    return NextResponse.json({ conversationId, ...payload, citations });
  } catch (e: any) {
    console.error("CHAT route error:", e);
    return NextResponse.json({ error: e.message ?? "chat error" }, { status: 400 });
  }
}
