// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// =======================================
// Runtime & Clients
// =======================================
export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =======================================
// Config (tunable)
// =======================================
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL  = process.env.CHAT_MODEL  || "gpt-4o-mini";
const SUM_MODEL   = process.env.SUM_MODEL   || CHAT_MODEL;

const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5);
const RAG_SIM_THRESHOLD = Number(process.env.RAG_SIM_THRESHOLD || 0.22);
const MAX_CONTEXT_CHARS = 9000;

const HISTORY_PAIRS = Number(process.env.CHAT_MAX_PAIRS || 4);
const SUMMARY_REFRESH_EVERY = Number(process.env.SUMMARY_EVERY || 3);

const BOT_USER_ID = process.env.BOT_USER_ID || undefined;
const RPC_NAME = process.env.RPC_NAME || "match_file_chunks";

// =======================================
// Personas + style
// =======================================
export type Persona = "adam" | "eve" | "neutral" | "custom";

// ---- Custom tone parser (overlay for ANY persona)
type TonePrefs = {
  bulletsOnly: boolean;
  allowBullets: boolean;
  noQuestion: boolean;
  openQuestion: boolean;
  maxSentences: number;
  emojiMax: 0 | 1;
  dictionHints: string[];
  neverSay: string[];
  rawText: string;
  normalizedText: string;
};

function parseTone(text?: string): TonePrefs {
  const raw = (text || "").trim();
  const t   = raw.toLowerCase();

  // length cap
  let maxSentences = 4;
  if (/\b(very\s*short|tiny|2\s*sentences?)\b/.test(t)) maxSentences = 2;
  else if (/\b(short|3\s*sentences?)\b/.test(t))        maxSentences = 3;
  else if (/\b(long|6\s*sentences?)\b/.test(t))         maxSentences = 6;

  // tolerate typos like "bulter"
  const bulletsOnly =
    /\b(answer|respond)\s+only\s+in\s+bul+e?t?\s*points?\b/.test(t) ||
    /\bonly\s*bul+e?t?\s*points?\b/.test(t) ||
    /\bbullet\s*points?\s*only\b/.test(t);

  const allowBullets =
    bulletsOnly || /\b(bul+e?t?|bulter|list|bullet\s*points?)\b/.test(t);

  const noQuestion   = /\b(no\s*question|avoid\s*question)\b/.test(t);
  const openQuestion = /\bopen\s*question\b/.test(t);

  const emojiMax: 0 | 1 =
    /\b(no\s*emoji)\b/.test(t) ? 0 :
    (/\b(emoji|🙂|😊|😀|😄)\b/.test(t) ? 1 : 0);

  const dictionHints: string[] = [];
  if (/\bplain|simple|everyday\b/.test(t)) dictionHints.push("Use plain, everyday words.");
  if (/\bprofessional|formal\b/.test(t))  dictionHints.push("Keep it professional and neutral.");
  if (/\bwarm|supportive|kind\b/.test(t)) dictionHints.push("Warm, encouraging tone.");
  if (dictionHints.length === 0)          dictionHints.push("Natural, concise, no meta talk.");

  const neverSay = ["as an ai", "here are", "in this context", "let me know if", "it seems", "it sounds like"];

  return {
    bulletsOnly,
    allowBullets,
    noQuestion,
    openQuestion,
    maxSentences,
    emojiMax,
    dictionHints,
    neverSay,
    rawText: raw,
    normalizedText: t,
  };
}

// ---- Voice sheets
function voiceSheetV2(persona: Persona, customStyle?: string) {
  if (persona === "custom") {
    const p = parseTone(customStyle);
    const qLine = p.noQuestion
      ? "- **No** questions in this reply."
      : p.openQuestion
      ? "- At most one **open** question near the end — only if helpful."
      : "- At most one **closed** question near the end — only if helpful.";
    const bulletsLine = p.bulletsOnly
      ? "- Write the main body **only as bullet points**."
      : p.allowBullets
      ? "- Bullets allowed only if the **user explicitly asked** for a list."
      : "- **No** bullets/lists.";
    const emojiLine = p.emojiMax === 1 ? "- Up to **one** emoji allowed." : "- **No** emoji.";

    return `VOICE SHEET — Custom
Follow these rules. If there is any conflict, these rules win.

Output shape:
- ${p.maxSentences} sentences/items **max**.
- ${qLine}
- ${bulletsLine}

Diction & tone:
- Follow: ${customStyle}.
- ${p.dictionHints.join(" ")}
${emojiLine}

Avoid:
- Hedging like "might", "perhaps" unless user asked for uncertainty.
- Templated intros like "Here are X...".
- Never say: ${p.neverSay.join("; ")}.`;
  }

  if (persona === "adam") {
    return `VOICE SHEET — Adam (Direct Coach)
Output shape:
- 3 sentences **max**, punchy. Fragments allowed.
- Defaults to a micro-plan (one concrete action).
- At most one short **closed** question at the end — only if it moves things forward.

Diction:
- Everyday Aussie; light slang ok ("no dramas", "keen", "sorted").
- Use "let’s", "right now", "pick one".

Avoid:
- Apology/sympathy openers, therapy phrasing, hedging ("might", "perhaps").

Never say:
- "That makes sense." "We can unpack it together."`;
  }

  if (persona === "eve") {
    return `VOICE SHEET — Eve (Warm Guide)
Output shape:
- 4 sentences **max**, calm. No fragments.
- Start with validation/reflection before any suggestion.
- At most one **open** question near the end — only if helpful.

Diction:
- Gentle verbs ("notice", "we can explore", "I'm hearing").
- Use "we can", not "let’s".

Avoid:
- Starting with "It sounds like", "Sounds like", or "It seems".
- Imperatives, time-boxes, slang, hype.

Never say:
- "Got your back", "we’ll keep it simple."`;
  }

  return `VOICE SHEET — Neutral
Output shape:
- 2–4 short sentences, everyday words.
- One open question max; no lists unless asked.
Avoid:
- Meta talk, numbered templates.`;
}

// =======================================
// Eve opener de-templatizer
// =======================================
function pickFeeling(msg: string) {
  const feelings = ["tired","exhausted","stressed","overwhelmed","anxious","angry","sad","confused","numb","guilty","ashamed","worried","scared","frustrated"];
  const lower = (msg || "").toLowerCase();
  for (const f of feelings) if (lower.includes(f)) return f;
  return "";
}
function deTemplateEve(text: string, userMsg: string) {
  const t = (text || "").trim();
  const lower = t.toLowerCase();
  const starts = lower.startsWith("it sounds like") || lower.startsWith("sounds like") || lower.startsWith("it seems");
  if (!starts) return text;
  const feeling = pickFeeling(userMsg);
  const choices = [
    "Thanks for sharing that.",
    feeling ? `That ${feeling} feeling is a lot to carry.` : "That’s a lot to carry.",
    "I hear you.",
    "That’s tough, and you’re not alone.",
  ];
  const idx = Array.from(userMsg || "").reduce((a, c) => a + c.charCodeAt(0), 0) % choices.length;
  const puncts = [t.indexOf("."), t.indexOf("!"), t.indexOf("?"), t.indexOf(",")].filter((i) => i > 0);
  const cut = puncts.length ? Math.min(...puncts) + 1 : 0;
  const rest = cut > 0 ? t.slice(cut).trimStart() : t;
  return choices[idx] + " " + rest;
}

// =======================================
// Question control helpers
// =======================================
type Turn = { role: "user" | "assistant"; content: string };

function userAct(msg: string) {
  const m = (msg || "").trim();
  const lower = m.toLowerCase();
  const isQuestion = /[?]$|^(what|how|why|when|where|which|who|can|could|should|do|does|did|is|are|will|would|may|might)\b/i.test(m);
  const isAffirm = /^(y|ya|yeah|yup|yep|sure|ok(?:ay)?|alright|do it|go ahead|sounds good|done|i did|will do)\b/.test(lower);
  const isNegate = /^(no|nah|not now|not yet|can't|won't|don'?t|stop|wait)\b/.test(lower);
  const isAck = /^(thanks|thank you|cheers|got it|cool|ok)\b/.test(lower);
  const isShort = m.split(/\s+/).filter(Boolean).length <= 4;
  return { isQuestion, isAffirm, isNegate, isAck, isShort };
}
function classifyQuestion(txt: string): "open" | "closed" | "none" {
  const t = (txt || "").trim();
  if (!/[?]/.test(t)) return "none";
  return /\b(what|how|why|when|where|which)\b/i.test(t) ? "open" : "closed";
}
function prevAssistantQuestion(history: Turn[]): "open" | "closed" | "none" {
  const lastA = [...(history || [])].reverse().find((h) => h.role === "assistant");
  return lastA ? classifyQuestion(lastA.content) : "none";
}
function decideQuestionMode(
  persona: Persona,
  userMsg: string,
  history: Turn[],
  customStyle?: string
): "open" | "closed" | "none" {
  const ua = userAct(userMsg);
  if (ua.isQuestion) return "none"; // user asked → answer

  const prevQ = prevAssistantQuestion(history);
  if (prevQ !== "none" && (ua.isAffirm || ua.isNegate || ua.isAck || ua.isShort)) return "none";

  const prefs = parseTone(customStyle);
  if (customStyle?.trim()) {
    if (prefs.noQuestion) return "none";
    if (prefs.openQuestion) return "open";
  }

  if (persona === "adam") return "closed";
  if (persona === "eve") return "open";
  return "open";
}

// =======================================
// Tone overlay (applied to ANY persona)
// =======================================
function splitSentences(s: string) {
  return s.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
}
function limitSentences(s: string, n: number) {
  const parts = splitSentences(s);
  return parts.slice(0, Math.max(1, n)).join(" ");
}
function stripLists(s: string) {
  return s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "").replace(/\n{2,}/g, " ").replace(/\n/g, " ");
}
function toBullets(s: string, maxItems: number) {
  const items = splitSentences(stripLists(s)).slice(0, Math.max(1, maxItems));
  return items.map((x) => `- ${x.replace(/^[–—-]\s*/, "")}`).join("\n");
}
function limitEmoji(s: string, max: 0 | 1) {
  if (max === 1) {
    let count = 0;
    return s.replace(/\p{Extended_Pictographic}/gu, (m) => (count++ === 0 ? m : ""));
  }
  return s.replace(/\p{Extended_Pictographic}/gu, "");
}
function applyToneOverlay(text: string, customStyle?: string): string {
  if (!customStyle?.trim()) return text;
  const p = parseTone(customStyle);

  let out = text.trim();
  out = limitEmoji(out, p.emojiMax);

  if (p.bulletsOnly) {
    out = toBullets(out, p.maxSentences);
  } else {
    out = stripLists(out);
    out = limitSentences(out, p.maxSentences);
  }

  for (const ban of p.neverSay) {
    const rx = new RegExp(`\\b${ban.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig");
    out = out.replace(rx, "").replace(/\s{2,}/g, " ").trim();
  }

  return out;
}

// =======================================
// Persona shaper (uses decided qMode; no markers)
// =======================================
function shapeByPersona(
  persona: Persona,
  text: string,
  userMsg: string,
  qMode: "open" | "closed" | "none" = "open"
) {
  let s = text.trim().replace(/\n+/g, " ");
  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  const joinFirst = (n: number) => sentences.slice(0, n).join(" ");

  const ensureClosedQ = (t: string) => t.replace(/[!?]*$/, "") + "?";
  const ensureOpenQ = (t: string) =>
    /[?]/.test(t) ? t : t.replace(/[.!]*$/, "") + " What feels like the next small step for you?";
  const removeQ = (t: string) => t.replace(/[?]+/g, ".").replace(/\s+\./g, ".");

  if (persona === "adam") {
    let out = joinFirst(3);
    if (qMode === "closed") out = ensureClosedQ(out);
    if (qMode === "none") out = removeQ(out);
    return out;
  }

  if (persona === "eve") {
    let out = joinFirst(4);
    out = deTemplateEve(out, userMsg || "");
    if (qMode === "open") out = ensureOpenQ(out);
    if (qMode === "none") out = removeQ(out);
    return out;
  }

  if (persona === "custom") {
    let out = joinFirst(4);
    if (qMode === "open") out = ensureOpenQ(out);
    if (qMode === "closed") out = ensureClosedQ(out);
    if (qMode === "none") out = removeQ(out);
    return out;
  }

  let out = joinFirst(4);
  if (qMode === "none") out = removeQ(out);
  return out;
}

// =======================================
// Retrieval
// =======================================
async function embedOne(text: string): Promise<number[]> {
  const e = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  return e.data[0].embedding as number[];
}

async function retrieveContext(userMessage: string) {
  const qEmb = await embedOne(userMessage);
  const { data, error } = await supabase.rpc(RPC_NAME, {
    query_embedding: qEmb,
    match_count: RAG_TOP_K,
    similarity_threshold: RAG_SIM_THRESHOLD,
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

// =======================================
// Title helpers (2–7 words from summary)
// =======================================
function sanitizeTitle(raw: string): string {
  let t = (raw || "").trim();
  t = t.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "");
  t = t.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}]/gu,
    ""
  );
  t = t.replace(/\s+/g, " ");
  const words = t.split(" ").filter(Boolean).slice(0, 7);
  t = words.join(" ").replace(/\s+[.,:;!?]+$/g, "");
  return t.substring(0, 80).trim();
}

async function llmTitleFromSummary(summary: string): Promise<string> {
  const r = await openai.chat.completions.create({
    model: SUM_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Return JSON: {"title":"2–7 words, Title Case, no emoji"}' },
      { role: "user", content: `Create a concise conversation title from this summary:\n"""${summary}"""` }
    ],
  });
  const raw = r.choices?.[0]?.message?.content || "{}";
  let title = "";
  try { title = JSON.parse(raw).title ?? ""; } catch { title = raw; }
  return sanitizeTitle(title) || sanitizeTitle(summary.split(/\s+/).slice(0, 7).join(" ")) || "Untitled Chat";
}

async function maybeUpdateTitleFromSummary(conversationId: string, summary: string) {
  if (!summary?.trim()) return;

  const { data, error } = await supabase
    .from("conversations")
    .select("title")
    .eq("id", conversationId)
    .single();
  if (error) return;

  const current = (data?.title || "").trim();
  // allow overwrite if empty OR placeholder
  const placeholderRx = /^(untitled( chat)?|avatar builder|new chat|simple chat)$/i;
  if (current && !placeholderRx.test(current)) return;

  const newTitle = await llmTitleFromSummary(summary);
  await supabase
    .from("conversations")
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

// =======================================
// DB helpers
// =======================================
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
  const later = new Date(now.getTime() + 1);
  const rows: any[] = [
    { conversation_id: conversationId, sender_id: userId ?? null, role: "user", content: userMessage, created_at: now.toISOString() },
    { conversation_id: conversationId, sender_id: botUserId ?? null, role: "assistant", content: botAnswer, created_at: later.toISOString() },
  ];
  const { data, error } = await supabase
    .from("messages")
    .insert(rows)
    .select("id, conversation_id, sender_id, role, content, created_at")
    .order("created_at", { ascending: true });
  if (error) console.error("saveTurnToDB error:", error);
  return data ?? [];
}

async function countAssistantMessages(conversationId: string) {
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "assistant");
  if (error) console.error("countAssistantMessages error:", error);
  return count ?? 0;
}

async function loadSummary(conversationId: string): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .select("summary")
    .eq("id", conversationId)
    .single();
  if (error) console.error("loadSummary error:", error);
  return (data?.summary ?? "").slice(0, 1500);
}

async function loadLastPairs(conversationId: string, pairs: number) {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, pairs) * 2);
  if (error) {
    console.error("loadLastPairs error:", error);
    return [] as { role: "user" | "assistant"; content: string }[];
  }
  const rows = (data ?? []).reverse();
  return rows.map((r) =>
    r.role === "assistant"
      ? ({ role: "assistant" as const, content: r.content })
      : ({ role: "user" as const, content: r.content })
  );
}

async function refreshSummary({
  conversationId,
  currentSummary,
  recentTurns,
  wordsTarget = 160,
}: {
  conversationId: string;
  currentSummary: string;
  recentTurns: { role: "user" | "assistant"; content: string }[];
  wordsTarget?: number;
}) {
  const turnsTxt = recentTurns.map(
    (t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`
  ).join("\n");

  const prompt =
    `Update this running conversation summary in ~${wordsTarget} words. ` +
    `Keep key facts, goals, decisions, unresolved items; remove redundancy.\n\n` +
    `Current summary:\n${currentSummary || "(empty)"}\n\n` +
    `New turns (chronological):\n${turnsTxt}\n\n` +
    `Return only the updated summary as plain text.`;

  const resp = await openai.chat.completions.create({
    model: SUM_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  const updated = resp.choices?.[0]?.message?.content?.trim() || currentSummary;

  // Save summary and auto-title
  await supabase
    .from("conversations")
    .update({ summary: updated.slice(0, 1500) })
    .eq("id", conversationId);

  await maybeUpdateTitleFromSummary(conversationId, updated);

  return updated;
}

// =======================================
// Safety
// =======================================
const DANGER_PATTERNS: string[] = [
  "\\bsuicid(e|al)\\b","\\bdie\\b","\\bdying\\b","\\bkill(ing)? myself\\b","\\bend(ing)? my life\\b",
  "\\bdeath\\b","\\bmurder myself\\b","\\bwant to die\\b","\\bcan't go on\\b","\\bi feel hopeless\\b",
  "\\bi want to disappear\\b","\\bno reason to live\\b","\\bi wish i was dead\\b","\\bi am worthless\\b",
  "\\bi am a burden\\b",
];
const COMPILED_DANGER_PATTERNS = DANGER_PATTERNS.map((p) => new RegExp(p, "i"));
function checkFilters(userInput: string): "Imminent Danger" | null {
  for (const rx of COMPILED_DANGER_PATTERNS) if (rx.test(userInput)) return "Imminent Danger";
  return null;
}
async function classifyRisk(userMessage: string) {
  const prompt =
    `You are a safety triage classifier. Read the user's message and return a JSON object\n` +
    `with fields: tier ("Imminent" | "Acute" | "Elevated" | "Low" | "None"), signals[], protective[], user_goals[].\n` +
    `Definitions:\n- Imminent: explicit intent + plan/means/timeframe OR current attempt.\n- Acute: suicidal ideation with concerning specifics or recent attempt, but not imminent.\n- Elevated: passive ideation or severe hopelessness/self-harm urges without plan.\n- Low: distress without self-harm ideation.\n- None: no risk signals.\nUser: """${userMessage}"""\nReturn only JSON.`;
  const r = await openai.chat.completions.create({
    model: SUM_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.0,
  });
  try {
    const text = r.choices?.[0]?.message?.content?.trim() || "{}";
    return JSON.parse(text) as { tier: string; signals: string[]; protective: string[]; user_goals: string[] };
  } catch {
    return { tier: "None", signals: [], protective: [], user_goals: [] };
  }
}

// =======================================
// Healthcheck
// =======================================
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/chat (optimized)" });
}

// =======================================
// Main handler — latency-tuned
// =======================================
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      conversationId,
      userMessage,
      persona: personaRaw,
      customStyleText,
    }: {
      conversationId: string;
      userMessage: string;
      persona?: string | null;
      customStyleText?: string | null;
    } = body;

    if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    if (!userMessage)     return NextResponse.json({ error: "userMessage is required" }, { status: 400 });

    const userId = req.headers.get("x-user-id") || undefined;

    // Load stored meta (persona + previously saved tone)
    const { data: meta } = await supabase
      .from("conversations")
      .select("persona, style_json")
      .eq("id", conversationId)
      .maybeSingle();

    // Resolve persona
    const normalizePersona = (p?: string | null): Persona | null => {
      const v = (p || "").toString().trim().toLowerCase();
      if (v === "adam" || v === "eve" || v === "neutral" || v === "custom") return v as Persona;
      return null;
    };

    let effectivePersona: Persona | null = normalizePersona(personaRaw);
    if (!effectivePersona) {
      effectivePersona = (meta?.persona as Persona | undefined)
        || (customStyleText?.trim() ? "custom" : "neutral");
    }

    // Persist persona & tone (store tone in style_json.text)
    if (customStyleText?.trim()) {
      await supabase
        .from("conversations")
        .update({ persona: effectivePersona, style_json: { text: customStyleText } })
        .eq("id", conversationId);
    } else {
      await supabase
        .from("conversations")
        .update({ persona: effectivePersona })
        .eq("id", conversationId);
    }

    // always ensure row exists
    await supabase
      .from("conversations")
      .upsert({ id: conversationId, updated_at: new Date().toISOString() })
      .select("id").maybeSingle();

    // Build the effective tone text for this request:
    const toneText: string = (customStyleText?.trim()
      || (meta?.style_json as any)?.text
      || "");

    // Crisis hard stop
    const forced = checkFilters(userMessage);
    if (forced) {
      const answer = [
        "I’m really concerned about your safety.",
        "Please reach out to Lifeline Australia on 13 11 14 for 24/7 support or call 000 if you are in immediate danger.",
      ].join("\n\n");
      const inserted = await saveTurnToDB({ conversationId, userId, botUserId: BOT_USER_ID, userMessage, botAnswer: answer });
      const userRow = inserted.find((r) => r.role === "user");
      const assistantRow = inserted.find((r) => r.role === "assistant");
      return NextResponse.json({ conversationId, answer, emotion: "Negative", tier: "Imminent", suggestions: ["Call 000"], citations: [], rows: { user: userRow, assistant: assistantRow } });
    }

    // Kick off work in parallel
    const riskP = classifyRisk(userMessage);
    const profileP = (async () => {
      const uid = userId; if (!uid) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, age, locale, state, pronouns, indigenous, caregiver_role, preferred_tone")
        .eq("id", uid)
        .maybeSingle();
      return data ?? null;
    })();
    const summaryP = loadSummary(conversationId);
    const historyP = loadLastPairs(conversationId, HISTORY_PAIRS);
    const retrievalP = retrieveContext(userMessage);

    const [risk, profile, summary, historyMsgs, { context, hits }] = await Promise.all([
      riskP, profileP, summaryP, historyP, retrievalP,
    ]);

    // If a summary already exists, try to set a proper title now
    if (summary?.trim()) {
      await maybeUpdateTitleFromSummary(conversationId, summary);
    }

    // System message with voice sheet (uses toneText for custom persona)
    const voiceSheet = voiceSheetV2(effectivePersona as Persona, toneText || undefined);
    const system = [
      "You are a concise, youth-support assistant for Australia.",
      "Follow the VOICE SHEET and never break its hard constraints.",
      "Priorities: (1) Safety (2) Personalisation (3) Helpfulness (4) RAG accuracy.",
      "If context is irrelevant, ignore it. No meta talk. Plain text only.",
      "Provide suggestions if and only if the user explicitly asks for help, advice or suggestions. Otherwise, empathize with the user.",
      "\n--- VOICE SHEET ---\n" + voiceSheet,
      "\n--- PROFILE ---\n" + JSON.stringify(profile || {}),
      "\n--- SUMMARY ---\n" + (summary || "(none)"),
      "\n--- RISK ---\n" + JSON.stringify(risk || {}),
      "\n--- CONTEXT (RAG) ---\n" + (context || "(none)"),
      "\nReturn a single reply only.",
      "\nRespond appropriately to complex Gen-Z emojis based on context: 👍 = Sarcastic way of saying 'good job',  😭 = Finding something incredibly funny, cute, or overwhelmingly sweet, 💀 = Laughing hard, 🤡 = Foolishness directed at someone, ⌛ = Finding someone attractive or thicc, 🤰 = Someone is so attractive that it makes the sender feel pregnant, ✨ = Used for emphasis or sarcasm, 🔥 = Something is hot, stylish or sexy, 😅 = Everything is fine whilst being stressed, 😙 = Fondness or approval of something, 🥺 = Used to show how adorable something is, 🌚 = Michievousness or playfulness",
      "\nIf user response cannot be interpreted, tell the user: 'Sorry, but I didn't understand your message. Could you please try again?'.",
      "\nDetect sarcasm or jokes using context, emojis, and exaggerations.",
      "\nMirror casual humor where safe, but prioritize empathy and helpfulness.",
      "\nOffer simple, genuine compliments to the user naturally during the conversation.",
      "\nAlways display mathematical or scientific symbols using Unicode (e.g., ∫, π, ∞, √). Do not replace them with words unless absolutely necessary.",
      "\nWhen writing fractions, always use proper Unicode fraction symbols (e.g., ½, ⅓, ⅔, ¼, ¾) whenever possible instead of using the slash format (like 1/2 or 2/3). Use UTF-8 characters to ensure they display correctly."
    ].join("\n\n");

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...historyMsgs,
      { role: "user", content: userMessage },
    ];

    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: effectivePersona === "adam" ? 0.35 : effectivePersona === "eve" ? 0.3 : 0.25,
      presence_penalty: effectivePersona === "adam" ? 0.1 : 0,
      frequency_penalty: 0.1,
    });

    let answer = resp.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate an answer right now.";

    // Decide if/what to ask based on user turn + previous assistant turn + tone
    const qMode = decideQuestionMode(
      effectivePersona as Persona,
      userMessage,
      historyMsgs as unknown as Turn[],
      toneText || undefined
    );

    // Persona shaping (no markers)
    answer = shapeByPersona(effectivePersona as Persona, answer, userMessage, qMode);

    // Apply custom tone overlay to ANY persona
    answer = applyToneOverlay(answer, toneText || undefined);

    // Persist turn
    const inserted = await saveTurnToDB({ conversationId, userId, botUserId: BOT_USER_ID, userMessage, botAnswer: answer });

    // Background summary refresh (also auto-updates title)
    (async () => {
      try {
        const count = await countAssistantMessages(conversationId);
        const curr = await loadSummary(conversationId);
        const should = (count > 0 && count % SUMMARY_REFRESH_EVERY === 0) || !curr || curr.trim().length === 0;
        if (should) {
          const recent = await loadLastPairs(conversationId, Math.max(6, HISTORY_PAIRS));
          await refreshSummary({ conversationId, currentSummary: curr, recentTurns: recent, wordsTarget: 160 });
        }
      } catch (e) { console.error("summary refresh skipped:", e); }
    })();

    const citations = (hits || []).map((h, i) => ({
      rank: i + 1,
      file: h.file ?? null,
      chunk_id: String(h.chunk_id ?? ""),
      similarity: Number(((h.similarity ?? 0) as number).toFixed?.(3) ?? 0),
      preview: (h.content ?? "").slice(0, 180),
    }));

    const userRow = inserted.find((r) => r.role === "user");
    const assistantRow = inserted.find((r) => r.role === "assistant");

    return NextResponse.json({
      conversationId,
      answer,
      emotion: (risk.tier === "None" || risk.tier === "Low") ? "Neutral" : "Negative",
      tier: (risk.tier as string) || "None",
      resolvedPersona: effectivePersona,
      suggestions: ["Try a 60s breathing reset", "Write 1 tiny next step", "Reach a safe person"],
      citations,
      rows: { user: userRow, assistant: assistantRow },
    });
  } catch (e: any) {
    console.error("CHAT route (optimized) error:", e);
    return NextResponse.json({ error: e?.message || "chat error" }, { status: 400 });
  }
}