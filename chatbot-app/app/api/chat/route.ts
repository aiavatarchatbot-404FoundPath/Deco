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

// List of danger patterns (case-insensitive)
const DANGER_PATTERNS: string[] = [
    "\\bsuicid(e|al)\\b",           // suicide, suicidal
    "\\bdie\\b",                     // die
    "\\bdying\\b",                   // dying
    "\\bkill(ing)? myself\\b",       // kill myself, killing myself
    "\\bend(ing)? my life\\b",       // end my life, ending my life
    "\\bdeath\\b",                   // death
    "\\bmurder myself\\b",           // murder myself
    "\\bwant to die\\b",             // want to die
    "\\bcan't go on\\b",             // can't go on
    "\\bi feel hopeless\\b",          // i feel hopeless
    "\\bi want to disappear\\b",     // i want to disappear
    "\\bno reason to live\\b",       // no reason to live
    "\\bi wish i was dead\\b",       // i wish i was dead
    "\\bi am worthless\\b",          // i am worthless
    "\\bi am a burden\\b",           // i am a burden
];

// Precompile regex patterns (case-insensitive)
const COMPILED_DANGER_PATTERNS: RegExp[] = DANGER_PATTERNS.map(
    pattern => new RegExp(pattern, "i")
);

// --- In-memory session memory ---
const SESSION_MEMORY: Record<string, any> = {};

async function embedOne(text: string): Promise<number[]> {
  const e = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  return e.data[0].embedding as number[];
}

// Function to check input
function checkFilters(userInput: string): string | null {
    for (const pattern of COMPILED_DANGER_PATTERNS) {
        if (pattern.test(userInput)) {
            return "Imminent Danger";
        }
    }
    return null;
}

// --- Safety messages ---
function escalateToSafetyProtocol() {
  return "🤖: I’m really concerned about your safety. " +
         "If you are in immediate danger, please call 000 (Australia) or local emergency services. " +
         "You are not alone — you can also reach out to Lifeline on 13 11 14 for 24/7 support.";
}

function sessionClosure() {
  return "🤖: Thank you for sharing with me today. You are not alone, and support is available whenever you need it. Take care!";
}

// --- Initialize or get session memory ---
function getSessionMemory(conversationId: string) {
  if (!SESSION_MEMORY[conversationId]) {
    SESSION_MEMORY[conversationId] = {
      history: [],
      last_emotion: null,
      last_tier: null,
      last_suggestions: []
    };
  }
  return SESSION_MEMORY[conversationId];
}

// Health check
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/chat" });
}

// --- Build context from Supabase RAG ---
async function retrieveContext(userMessage: string) {
  const qEmb = await embedOne(userMessage);
  const { data, error } = await supabase.rpc(RPC_NAME, {
    query_embedding: qEmb,
    match_count: TOP_K,
    similarity_threshold: SIM_THRESHOLD
  });
  if (error) throw error;
  const hits = data ?? [];
  const context = hits.map((h: any) => h.content).join("\n---\n").slice(0, 12000);
  return { context, hits };
}

// Clears session memory at the end of a conversation
function clearSessionMemory(conversationId: string) {
  delete SESSION_MEMORY[conversationId];
}

export async function POST(req: Request) {
  try {
    const { conversationId, userMessage } = await req.json();
    if (!userMessage) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }
    if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });

    // 1) Check if the user wishes to quit the conversation
    if (userMessage.trim().toLowerCase() === "exit") {
      clearSessionMemory(conversationId); // reset session memory
      return NextResponse.json({
        conversationId,
        answer: "🤖: Goodbye! Your session has been cleared. Take care! 👋",
        emotion: "Neutral",
        tier: "None",
        suggestions: [],
        citations: [],
      });
    }

    // Get session memory 
    const sessionMemory = getSessionMemory(conversationId);

    // 2) retrieve context
    const { context, hits } = await retrieveContext(userMessage);

    // 3) prepare messages including conversation history
    const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    for (const turn of sessionMemory.history) {
      if (turn.You) historyMessages.push({ role: "user", content: turn.You });
      if (turn.Bot) historyMessages.push({ role: "assistant", content: turn.Bot });
    }

    // 4) STRICT mode while testing so you can verify it’s doc-grounded
    const STRICT = false; // flip to false later
    const sys = STRICT
      ? "Answer ONLY from the provided context. If not found in context, reply: \"I don't know based on the documents.\""
      : "Prioritise the provided context; be concise and supportive.";

    // 5) Prepare messages including conversation history
    const instructions = [
                      "Prioritise the provided context when answering. "
                      "Be concise and empathetic. "
                      "Do not repeat responses. "
                      "Detect the user's emotion (Positive, Neutral, Negative) and the intensity of any negative emotions (Low, Moderate, High, Imminent Danger). "
                      "Store the values in JSON format with keys: 'answer', 'emotion', 'tier', 'suggestions'. "
                      "'answer' must always contain the full response (e.g. the full study guide). "
                      "'suggestions' should be given in bullet points if the user asks for them. "
                      "Do not provide legal advice for general situations (e.g. Shopping, movies, travel, etc). " 
        ].join(" ");

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: sys },
      { role: "system", content: instructions }, 
      { role: "system", content: `Context:\n${context}` },
      ...historyMessages,
      { role: "user", content: userMessage }
    ];

    // 6) call chat model
    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.2,
    });
    const modelText = resp.choices?.[0]?.message?.content || "";

    // 7) parse JSON payload with fallback
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

    // 8) danger-word override
    const forcedTier = checkFilters(userMessage);
    if (forcedTier) {
      payload.tier = forcedTier;
      if (!payload.suggestions?.length) {
        payload.suggestions = [
          "If you are in immediate danger, call 000 (Australia) or local emergency services.",
          "You can contact Lifeline on 13 11 14 (24/7).",
        ];
      }
    }

    // 9) append to session memory
    sessionMemory.history.push({ You: userMessage, Bot: payload.answer });
    sessionMemory.last_emotion = payload.emotion;
    sessionMemory.last_tier = payload.tier;
    sessionMemory.last_suggestions = payload.suggestions;

    // 10) include citations so you can see exactly what chunks were used
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
