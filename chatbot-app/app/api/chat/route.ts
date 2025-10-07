//app/api/chat/route.ts
// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ---------------- Runtime ----------------
export const runtime = "nodejs";

// ---------------- Clients ----------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // SERVER ONLY
);

// ---------------- Config ----------------
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL  = process.env.CHAT_MODEL  || "gpt-4o-mini";
const SUM_MODEL   = process.env.SUM_MODEL   || CHAT_MODEL;

const TOP_K = Number(process.env.RAG_TOP_K || 6);
const SIM_THRESHOLD = Number(process.env.RAG_SIM_THRESHOLD || 0.2);
const RPC_NAME = process.env.RPC_NAME || "match_file_chunks";
const MAX_CONTEXT_CHARS = 12000;

// Rolling summary
const MAX_PAIRS = Number(process.env.CHAT_MAX_PAIRS || 6);            // last N user/assistant pairs
const SUMMARY_MAX_CHARS = 1500;                                       // cap stored summary
const SUMMARY_REFRESH_EVERY = Number(process.env.SUMMARY_EVERY || 3); // refresh cadence

const BOT_USER_ID = process.env.BOT_USER_ID || undefined;

// ---------------- Safety (regex hard stop) ----------------
const DANGER_PATTERNS: string[] = [
  "\\bsuicid(e|al)\\b","\\bdie\\b","\\bdying\\b","\\bkill(ing)? myself\\b","\\bend(ing)? my life\\b",
  "\\bdeath\\b","\\bmurder myself\\b","\\bwant to die\\b","\\bcan't go on\\b","\\bi feel hopeless\\b",
  "\\bi want to disappear\\b","\\bno reason to live\\b","\\bi wish i was dead\\b","\\bi am worthless\\b",
  "\\bi am a burden\\b",
];
const COMPILED_DANGER_PATTERNS = DANGER_PATTERNS.map(p => new RegExp(p, "i"));

function checkFilters(userInput: string): "Imminent Danger" | null {
  for (const rx of COMPILED_DANGER_PATTERNS) if (rx.test(userInput)) return "Imminent Danger";
  return null;
}

// ---------------- Types ----------------
type RoleTurn = { role: "user" | "assistant"; content: string };

type RiskTier = "Imminent" | "Acute" | "Elevated" | "Low" | "None";
type RiskAssessment = {
  tier: RiskTier;
  signals: string[];
  protective: string[];
  user_goals: string[];
};

type SupportOption = { label: string; phone: string; when: string; audience?: string };

type UserProfile = {
  id: string;
  display_name?: string | null;
  age?: number | null;
  locale?: string | null;            // e.g., "en-AU"
  state?: string | null;             // e.g., "QLD"
  pronouns?: string | null;
  indigenous?: boolean | null;       // if user opted-in/shared
  caregiver_role?: "youth" | "parent" | "worker" | null;
  preferred_tone?: "casual" | "warm" | "professional" | null;
};

// ---------------- Utilities: embeddings & retrieval ----------------
async function embedOne(text: string): Promise<number[]> {
  const e = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  return e.data[0].embedding as number[];
}

async function retrieveContext(userMessage: string) {
  const qEmb = await embedOne(userMessage);
  const { data, error } = await supabase.rpc(RPC_NAME, {
    query_embedding: qEmb,
    match_count: TOP_K,
    similarity_threshold: SIM_THRESHOLD,
  });
  if (error) throw new Error("RAG retrieval failed");

  const hits = (data ?? []) as Array<{ file?: string; chunk_id?: string | number; content?: string; similarity?: number }>;

  const parts: string[] = [];
  let used = 0;
  for (const h of hits) {
    const piece = (h.content ?? "").trim();
    if (!piece) continue;
    const sep = parts.length ? "\n---\n" : "";
    if (used + sep.length + piece.length > MAX_CONTEXT_CHARS) break;
    parts.push(piece);
    used += sep.length + piece.length;
  }
  return { context: parts.join("\n---\n"), hits };
}

// ---------------- Personalisation fetch ----------------
async function loadUserProfile(userId?: string): Promise<UserProfile | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, age, locale, state, pronouns, indigenous, caregiver_role, preferred_tone")
    .eq("id", userId)
    .single();
  if (error) { console.error("loadUserProfile error:", error); return null; }
  return data as UserProfile;
}

async function loadRecentMood(conversationId: string, limit = 5) {
  const { data, error } = await supabase
    .from("mood_checkins")
    .select("created_at, feeling, intensity, notes")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("loadRecentMood error:", error); }
  return data ?? [];
}

function buildSupportOptions(p: UserProfile | null): SupportOption[] {
  const opts: SupportOption[] = [];
  // AU national defaults
  opts.push({ label: "Lifeline (24/7)", phone: "13 11 14", when: "feeling unsafe or in crisis" });

  if (p?.age && p.age <= 25) {
    opts.push({ label: "Kids Helpline (24/7, ages 5–25)", phone: "1800 55 1800", when: "youth support", audience: "young people" });
  }
  if (p?.indigenous) {
    opts.push({ label: "13YARN (24/7, mob yarn with mob)", phone: "13 92 76", when: "culturally safe yarn", audience: "Aboriginal & Torres Strait Islander" });
  }
  if (p?.state === "QLD") {
    opts.push({ label: "1300 MH CALL (QLD)", phone: "1300 642 255", when: "triage to local public mental health team" });
  }
  return opts;
}

// ---------------- Conversations: ensure ownership (CRITICAL for anon) ----------------
async function ensureConversationOwned(conversationId: string, userId?: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, created_by")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) console.error("ensureConversationOwned select error:", error);

  if (!data) {
    const { error: insErr } = await supabase
      .from("conversations")
      .insert({ id: conversationId, summary: "", created_by: userId ?? null });
    if (insErr) console.error("ensureConversationOwned insert error:", insErr);
    return;
  }
  if (userId && (!data.created_by || (BOT_USER_ID && data.created_by === BOT_USER_ID))) {
    const { error: updErr } = await supabase
      .from("conversations")
      .update({ created_by: userId })
      .eq("id", conversationId);
    if (updErr) console.error("ensureConversationOwned update owner error:", updErr);
  }
}

async function loadSummary(conversationId: string): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .select("summary")
    .eq("id", conversationId)
    .single();
  if (error) { console.error("loadSummary error:", error); }
  return (data?.summary ?? "").slice(0, SUMMARY_MAX_CHARS);
}

async function saveSummary(conversationId: string, summary: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ summary: summary.slice(0, SUMMARY_MAX_CHARS) })
    .eq("id", conversationId);
  if (error) console.error("saveSummary error:", error);
}

async function loadLastPairs(conversationId: string, pairs: number): Promise<RoleTurn[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(pairs * 2);
  if (error) {
    console.error("loadLastPairs error:", error);
    return [];
  }
  const rows = (data ?? []).reverse(); // chronological
  return rows.map(r =>
    r.role === "assistant"
      ? ({ role: "assistant" as const, content: r.content })
      : ({ role: "user" as const, content: r.content })
  );
}

async function countAssistantMessages(conversationId: string): Promise<number> {
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "assistant");
  if (error) { console.error("countAssistantMessages error:", error); }
  return count ?? 0;
}

async function refreshSummary({
  conversationId,
  currentSummary,
  recentTurns,
  wordsTarget = 180,
}: {
  conversationId: string;
  currentSummary: string;
  recentTurns: RoleTurn[];
  wordsTarget?: number;
}) {
  const turnsTxt = recentTurns
    .map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  const prompt =
    `Update this running conversation summary in ~${wordsTarget} words. ` +
    `Keep key facts & preferences, ongoing goals/tasks, decisions, and unresolved items. ` +
    `Remove redundancy. Preserve names/dates/identifiers if present.\n\n` +
    `Current summary:\n${currentSummary || "(empty)"}\n\n` +
    `New turns (chronological):\n${turnsTxt}\n\n` +
    `Return only the updated summary as plain text.`;

  const resp = await openai.chat.completions.create({
    model: SUM_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  const updated = resp.choices?.[0]?.message?.content?.trim() || currentSummary;
  await saveSummary(conversationId, updated);
}

// ---------------- Persistence for the turn (returns inserted rows) ----------------
async function saveTurnToDB({
  conversationId,
  userId,
  botUserId,
  userMessage,
  botAnswer,
}: {
  conversationId: string;
  userId?: string;
  botUserId?: string;
  userMessage: string;
  botAnswer: string;
}) {
  const now = new Date();
  const aBitLater = new Date(now.getTime() + 1); // 1 ms later
  const rows: any[] = [
    {
      conversation_id: conversationId,
      sender_id: userId ?? null,   // anon or logged-in uid
      role: "user",
      content: userMessage,
      created_at: now.toISOString(),
    },
    {
      conversation_id: conversationId,
      sender_id: botUserId ?? null,
      role: "assistant",
      content: botAnswer,
      created_at: aBitLater.toISOString(),
    }
  ];

  const { data, error } = await supabase
    .from("messages")
    .insert(rows)
    .select("id, conversation_id, sender_id, role, content, created_at")
    .order("created_at", { ascending: true });

  if (error) console.error("saveTurnToDB error:", error);
  return data ?? [];
}

// ---------------- Risk classifier (LLM) ----------------
async function classifyRisk(userMessage: string): Promise<RiskAssessment> {
  const prompt = `
You are a safety triage classifier. Read the user's message and return a JSON object
with fields: tier ("Imminent" | "Acute" | "Elevated" | "Low" | "None"), signals[], protective[], user_goals[].
Definitions:
- Imminent: explicit intent + plan/means/timeframe OR current attempt.
- Acute: suicidal ideation with concerning specifics or recent attempt, but not imminent.
- Elevated: passive ideation or severe hopelessness/self-harm urges without plan.
- Low: distress without self-harm ideation.
- None: no risk signals.
User: """${userMessage}"""
Return only JSON.`;

  const r = await openai.chat.completions.create({
    model: SUM_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.0,
  });

  try {
    const text = r.choices?.[0]?.message?.content?.trim() || "{}";
    return JSON.parse(text) as RiskAssessment;
  } catch {
    return { tier: "None", signals: [], protective: [], user_goals: [] };
  }
}

// ---------------- Micro-templates: style & CARE card ----------------
function buildStyle(profile: UserProfile | null) {
  const tone = profile?.preferred_tone || "warm";
  const style = (tone === "professional")
    ? "professional, clear, non-judgmental"
    : tone === "casual"
    ? "casual, friendly, non-judgmental"
    : "warm, supportive, non-judgmental";
  return `${style}; use plain language; 2–4 short paragraphs; use the user's words; offer 2–3 small next steps.`;
}

function buildCARECard({
  profile, risk, supports, recentMood
}: {
  profile: UserProfile | null; risk: RiskAssessment; supports: SupportOption[]; recentMood: any[];
}) {
  const name = profile?.display_name;
  const addressByName = name ? `Hi ${name}, ` : "";
  const safetyLine = (risk.tier === "Imminent" || risk.tier === "Acute")
    ? "If you feel unsafe, call **000** now. It’s the fastest way to get help in Australia."
    : "";

  const firstSupport = supports[0] ? `You can also talk to ${supports[0].label} at **${supports[0].phone}**.` : "";
  const lastFeel = recentMood?.[0]?.feeling ? `I remember you mentioned feeling **${recentMood[0].feeling}** recently.` : "";

  return {
    opener: `${addressByName}thanks for telling me. ${lastFeel} I’m listening.`.trim(),
    safetyLine,
    nextSteps: [
      "Name one thing that makes this moment 1% easier. I can help you plan the next 10 minutes.",
      "If you’d like, we can write a tiny safety plan (what you’ll do, who you’ll contact, where you’ll be).",
      firstSupport
    ].filter(Boolean),
  };
}

// ---------------- Healthcheck ----------------
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/chat" });
}
// in app/api/chat/route.ts
// app/api/chat/route.ts
async function ensureConversationRow(conversationId: string, userId?: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, created_by")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) console.error("ensureConversationRow select error:", error);

  if (!data) {
    const { error: insErr } = await supabase
      .from("conversations")
      .insert({ id: conversationId, created_by: userId ?? null, summary: "" });
    if (insErr) console.error("ensureConversationRow insert error:", insErr);
    return;
  }

  if (userId && (!data.created_by || (BOT_USER_ID && data.created_by === BOT_USER_ID))) {
    const { error: updErr } = await supabase
      .from("conversations")
      .update({ created_by: userId })
      .eq("id", conversationId);
    if (updErr) console.error("ensureConversationRow update owner error:", updErr);
  }
}





export async function POST(req: Request) {
  try {
    const { conversationId, userMessage } = await req.json();
    if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    if (!userMessage)     return NextResponse.json({ error: "userMessage is required" }, { status: 400 });

    // carry uid (anon or logged-in) and stamp ownership
    const userId = req.headers.get("x-user-id") || undefined;
    await ensureConversationOwned(conversationId, userId);

    // Exit command (no persistence here)
    if (userMessage.trim().toLowerCase() === "exit") {
      return NextResponse.json({
        conversationId,
        answer: "🤖: Goodbye! Your session has been cleared. Take care! 👋",
        emotion: "Neutral",
        tier: "None",
        suggestions: [],
        citations: [],
      });
    }

    // 0) Hard-stop regex → immediate escalation
    const forcedTier = checkFilters(userMessage);
    if (forcedTier) {
      const profile = await loadUserProfile(userId);
      const supports = buildSupportOptions(profile);

      const answer = [
        "I’m really concerned about your safety.",
        "If you are in immediate danger, please call **000** now.",
        `${profile?.display_name ? profile.display_name + "," : ""} you’re not alone — I care about your safety.`,
        supports.map(s => `• ${s.label}: ${s.phone}`).join("\n"),
      ].join("\n\n");

      const inserted = await saveTurnToDB({
        conversationId,
        userId,
        botUserId: BOT_USER_ID,
        userMessage,
        botAnswer: answer,
      });

      const recentForSummary = await loadLastPairs(conversationId, Math.max(6, MAX_PAIRS));
      const currentSummary = await loadSummary(conversationId);
      await refreshSummary({
        conversationId,
        currentSummary,
        recentTurns: recentForSummary,
        wordsTarget: 180,
      });

      const userRow = inserted.find(r => r.role === "user");
      const assistantRow = inserted.find(r => r.role === "assistant");

      return NextResponse.json({
        conversationId,
        answer,
        emotion: "Negative",
        tier: "Imminent",
        suggestions: supports.map(s => `${s.label} — ${s.phone}`),
        citations: [],
        rows: { user: userRow, assistant: assistantRow },
      });
    }

    // 1) Nuanced classifier
    const risk = await classifyRisk(userMessage);

    // 2) Personalisation inputs + RAG + history
    const [profile, recentMood, summary, historyMsgs] = await Promise.all([
      loadUserProfile(userId),
      loadRecentMood(conversationId, 5),
      loadSummary(conversationId),
      loadLastPairs(conversationId, MAX_PAIRS),
    ]);
    
await ensureConversationRow(conversationId, userId);

    const supports = buildSupportOptions(profile);

    const ragHint = (risk.tier === "Elevated" || risk.tier === "Acute")
      ? "grounded coping skills; short actionable steps; safety-plan examples; youth friendly; Australian and more specifically Queensland context\n"
      : "";
    const { context, hits } = await retrieveContext(ragHint + userMessage);

    const systemPrompt =
`You are a concise, empathetic youth-support assistant for Australia.

PRIORITIES (in order):
1) Safety first:
 - Imminent → lead with 000 (Australia) and crisis lines.
 - Acute → include a safety line (“If you feel unsafe, call 000”) and build a tiny safety plan.
2) Personalisation: reflect the user's words and the profile/summary/mood provided.
3) Helpfulness: offer 2–3 small, doable next steps tailored to the user's goals and context.
4) RAG: use provided Context ONLY to add accurate ideas/resources; never hallucinate.
5) Tone: ${buildStyle(profile)}

DO:
- Use 'CARE' structure: Connect → Acknowledge → Reflect → Explore small next steps.
- Mirror key phrases the user used. Use their name/pronouns if provided.
- If youth ≤25, prefer youth-specific supports. If indigenous==true, include 13YARN.
- End with a permission-based question like “Want me to help you plan the next 10 minutes?”

DON'T:
- Don’t minimise feelings; don’t lecture; don’t promise confidentiality or outcomes.
- Don’t give medical diagnoses or definitive clinical claims.

Return plain text suitable for a chat UI.`;

    const careCard = buildCARECard({ profile, risk, supports, recentMood });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `Conversation summary:\n${summary || "(none)"}` },
      { role: "system", content: `User profile:\n${JSON.stringify(profile || {}, null, 2)}` },
      { role: "system", content: `Risk assessment:\n${JSON.stringify(risk, null, 2)}` },
      { role: "system", content: `Support options (region/persona-aware):\n${supports.map(s => `${s.label}: ${s.phone} — ${s.when}`).join("\n")}` },
      { role: "system", content: `CARE card:\n${JSON.stringify(careCard, null, 2)}` },
      { role: "system", content: `Context (RAG):\n${context}` },
      ...historyMsgs,
      { role: "user", content: userMessage },
    ];

    // 4) Generate answer (low temp for stability)
    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.2,
    });

    const answer =
      resp.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I couldn't generate an answer right now.";

    // 5) Persist the new user+assistant turn (always insert both rows) and return them
    const inserted = await saveTurnToDB({
      conversationId,
      userId,
      botUserId: BOT_USER_ID,
      userMessage,
      botAnswer: answer,
    });

    // 6) Refresh summary occasionally / on first reply
    const assistantCount = await countAssistantMessages(conversationId);
    const currentSummary = await loadSummary(conversationId);
    const shouldRefresh =
      (assistantCount > 0 && assistantCount % SUMMARY_REFRESH_EVERY === 0) ||
      !currentSummary || currentSummary.trim().length === 0;

    if (shouldRefresh) {
      const recentForSummary = await loadLastPairs(conversationId, Math.max(6, MAX_PAIRS));
      await refreshSummary({
        conversationId,
        currentSummary,
        recentTurns: recentForSummary,
        wordsTarget: 180,
      });
    }

    // 7) Build suggestions based on risk
    const baseSuggestions = [
      "Write a 3-step safety plan together",
      "Try a 60-second breathing reset",
      "Reach out to one safe person and send a short message",
    ];

    const crisisSuggestions = [
      "Call 000 (immediate danger)",
      ...supports.map(s => `${s.label} — ${s.phone}`),
    ];

    const suggestions = (risk.tier === "Imminent" || risk.tier === "Acute")
      ? crisisSuggestions
      : [...supports.slice(0,2).map(s => `${s.label} — ${s.phone}`), ...baseSuggestions];

    const citations = hits.map((h, i) => ({
      rank: i + 1,
      file: h.file ?? null,
      chunk_id: String(h.chunk_id ?? ""),
      similarity: Number(((h.similarity ?? 0) as number).toFixed?.(3) ?? 0),
      preview: (h.content ?? "").slice(0, 180),
    }));

    const userRow = inserted.find(r => r.role === "user");
    const assistantRow = inserted.find(r => r.role === "assistant");

    // 9) Envelope
    return NextResponse.json({
      conversationId,
      answer,
      emotion: (risk.tier === "None" || risk.tier === "Low") ? "Neutral" : "Negative",
      tier: risk.tier === "None" ? "None" : risk.tier,
      suggestions,
      citations,
      rows: { user: userRow, assistant: assistantRow }, // optional for instant UI reconcile
    });

  } catch (e: any) {
    console.error("CHAT route error:", e);
    return NextResponse.json({ error: e.message ?? "chat error" }, { status: 400 });
  }
}
