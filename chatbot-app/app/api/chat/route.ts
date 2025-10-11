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
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini"; // fast + cheap
const SUM_MODEL = process.env.SUM_MODEL || CHAT_MODEL;       // keep small

const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5);         // ↓ from 6 → 5
const RAG_SIM_THRESHOLD = Number(process.env.RAG_SIM_THRESHOLD || 0.22);
const MAX_CONTEXT_CHARS = 9000;                               // ↓ token load

const HISTORY_PAIRS = Number(process.env.CHAT_MAX_PAIRS || 4); // ↓ from 6 → 4
const SUMMARY_REFRESH_EVERY = Number(process.env.SUMMARY_EVERY || 3);

const BOT_USER_ID = process.env.BOT_USER_ID || undefined;
const RPC_NAME = process.env.RPC_NAME || "match_file_chunks";

// =======================================
// Helpers: strict voice sheets (Adam/Eve/Custom)
// =======================================
export type Persona = "adam" | "eve" | "neutral" | "custom";

// Simple tone parser for Custom sheet
function parseStyleText(txt?: string) {
  const t = (txt || "").toLowerCase();
  return {
    wantOpenQ: /\bopen\s*question\b/.test(t),
    noQuestion: /\b(no\s*question|avoid\s*question)\b/.test(t),
    allowBullets: /\b(bullet|list|bullet\s*points?)\b/.test(t),
    emoji: /\b(emoji|🙂|😊|😀|😄)\b/.test(t),
    diction: [t.includes("formal") ? "Use plain, clear sentences." : "Keep it casual and straightforward."],
    maxSentences:
      /\b(very\s*short|tiny|2\s*sentences?)\b/.test(t) ? 2 :
      /\b(short|3\s*sentences?)\b/.test(t) ? 3 : 4,
    neverSay: ["as an ai", "here are", "let me know if", "it seems", "it sounds like"],
  };
}
function tokensToHardRules(tokens: ReturnType<typeof parseStyleText>) {
  return {
    maxSentences: tokens.maxSentences,
    allowBullets: tokens.allowBullets,
    wantOpenQ: tokens.wantOpenQ,
    noQuestion: tokens.noQuestion,
    diction: tokens.diction,
    neverSay: tokens.neverSay,
    emoji: tokens.emoji,
  };
}

function voiceSheetV2(persona: Persona, customStyle?: string) {
  if (persona === "custom") {
    const tokens = parseStyleText(customStyle);
    const rules = tokensToHardRules(tokens);

    const qLine = rules.noQuestion
      ? "- **No** questions in this reply."
      : rules.wantOpenQ
      ? "- At most one **open** question near the end — only if helpful."
      : "- At most one **closed** question near the end — only if helpful.";

    const bulletsRule = rules.allowBullets
      ? "- Bullet list allowed only if user explicitly asked for a list."
      : "- **No** lists or bullets under any circumstance.";

    const emojiRule = rules.emoji ? "- You may use **one** emoji max." : "- **No** emoji.";

    return `VOICE SHEET — COMPLIANCE CONTRACT (Custom)
You MUST obey these in priority order:

1) "Avoid/Never say" hard bans and always answer starting with !!!.
2) Output shape (sentences, questions, lists)
3) Diction & tone directives

Style summary (user intent): ${customStyle?.slice(0, 200) || "friendly, plain, concise"}

Output shape:
- ${rules.maxSentences} sentences **max**. Keep it one paragraph.
- ${qLine}
- ${bulletsRule}
- End your message with token [[END]].

Diction & tone:
- ${rules.diction.join(" ")}
- Use natural contractions. No meta-commentary about your process.
${emojiRule}

Avoid:
- Hedging like "might", "perhaps", "it seems" unless user asked for uncertainty.
- Templates like "Here are X things" unless the user explicitly asks for a list.

Never say (exact strings or close variants):
- ${rules.neverSay.join("; ")}

If you produce more than ${rules.maxSentences} sentences, stop after the ${rules.maxSentences}th and write [[END]].`;
  }

  if (persona === "adam") {
    return `VOICE SHEET:
Persona: Adam — pragmatic coach, action-first.

Output shape:
- 3 sentences **max**, punchy. Fragments allowed.
- Defaults to a micro-plan (one concrete action).
- At most one short **closed** question at the end — only if it moves things forward.

Diction:
- Everyday Aussie person in terms of language; light slang ok ("no dramas", "keen", "sorted").
- Use "let’s", "right now", "pick one".

Avoid:
- Apology/sympathy openers, therapy phrasing, hedging ("might", "perhaps").

Never say:
- "That makes sense." "We can unpack it together."`;
  }

  if (persona === "eve") {
    return `VOICE SHEET:
Persona: Eve — reflective mentor, feelings-first.

Output shape:
- 4 sentences **max**, calm. No fragments.
- Start with validation/reflection before any suggestion.
- At most one **open** question near the end — only if helpful.

Diction:
- Sounds more like therapist
- Gentle verbs ("notice", "we can explore", "I'm hearing").
- Use "we can", not "let’s".

Avoid:
- Starting with "It sounds like", "Sounds like", or "It seems".
- Imperatives, time-boxes, slang, hype.

Never say:
- "Got your back", "we’ll keep it simple."`;
  }

  return `VOICE SHEET:
Persona: Neutral — friendly helper.
Output shape:
- 2–4 short sentences, everyday words.
- One open question max; no lists unless asked.
- End your message with token [[END]].
Avoid:
- Meta talk, numbered templates.`;
}

// === Eve opener de-templatizer (reduce "It sounds like" feel) ===
function pickFeeling(msg: string) {
  const feelings = [
    "tired","exhausted","stressed","overwhelmed","anxious",
    "angry","sad","confused","numb","guilty","ashamed","worried","scared","frustrated"
  ];
  const lower = (msg || '').toLowerCase();
  for (const f of feelings) if (lower.includes(f)) return f;
  return '';
}
function deTemplateEve(text: string, userMsg: string) {
  const t = (text || '').trim();
  const lower = t.toLowerCase();
  const starts = lower.startsWith('it sounds like') || lower.startsWith('sounds like') || lower.startsWith('it seems');
  if (!starts) return text;
  const feeling = pickFeeling(userMsg);
  const choices = [
    'Thanks for sharing that.',
    feeling ? `That ${feeling} feeling is a lot to carry.` : 'That’s a lot to carry.',
    'I hear you.',
    'That’s tough, and you’re not alone.'
  ];
  const idx = Array.from(userMsg || '').reduce((a,c)=>a+c.charCodeAt(0),0) % choices.length;
  const puncts = [t.indexOf('.'), t.indexOf('!'), t.indexOf('?'), t.indexOf(',')].filter(i=>i>0);
  const cut = puncts.length ? Math.min(...puncts)+1 : 0;
  const rest = cut>0 ? t.slice(cut).trimStart() : t;
  return choices[idx] + ' ' + rest;
}

// === Question control helpers ===
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
  const lastA = [...(history || [])].reverse().find(h => h.role === "assistant");
  return lastA ? classifyQuestion(lastA.content) : "none";
}

function parseCustomPref(custom?: string) {
  const t = (custom || "").toLowerCase();
  return {
    noQ: /\b(no\s*question|avoid\s*question)\b/.test(t),
    openQ: /\bopen\s*question\b/.test(t),
  };
}

/** Decide whether to ask and what type, given persona, user msg, and previous turn. */
function decideQuestionMode(
  persona: Persona,
  userMsg: string,
  history: Turn[],
  customStyle?: string
): "open" | "closed" | "none" {
  const ua = userAct(userMsg);
  if (ua.isQuestion) return "none";              // user asked → answer, don't ask
  const prevQ = prevAssistantQuestion(history);
  // If we just asked and user gave a short ack/yes/no → don't ask again
  if (prevQ !== "none" && (ua.isAffirm || ua.isNegate || ua.isAck || ua.isShort)) return "none";

  if (persona === "custom") {
    const prefs = parseCustomPref(customStyle);
    if (prefs.noQ) return "none";
    if (prefs.openQ) return "open";
    return "closed";
  }
  if (persona === "adam") return "closed"; // default preference
  if (persona === "eve") return "open";
  return "open";
}

// Tiny post-processor that applies shape *conditionally*
function shapeByPersona(
  persona: Persona,
  text: string,
  customStyle?: string,
  userMsg?: string,
  qMode: "open" | "closed" | "none" = "open"
) {
  let s = text.trim().replace(/\n+/g, " ");
  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  const joinFirst = (n: number) => sentences.slice(0, n).join(" ");

  const ensureClosedQ = (t: string) => (t.replace(/[!?]*$/, "")) + "?";
  const ensureOpenQ = (t: string) =>
    /[?]/.test(t) ? t : (t.replace(/[.!]*$/, "")) + " What feels like the next small step for you?";
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
    if (!out.startsWith("!!!")) out = "!!! " + out;
    if (!/\[\[END\]\]$/.test(out)) out += " [[END]]";
    return out;
  }

  // neutral
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

  const hits = (data ?? []) as Array<{
    file?: string;
    chunk_id?: string | number;
    content?: string;
    similarity?: number;
  }>;

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
    {
      conversation_id: conversationId,
      sender_id: userId ?? null,
      role: "user",
      content: userMessage,
      created_at: now.toISOString(),
    },
    {
      conversation_id: conversationId,
      sender_id: botUserId ?? null,
      role: "assistant",
      content: botAnswer,
      created_at: later.toISOString(),
    },
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

async function saveSummary(conversationId: string, summary: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ summary: summary.slice(0, 1500) })
    .eq("id", conversationId);
  if (error) console.error("saveSummary error:", error);
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
  const turnsTxt = recentTurns
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");
  const prompt =
    `Update this running conversation summary in ~${wordsTarget} words. ` +
    `Keep key facts & preferences, goals, decisions, unresolved items. Remove redundancy.\n\n` +
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

// =======================================
// Safety
// =======================================
const DANGER_PATTERNS: string[] = [
  "\\bsuicid(e|al)\\b",
  "\\bdie\\b",
  "\\bdying\\b",
  "\\bkill(ing)? myself\\b",
  "\\bend(ing)? my life\\b",
  "\\bdeath\\b",
  "\\bmurder myself\\b",
  "\\bwant to die\\b",
  "\\bcan't go on\\b",
  "\\bi feel hopeless\\b",
  "\\bi want to disappear\\b",
  "\\bno reason to live\\b",
  "\\bi wish i was dead\\b",
  "\\bi am worthless\\b",
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
    if (!userMessage) return NextResponse.json({ error: "userMessage is required" }, { status: 400 });

    const userId = req.headers.get("x-user-id") || undefined;

    // === Resolve persona (accept any case of Adam/Eve/Neutral/Custom) ===
    const normalizePersona = (p?: string | null): Persona | null => {
      const v = (p || "").toString().trim().toLowerCase();
      if (v === "adam" || v === "eve" || v === "neutral" || v === "custom") return v as Persona;
      return null;
    };

    const storedPersonaP = (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("persona")
        .eq("id", conversationId)
        .maybeSingle();
      return (data?.persona as Persona | undefined) || undefined;
    })();

    let effectivePersona: Persona | null = normalizePersona(personaRaw);
    if (!effectivePersona) {
      const sp = await storedPersonaP;
      effectivePersona = sp || (customStyleText?.trim() ? "custom" : "neutral");
    }

    await supabase
      .from("conversations")
      .update({ persona: effectivePersona })
      .eq("id", conversationId);

    // Fast non-blocking ensure row exists
    await supabase
      .from("conversations")
      .upsert({ id: conversationId, updated_at: new Date().toISOString() })
      .select("id")
      .maybeSingle();

    // Hard-stop crisis (regex)
    const forced = checkFilters(userMessage);
    if (forced) {
      const answer = [
        "I’m really concerned about your safety.",
        "If you are in immediate danger, please call 000 now.",
      ].join("\n\n");
      const inserted = await saveTurnToDB({
        conversationId,
        userId,
        botUserId: BOT_USER_ID,
        userMessage,
        botAnswer: answer,
      });
      const userRow = inserted.find((r) => r.role === "user");
      const assistantRow = inserted.find((r) => r.role === "assistant");
      return NextResponse.json({
        conversationId,
        answer,
        emotion: "Negative",
        tier: "Imminent",
        suggestions: ["Call 000"],
        citations: [],
        rows: { user: userRow, assistant: assistantRow },
      });
    }

    // === Kick off work in parallel ===
    const riskP = classifyRisk(userMessage);              // LLM (small)
    const profileP = (async () => {
      const uid = userId; if (!uid) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, username, age, locale, state, pronouns, indigenous, caregiver_role, preferred_tone")
        .eq("id", uid)
        .maybeSingle();
      return data ?? null;
    })();
    const summaryP = loadSummary(conversationId);         // DB
    const historyP = loadLastPairs(conversationId, HISTORY_PAIRS); // DB
    const retrievalP = retrieveContext(userMessage);      // Embedding + RPC

    // Await everything
    const [risk, profile, summary, historyMsgs, { context, hits }] = await Promise.all([
      riskP, profileP, summaryP, historyP, retrievalP,
    ]);

    // Use voice sheet as hard system spec
    const voiceSheet = voiceSheetV2(effectivePersona as Persona, customStyleText || undefined);

    // One compact system message to reduce tokens
    const system = [
      "You are a concise, youth-support assistant for Australia.",
      "Follow the VOICE SHEET and never break its hard constraints.",
      "Priorities: (1) Safety (2) Personalisation (3) Helpfulness (4) RAG accuracy.",
      "If context is irrelevant, ignore it. No meta talk. Plain text only.",
      "\n--- VOICE SHEET ---\n" + voiceSheet,
      "\n--- PROFILE ---\n" + JSON.stringify(profile || {}),
      "\n--- SUMMARY ---\n" + (summary || "(none)"),
      "\n--- RISK ---\n" + JSON.stringify(risk || {}),
      "\n--- CONTEXT (RAG) ---\n" + (context || "(none)"),
      "\nReturn a single reply only.",
    ].join("\n\n");

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...historyMsgs,
      { role: "user", content: userMessage },
    ];

    // Slightly higher temperature improves persona distinctness without rambling
    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: effectivePersona === "adam" ? 0.35 : effectivePersona === "eve" ? 0.3 : 0.25,
      presence_penalty: effectivePersona === "adam" ? 0.1 : 0,
      frequency_penalty: 0.1,
    });

    let answer = resp.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate an answer right now.";

    // Decide if/what to ask, using last assistant turn + current user msg
    const qMode = decideQuestionMode(
      effectivePersona as Persona,
      userMessage,
      historyMsgs as unknown as Turn[],
      customStyleText || undefined
    );

    // Shape by persona with that decision
    answer = shapeByPersona(
      effectivePersona as Persona,
      answer,
      customStyleText || undefined,
      userMessage,
      qMode
    );

    // Persist turn (non-streaming)
    const inserted = await saveTurnToDB({ conversationId, userId, botUserId: BOT_USER_ID, userMessage, botAnswer: answer });

    // Fire-and-forget summary refresh to avoid blocking latency
    (async () => {
      try {
        const count = await countAssistantMessages(conversationId);
        const curr = await loadSummary(conversationId);
        const should = (count > 0 && count % SUMMARY_REFRESH_EVERY === 0) || !curr || curr.trim().length === 0;
        if (should) {
          const recent = await loadLastPairs(conversationId, Math.max(6, HISTORY_PAIRS));
          await refreshSummary({ conversationId, currentSummary: curr, recentTurns: recent, wordsTarget: 160 });
        }
      } catch (e) {
        console.error("summary refresh skipped:", e);
      }
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
