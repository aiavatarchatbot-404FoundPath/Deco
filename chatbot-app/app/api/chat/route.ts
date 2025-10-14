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
const DEFLECT_SIM_THRESHOLD = Number(process.env.DEFLECT_SIM_THRESHOLD || 0.72);

const HISTORY_PAIRS = Number(process.env.CHAT_MAX_PAIRS || 4);
const SUMMARY_REFRESH_EVERY = Number(process.env.SUMMARY_EVERY || 2);

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

// ---- CARE card helpers ----
type CareTier = "Imminent" | "Acute" | "Elevated";
type CareCard = {
  tier: CareTier;
  headline: string;
  body: string;
  steps: string[];
  helplines: { name: string; phone: string; when: string }[];
};

function buildCareCard(tier: CareTier): CareCard {
  const helplines = [
    { name: "Emergency",   phone: "000",         when: "Immediate danger" },
    { name: "Lifeline",    phone: "13 11 14",    when: "24/7 crisis support" },
    { name: "Beyond Blue", phone: "1300 22 4636",when: "Anxiety & depression" },
    { name: "Kids Helpline", phone: "1800 55 1800", when: "Age 5–25" },
  ];

  if (tier === "Imminent") {
    return {
      tier,
      headline: "Your safety matters right now.",
      body: "I’m really concerned about your safety.",
      steps: [
        "If you’re in danger, call 000 now.",
        "If you can, contact someone you trust nearby.",
        "You can also call Lifeline 13 11 14 (24/7).",
      ],
      helplines,
    };
  }

  if (tier === "Acute") {
    return {
      tier,
      headline: "Thanks for telling me. Let’s keep you safe.",
      body: "What you’re feeling is heavy, and you’re not alone.",
      steps: [
        "Consider talking to someone you trust today.",
        "A counsellor can help: Lifeline 13 11 14 (24/7).",
        "If risk increases, call 000.",
      ],
      helplines,
    };
  }

  // Elevated
  return {
    tier,
    headline: "I hear you. Let’s add support.",
    body: "You deserve support while you work through this.",
    steps: [
      "Small step: write one thing that could help tonight.",
      "Reach out to a friend or a support line if it gets heavier.",
    ],
    helplines,
  };
}

function careText(card: CareCard) {
  const lines = [
    `${card.headline}`,
    card.body,
    card.steps.map((s, i) => `${i + 1}) ${s}`).join("\n"),
    "Helplines:",
    card.helplines.map((h) => `- ${h.name}: ${h.phone} — ${h.when}`).join("\n"),
  ];
  return lines.filter(Boolean).join("\n\n");
}


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
  const maxItems = Math.max(1, p.maxSentences);

  return `VOICE SHEET — Custom (User-Tuned)
Follow these rules. If there is any conflict, these rules win.

Output shape:
- ${p.maxSentences} sentences/items **max**; be concise.
- ${qLine}
- ${bulletsLine}
- Plain text only; keep replies under ~${p.maxSentences <= 3 ? "80" : "120"} words when possible.

Diction & tone:
- Mirror this style exactly: ${customStyle || "(no extra style provided)"}.
- ${p.dictionHints.join(" ")}
${emojiLine}

Big-picture & detours:
- Always keep **BIG_PICTURE.primary** in mind.
- If **HINTS.off_track** is true: (1) briefly acknowledge the detour, (2) bridge back to BIG_PICTURE.primary, (3) offer **one tiny next step** aligned to it.
- If **HINTS.insistent** is true: first give a **brief, safe answer** to the detour (≤2–3 sentences / ≤${maxItems} items), then **pivot back** with one tiny next step.
- If the detour clearly supports the primary goal, continue; otherwise politely **park it**.

Formatting:
- No meta talk or boilerplate.
- If listing, keep to ≤${maxItems} items, short lines.

Avoid:
- Hedging like "might", "perhaps" unless the user asks for uncertainty.
- Templated intros like "Here are X...".
- Never say: ${p.neverSay.join("; ")}.`;
}

if (persona === "adam") {
  return `VOICE SHEET — Adam (Direct Coach)

Output shape:
- Max **3** sentences; blunt, kinetic. Fragments allowed.
- **End with a micro-plan** (≤2 steps) or a one-line CTA: “Do X in 5 min.”
- At most **one short closed** question — only if it triggers action.

Diction:
- Everyday Aussie person; crisp verbs: “book”, “text”, “ask”, “set a 5-min timer”.
- Use “let’s”, “right now”, “pick one”. **No hedging**.

Formatting:
- If giving a plan, keep it inline: “1) … 2) …” (no bullets).
- Prefer numbers/time-boxes (“2 texts”, “5-min”, “today”).

Detours:
- Acknowledge in ≤1 clause → **bridge back** to BIG_PICTURE.primary → give **one** tiny next step.
- If user **insists**, give a **brief, safe answer** (≤2 sentences) **then** CTA back to the goal.

Avoid:
- Therapy openers, long empathy preambles, option dumps without a recommendation.
- Qualifiers (“maybe”, “might”), softeners, or hype.

Never say:
- “That makes sense.” “We can unpack it together.”`;
}

if (persona === "eve") {
  return `VOICE SHEET — Eve (Warm Guide)

Output shape:
- Up to **4** sentences, calm and steady. **No fragments.**
- **Begin with validation/reflection**, then offer a gentle suggestion.
- At most **one open** question, near the end.


Diction & tone:
- Gentle verbs: “notice”, “we can explore”, “it could help”, “if you’d like”.
- Use “**we can**”, not “let’s”. Invite consent (“would you like…”).

Formatting:
- Offer exactly **one tiny step** framed as an **invitation** (not an order).
- Name the value/need you’re supporting (e.g., safety, clarity, rest).

Detours:
- Acknowledge the new topic → **ask consent to park or answer briefly** → weave back to BIG_PICTURE.primary with a soft nudge.
- If user **insists**, give a **brief, kind answer** (≤3 sentences), then **co-create** one gentle next step.

Avoid:
- Imperatives, time-boxing, slang, hype, or jokes when distressed.
- Starting with “It sounds like” / “It seems”.

Never say:
- “Got your back”, “we’ll keep it simple.”`;
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
// Question control helpers + big-picture utils
// =======================================
// How similar two user turns must be to count as "same detour"
const SAME_TOPIC_SIM = Number(process.env.SAME_TOPIC_SIM || 0.72);

function getLastNUserMsgs(history: {role:"user"|"assistant";content:string}[], n=2) {
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < n; i--) {
    if (history[i].role === "user") out.push(history[i].content);
  }
  return out;
}

async function computeInsistent(userMessage: string, summary: string, historyMsgs: Turn[]) {
  const lastUsers = getLastNUserMsgs(historyMsgs, 2);
  const { off: offNow } = await computeOffTrack(userMessage, summary);

  let streak = 0;
  for (const m of lastUsers) {
    const { off } = await computeOffTrack(m, summary);
    if (off) streak++;
  }

  // Same detour topic?
  let sameTopic = false;
  if (lastUsers[0]) {
    const [a,b] = await Promise.all([embedOne(userMessage), embedOne(lastUsers[0])]);
    sameTopic = cosineSim(a,b) >= SAME_TOPIC_SIM;
  }

  return { insistent: offNow && (streak > 0 || sameTopic) };
}

function cosineSim(a: number[], b: number[]) {
  let dp = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    dp += x * y; na += x * x; nb += y * y;
  }
  return dp / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

async function extractAnchors(summary: string, risk?: { user_goals?: string[] }) {
  const seedGoals = (risk?.user_goals ?? []).filter(Boolean).slice(0, 3);
  if (!summary?.trim() && seedGoals.length === 0) return null;

  if (seedGoals.length > 0) {
    return {
      primary: String(seedGoals[0]).slice(0, 160),
      subgoals: seedGoals.slice(1).map(String),
      nonnegotiables: [] as string[],
    };
  }

  const r = await openai.chat.completions.create({
    model: SUM_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Return JSON: {"primary":"...", "subgoals":["..."], "nonnegotiables":["..."]}' },
      { role: "user", content: `From this running summary, extract the big picture.\nSummary:\n"""${summary.slice(0, 1500)}"""` }
    ],
  });

  const raw = r.choices?.[0]?.message?.content ?? "{}";

  let obj: any = {};
  try { obj = JSON.parse(raw); } catch { obj = {}; }

  const primary = String(obj.primary ?? "").slice(0, 160);
  const subgoals = Array.isArray(obj.subgoals) ? obj.subgoals.map((x: any) => String(x)).slice(0, 3) : [];

  const nnSrc =
    obj.nonnegotiables ??
    obj.non_negotiables ??
    obj.nonNegotiables ??
    obj.non_negs ??
    obj.nn ??
    [];
  const nonnegotiables = Array.isArray(nnSrc) ? nnSrc.map((x: any) => String(x)).slice(0, 3) : [];

  if (primary) return { primary, subgoals, nonnegotiables };

  const firstSentence = (summary || "").match(/[^.!?]+[.!?]?/)?.[0] || summary.slice(0, 160);
  return { primary: firstSentence, subgoals: [], nonnegotiables: [] as string[] };
}

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
  if (ua.isQuestion) return "none";
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

// 👉 Deflection detector (needs embedOne)
async function computeOffTrack(userMessage: string, summary: string) {
  if (!summary?.trim()) return { off: false, sim: 1 };
  const [msgEmb, sumEmb] = await Promise.all([
    embedOne(userMessage),
    embedOne(summary.slice(0, 1000)),
  ]);
  const sim = cosineSim(msgEmb, sumEmb);
  return { off: sim < DEFLECT_SIM_THRESHOLD, sim: Number(sim.toFixed(3)) };
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

async function maybeUpdateTitleFromSummary(
  conversationId: string,
  summary: string,
  mode: "always" | "placeholderOnly" = "placeholderOnly"
) {
  if (!summary?.trim()) return;

  const { data, error } = await supabase
    .from("conversations")
    .select("title")
    .eq("id", conversationId)
    .single();
  if (error) return;

  const current = (data?.title || "").trim();

  if (mode === "placeholderOnly") {
    const placeholderRx = /^(untitled( chat)?|avatar builder|new chat|simple chat)$/i;
    if (current && !placeholderRx.test(current)) return;
  }

  const newTitle = await llmTitleFromSummary(summary);
  if (!newTitle || newTitle === current) return;

  await supabase
    .from("conversations")
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

async function saveSummary(conversationId: string, summary: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ summary: summary.slice(0, 1500) })
    .eq("id", conversationId);
  if (error) console.error("saveSummary error:", error);
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

  // Save summary and auto-title
  await supabase
    .from("conversations")
    .update({ summary: updated.slice(0, 1500) })
    .eq("id", conversationId);

  // Force title refresh whenever rolling summary updates
  await maybeUpdateTitleFromSummary(conversationId, updated, "always");

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

    // Crisis hard stop (regex) → Imminent CARE card
const forced = checkFilters(userMessage);
if (forced) {
  const card = buildCareCard("Imminent");
  const answer = careText(card);
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
    tier: "Imminent",
    care_card: card,
    emotion: "Negative",
    citations: [],
    rows: { user: userRow, assistant: assistantRow },
  });
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
    // Deterministic CARE path for Imminent/Acute (LLM classifier)
const riskTier = (risk?.tier as string) || "None";
if (riskTier === "Imminent" || riskTier === "Acute") {
  const card = buildCareCard(riskTier as CareTier);
  const answer = careText(card);
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
    tier: riskTier,
    care_card: card,
    emotion: "Negative",
    citations: [],
    rows: { user: userRow, assistant: assistantRow },
  });
}

    // If a summary already exists, try to set a proper title now
    if (summary?.trim()) {
      await maybeUpdateTitleFromSummary(conversationId, summary);
    }

    const anchors = await extractAnchors(summary, risk as any);
    const { off: offTrack, sim: offSim } = await computeOffTrack(userMessage, summary);
    const prevUserMsg = [...historyMsgs].reverse().find((m) => m.role === "user")?.content || "";
const { off: prevOff } = await computeOffTrack(prevUserMsg, summary);
const { insistent } = await computeInsistent(userMessage, summary, historyMsgs as any);


    // System message with voice sheet (uses toneText for custom persona)
    const voiceSheet = voiceSheetV2(effectivePersona as Persona, toneText || undefined);
    const system = [
      "You are a concise, youth-support assistant for Australia.",
      "Follow the VOICE SHEET and never break its hard constraints.",
      "Priorities: (1) Safety (2) Personalisation (3) Helpfulness (4) RAG accuracy (5) Coherence with BIG_PICTURE).",
      "Provide suggestions if and only if the user explicitly asks for help, advice or suggestions. Otherwise, empathize with the user.",
      "Return a single reply only.",
      "If user response cannot be interpreted, tell the user: 'Sorry, but I didn't understand your message. Could you please try again?'.",
      "Detect sarcasm using context, emojis, and exaggerations and respond to it appropriately.",
      "Mirror casual humor where safe, but prioritize empathy and helpfulness.",
      "Offer simple, genuine compliments to the user naturally during the conversation.",
      "Always display mathematical or scientific symbols using UTF-8 characters (e.g. Integrals, fractions, exponentials and powers, square roots, etc)."

      "\n--- VOICE SHEET ---\n" + voiceSheet,
      "\n--- PROFILE ---\n" + JSON.stringify(profile || {}),
      "\n--- SUMMARY ---\n" + (summary || "(none)"),
      "\n--- BIG_PICTURE ---\n" + JSON.stringify(anchors || {}),
     "\n--- HINTS ---\n" + JSON.stringify({
  off_track: offTrack,
  insistent,
  sim_to_summary: offSim,
  deflect_threshold: DEFLECT_SIM_THRESHOLD
}),

      "\n--- RISK ---\n" + JSON.stringify(risk || {}),
      "\n--- CONTEXT (RAG) ---\n" + (context || "(none)"),

     "\nGuidance:\n" +
"- Keep BIG_PICTURE.primary in mind on every turn.\n" +
"- If HINTS.off_track is true, do three moves: (1) briefly acknowledge the detour, (2) bridge back to BIG_PICTURE.primary in one sentence, (3) offer ONE tiny next step aligned to BIG_PICTURE.primary. Respect persona question rules.\n" +
"- If HINTS.insistent is true, FIRST give a brief, safe answer to the detour (≤3 sentences, neutral, no refusal unless unsafe/illegal), THEN explicitly pivot back with ONE tiny next step on the primary goal (e.g., a single concrete action).\n" +
"- Treat benign detours as allowed (e.g., everyday how-tos, definitions, simple tips, study/admin questions). Do not refuse benign requests; keep the mini-answer short and then return to the main goal.\n" +
"- If the detour clearly supports the primary goal, continue; otherwise park it politely and propose the next step on the primary goal."+

 "\nSafety:\n" +
"- If RISK.tier is \"Imminent\" or \"Acute\", strongly urge the user to seek immediate in-person help, e.g. Lifeline 13 11 14 or emergency services 000.\n" +
"- If RISK.tier is \"Elevated\", validate their feelings and encourage seeking support from trusted people or professionals.\n" +
"- If RISK.tier is \"Low\" or \"None\", proceed normally but stay alert for future risk signals.\n" +
"- Never say you are a crisis service or can provide emergency help.\n" +
      "\nReturn a single reply only.",
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
    if (riskTier === "Elevated") {
  const footer = "\n\nIf it gets heavier, you can call Lifeline (13 11 14, 24/7). If you’re in danger, call 000.";
  answer += footer;
}

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
