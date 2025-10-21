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
const MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS || 6500); // ↓ slightly to reduce tokens
const DEFLECT_SIM_THRESHOLD = Number(process.env.DEFLECT_SIM_THRESHOLD || 0.72);

const HISTORY_PAIRS = Number(process.env.CHAT_MAX_PAIRS || 4);
const SUMMARY_REFRESH_EVERY = Number(process.env.SUMMARY_EVERY || 2);

const BOT_USER_ID = process.env.BOT_USER_ID || undefined;
const RPC_NAME = process.env.RPC_NAME || "match_file_chunks";

export type Persona = "adam" | "eve" | "neutral" | "custom";




// =======================================
// Micro-cache for embeddings (survives warm Lambda)
// =======================================
type Emb = number[];
const EMB_CACHE = new Map<string, Emb>();
const EMB_CACHE_MAX = 200;
function fastHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return String(h >>> 0);
}
function getCachedEmb(s: string): Emb | null {
  const k = fastHash(s);
  return EMB_CACHE.get(k) ?? null;
}
function setCachedEmb(s: string, v: Emb) {
  const k = fastHash(s);
  if (!EMB_CACHE.has(k) && EMB_CACHE.size >= EMB_CACHE_MAX) {
    // simple LRU-ish: delete first key
    const first = EMB_CACHE.keys().next().value;
    if (first) EMB_CACHE.delete(first);
  }
  EMB_CACHE.set(k, v);
}
async function embedMany(texts: string[]): Promise<Emb[]> {
  const unique: string[] = [];
  const order: number[] = [];
  const out: (Emb | null)[] = [];

  texts.forEach((t, i) => {
    const cached = getCachedEmb(t);
    if (cached) { out[i] = cached; }
    else {
      order.push(i);
      unique.push(t);
      out[i] = null;
    }
  });

  if (unique.length > 0) {
    const resp = await openai.embeddings.create({ model: EMBED_MODEL, input: unique });
    unique.forEach((t, j) => {
      const emb = resp.data[j].embedding as Emb;
      setCachedEmb(t, emb);
      out[order[j]] = emb;
    });
  }

  return out as Emb[];
}
async function embedOne(text: string): Promise<Emb> {
  const cached = getCachedEmb(text);
  if (cached) return cached;
  const e = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  const emb = e.data[0].embedding as Emb;
  setCachedEmb(text, emb);
  return emb;
}

function cosineSim(a: Emb, b: Emb) {
  let dp = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    dp += x * y; na += x * x; nb += y * y;
  }
  return dp / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

// =======================================
// Tone parsing & persona sheets (unchanged behavior with small fixes)
// =======================================
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
  let maxSentences = 4;
  if (/\b(very\s*short|tiny|2\s*sentences?)\b/.test(t)) maxSentences = 2;
  else if (/\b(short|3\s*sentences?)\b/.test(t))        maxSentences = 3;
  else if (/\b(long|6\s*sentences?)\b/.test(t))         maxSentences = 6;

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
const NEUTRAL_BANNED = [
  /(^|\b)got it[.!]?( |$)/i,
  /want (a )?tiny next step\??/i,
  /\bkeen\??$/i
];

function shouldAvoidQuestions(lastUser: string) {
  const s = (lastUser || "").trim().toLowerCase();
  const short = s.split(/\s+/).length <= 3;
  const ack = /^(thanks|thank you|ok|okay|cool|sure|yep|yup|nah|nope|great|awesome|cheers|👍|🙏|👌)[.!]?$/.test(s);
  return short || ack;
}



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
- If **HINTS.off_track** is true: (1) acknowledge, (2) bridge back, (3) one tiny next step.
- If **HINTS.insistent** is true: brief safe answer (≤${maxItems} items), then pivot back.

Formatting:
- No meta talk or boilerplate.
- If listing, keep to ≤${maxItems} items, short lines.

Avoid:
- Hedging like "might", "perhaps" unless requested.
- Templated intros like "Here are X...".
- Never say: ${p.neverSay.join("; ")}.`;
  }

  if (persona === "adam") {
  return `VOICE SHEET — Adam (Aussie mate, straight-up)

Output:
- Max **3** short sentences. Snappy. No fluff.
- Be casual and direct; **light Aussie slang** is fine ("mate", "keen?", "no dramas", "give it a go").
- End with a a **short closed question** that triggers action when its appropriate to ask a qns or a short plan on how to deal with current situation or who to reach out to.


Style rules:
- Use contractions: you're, it's, don't.
- Prefer verbs: text, call, book, step outside, set a 5-min timer.
- **No therapy phrases**: avoid “It’s important to talk about your feelings”, “I understand how you feel”, “consider reaching out to…”.
- **No lists** unless it’s an inline 1) 2) plan.

Detours:
- One clause to acknowledge → **bridge back** → one tiny step.
`;
}


  if (persona === "eve") {
    return `VOICE SHEET — Eve (Warm Guide)
Output:
- Up to **4** sentences. **Begin with validation**, then a gentle suggestion.
- At most **one open** question near the end.
Diction:
- “we can explore…”, “if you’d like…”, name the value (safety, clarity, rest).
Formatting:
- Offer **one tiny step** as an invitation (not an order).
Detours:
- Acknowledge → ask consent to park or answer briefly → weave back to BIG_PICTURE.`;
  }

  if (persona === "neutral") {
  return `VOICE SHEET — Neutral (respectful)

Output:
- 1–3 short sentences, everyday words.
- Prefer statements over questions. After a short/affirmative reply (“thanks”, “ok”, emoji), do **not** ask a question.
- When offering help, use: “If I may suggest, <one optional, concrete step>.”
- No lists unless asked. Mirror the user’s tone; avoid “should/must”.

Avoid:
- Meta talk, templates, or “tiny-next-step” style prompts.`;
}

  return `VOICE SHEET — Neutral
Output:
- 2–4 short sentences, everyday words. One open question max; no lists unless asked.
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
const SAME_TOPIC_SIM = Number(process.env.SAME_TOPIC_SIM || 0.72);

type Turn = { role: "user" | "assistant"; content: string };

function userAct(msg: string) {
  const m = (msg || "").trim();
  const lower = m.toLowerCase();
  const isQuestion = /[?]$|^(what|how|why|when|where|which|who|can|could|should|do|does|did|is|are|will|would|may|might)\b/i.test(m);
  const isAffirm = /^(y|ya|yeah|yup|yep|sure|ok(?:ay)?|alright|do it|go ahead|sounds good|done|i did|will do)\b/.test(lower);
  const isNegate = /^(no|nah|not now|not yet|can't|won'?t|don'?t|stop|wait)\b/.test(lower);
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
 // --- Adam helper bits (slang + CTA + de-therapy) ---
function randFrom<T>(arr: T[], seed: string): T {
  // deterministic-ish pick per message (no global RNG)
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const idx = Math.abs(h) % arr.length;
  return arr[idx];
}

// server (Node/Next) — use Service Role for DB writes
async function createAnonConversation({ clientId }: { clientId: string }) {
  const ttlHours = 24; // choose your window
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      is_ephemeral: true,
      expires_at: expiresAt,
      anon_consent: false,
      client_id: clientId,
      // any other columns you maintain: title, mode, etc.
    })
    .select()
    .single();

  if (error) throw error;
  return data; // return { id, ... }
}

async function insertAnonMessage({
  conversationId, clientId, content
}: { conversationId: string; clientId: string; content: string }) {
  // The trigger will reject if convo isn’t ephemeral/consented or TTL expired
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content,
    sender_id: null,
    client_id: clientId
  });
  if (error) throw error;
}
async function consentLongTerm(conversationId: string) {
  const { error } = await supabase
    .from('conversations')
    .update({
      anon_consent: true,
      is_ephemeral: false,
      expires_at: null
    })
    .eq('id', conversationId);
  if (error) throw error;
}

// attach the anon convo to the authenticated user — your schema may have owner_id
async function adoptAnonConversation({ conversationId, clientId, userId }:{
  conversationId: string, clientId: string, userId: string
}) {
  const { error } = await supabase
    .from('conversations')
    .update({
      owner_id: userId,
      anon_consent: true,     // they chose to keep it
      is_ephemeral: false,
      expires_at: null
    })
    .eq('id', conversationId)
    .eq('client_id', clientId);
  if (error) throw error;
}


function adamReplacements(s: string) {
  // kill therapy-ish boilerplate and formal talk
  const bad = [
    /it('?| i)s important to (talk|speak) (to|with) someone about (your )?feelings/gi,
    /consider (talking|reaching) out to (a )?(friend|family member|someone you trust)/gi,
    /you should/gi,
    /it's okay to/gi,
    /i (understand|hear) how you feel/gi,
    /i'?m here to help/gi,
    /let me know if/gi
  ];
  for (const rx of bad) s = s.replace(rx, "");
  // tighten spaces
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function sprinkleAussie(s: string, seed: string) {
  const openers = ["Righto.", "Sweet.", "No dramas.", "Too easy.", "Fair enough.", "Alright."];
  const tagQs   = ["Keen?", "Sound good?", "Deal?", "On it?", "Cool?"];
  // 30% chance to add opener if not present
  if (!/^[A-Z]/.test(s) && s.length > 0) s = s[0].toUpperCase() + s.slice(1);
  if (s.split(" ").length > 4 && Math.abs(seed.length % 10) < 3) {
    s = `${randFrom(openers, seed)} ${s}`;
  }
  // if ends too flat and has no question, maybe add a tag question
  if (!/[?]$/.test(s) && s.length < 150) {
    s = s.replace(/[.!]+$/, "");
    if (Math.abs(seed.length % 10) < 4) s += ` ${randFrom(tagQs, seed)}`;
  }
  return s;
}


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

// Persona shaper (adds CTA for Adam, validation for Eve)
function shapeByPersona(
  persona: Persona,
  text: string,
  userMsg: string,
  qMode: "open" | "closed" | "none" = "open"
) {
  let s = text.trim().replace(/\n+/g, " ");
  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  const joinFirst = (n: number) => sentences.slice(0, n).join(" ");

  const ensureClosedQ = (t: string) => t.replace(/[.!?]+$/, "") + "?";
const ensureOpenQ = (t: string) =>
  /[?]$/.test(t) ? t : t.replace(/[.!?]+$/, "") + " What feels like the next small step for you?";

  const removeQ = (t: string) => t.replace(/[?]+/g, ".").replace(/\s+\./g, ".");

  if (persona === "adam") {
  let out = joinFirst(3);

  // direct question or none depending on qMode
  if (qMode === "closed") out = ensureClosedQ(out);
  if (qMode === "none")   out = out.replace(/[?]+/g, ".").replace(/\s+\./g, ".");

  // remove therapy boilerplate + formalisms
  out = adamReplacements(out);

  

  // sprinkle casual Aussie vibe (light, not caricature)
  out = sprinkleAussie(out, userMsg);

  // tighten to max 3 sentences again (in case CTA added a 4th)
  out = splitSentences(out).slice(0, 3).join(" ");

  return out.trim();
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
// Retrieval + formatting with [1], [2], ...
// =======================================
type Hit = { file?: string; chunk_id?: string | number; content?: string; similarity?: number };

function formatContextWithRefs(hits: Hit[], maxChars: number) {
  const parts: string[] = [];
  let used = 0;
  const kept: Hit[] = [];

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const piece = (h.content ?? "").trim();
    if (!piece) continue;
    const block = `[${i + 1}] ${piece}\n`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    kept.push(h);
    used += block.length;
  }
  return { ctxText: parts.join("\n"), kept };
}

async function retrieveContext(userMessage: string) {
  const qEmb = await embedOne(userMessage);
  const { data, error } = await supabase.rpc(RPC_NAME, {
    query_embedding: qEmb,
    match_count: RAG_TOP_K,
    similarity_threshold: RAG_SIM_THRESHOLD,
  });
  if (error) throw new Error("RAG retrieval failed");

  const hits = (data ?? []) as Hit[];
  return hits;
}

async function rewriteQueryIfEmpty(userMessage: string): Promise<string | null> {
  // Only used when initial retrieval had zero hits
  const prompt = `Rewrite the query to better search documentation. Keep to one line, no punctuation fluff.
Original: """${userMessage}"""`;
  const r = await openai.chat.completions.create({
    model: SUM_MODEL,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });
  const rewrite = r.choices?.[0]?.message?.content?.trim() || "";
  return rewrite ? rewrite.split("\n")[0].slice(0, 300) : null;
}

async function retrieveContextWithFallback(userMessage: string) {
  // First try
  let hits = await retrieveContext(userMessage);

  // If nothing, try a single rewrite (bounded extra cost)
  if (!hits?.length) {
    const rewritten = await rewriteQueryIfEmpty(userMessage);
    if (rewritten && rewritten !== userMessage) {
      const qEmb = await embedOne(rewritten);
      const { data } = await supabase.rpc(RPC_NAME, {
        query_embedding: qEmb,
        match_count: RAG_TOP_K,
        similarity_threshold: Math.max(RAG_SIM_THRESHOLD * 0.9, 0.18), // tiny relax on fallback
      });
      hits = (data ?? []) as Hit[];
    }
  }
  const { ctxText, kept } = formatContextWithRefs(hits ?? [], MAX_CONTEXT_CHARS);
  return { context: ctxText || "", hits: kept };
}

// =======================================
// Off-track / insistent (batched embeddings; no duplicates)
// =======================================
async function computeOffTrackBatched(
  userMessage: string,
  summary: string,
  prevUserMsg: string | null
) {
  if (!summary?.trim()) {
    return {
      offCurr: false, simCurr: 1,
      offPrev: false, simPrev: 1,
      sameTopic: false
    };
  }
  const texts = [userMessage, summary.slice(0, 1000), prevUserMsg || ""];
  const [msgEmb, sumEmb, prevEmb] = await embedMany(texts);

  const simCurr = cosineSim(msgEmb, sumEmb);
  const offCurr = simCurr < DEFLECT_SIM_THRESHOLD;

  let simPrev = 1, offPrev = false, sameTopic = false;
  if (prevUserMsg) {
    simPrev = cosineSim(prevEmb, sumEmb);
    offPrev = simPrev < DEFLECT_SIM_THRESHOLD;
    sameTopic = cosineSim(msgEmb, prevEmb) >= SAME_TOPIC_SIM;
  }
  return { offCurr, simCurr: +simCurr.toFixed(3), offPrev, simPrev: +simPrev.toFixed(3), sameTopic };
}

// =======================================
// Summary / titles / db helpers (unchanged, minor hardening)
// =======================================
function sanitizeTitle(raw: string): string {
  let t = (raw || "").trim();
  t = t.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}]/gu, "");
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


const ANON_TTL_HOURS = Number(process.env.ANON_TTL_HOURS || 24);

async function ensureConversationForMode({
  conversationId,
  isAnonymous,
  clientId,
  saveLongTerm = false,
}: {
  conversationId: string;
  isAnonymous: boolean;
  clientId?: string | null;
  saveLongTerm?: boolean;
}) {
  const nowISO = new Date().toISOString();

  if (isAnonymous) {
    if (saveLongTerm) {
      // user explicitly chose to keep anon chat
      await supabase
        .from("conversations")
        .upsert(
          {
            id: conversationId,
            anon_consent: true,
            is_ephemeral: false,
            expires_at: null,
            client_id: clientId ?? null,
            updated_at: nowISO,
          },
          { onConflict: "id" }
        );
      return;
    }

    // default: ephemeral with TTL
    const expiresAt = new Date(Date.now() + ANON_TTL_HOURS * 3600 * 1000).toISOString();
    // If row exists but not ephemeral/consented, make it ephemeral
    const { data: row } = await supabase
      .from("conversations")
      .select("id, is_ephemeral, anon_consent, expires_at")
      .eq("id", conversationId)
      .maybeSingle();

    if (!row) {
      await supabase.from("conversations").insert({
        id: conversationId,
        is_ephemeral: true,
        anon_consent: false,
        expires_at: expiresAt,
        client_id: clientId ?? null,
        updated_at: nowISO,
      });
    } else if (!row.anon_consent && !row.is_ephemeral) {
      await supabase
        .from("conversations")
        .update({ is_ephemeral: true, expires_at: expiresAt, updated_at: nowISO, client_id: clientId ?? null })
        .eq("id", conversationId);
    }
    return;
  }

  // logged-in path: always long-term
  await supabase
    .from("conversations")
    .upsert(
      {
        id: conversationId,
        is_ephemeral: false,
        anon_consent: true,
        expires_at: null,
        updated_at: nowISO,
      },
      { onConflict: "id" }
    );
}

// saveTurnToDB: add clientId so anon user rows carry client_id (assistant rows do NOT)
async function saveTurnToDB({
  conversationId, userId, botUserId, userMessage, botAnswer, clientId
}: {
  conversationId: string; userId?: string; botUserId?: string;
  userMessage: string; botAnswer: string; clientId?: string | null;
}) {
  const now = new Date();
  const later = new Date(now.getTime() + 1);

  const rows: any[] = [
    {
      conversation_id: conversationId,
      sender_id: userId ?? null,              // null for anon
      role: "user",
      content: userMessage,
      client_id: userId ? null : (clientId ?? null), // ONLY set client_id for anon user messages
      created_at: now.toISOString(),
    },
    {
      conversation_id: conversationId,
      sender_id: botUserId ?? null,           // keep BOT_USER_ID if you have it
      role: "assistant",
      content: botAnswer,
      // DO NOT set client_id here to avoid unique index collisions (sender_id, client_id)
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
  conversationId, currentSummary, recentTurns, wordsTarget = 160,
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
  await supabase.from("conversations").update({ summary: updated.slice(0, 1500) }).eq("id", conversationId);
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
    `You are a safety triage classifier. Read the user's message and return a JSON object
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
      clientId,          // NEW: from frontend (persisted per browser)
      saveLongTerm = false, // NEW: when user clicks “Save this chat”
    } = body;

    if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    if (!userMessage)     return NextResponse.json({ error: "userMessage is required" }, { status: 400 });

    const userId = req.headers.get("x-user-id") || undefined;
    const isAnonymous = !userId;

    // 🔐 Enforce storage policy before we save anything
    await ensureConversationForMode({ conversationId, isAnonymous, clientId, saveLongTerm });

    

  // Lightweight fast-path for pure acknowledgements (no LLM round-trip)
      // Lightweight fast-path for pure acknowledgements (no LLM round-trip)
    const ua = userAct(userMessage);
    if (ua.isAck && !ua.isQuestion && ua.isShort) {
      let quick: string;
      if (personaRaw === "adam")      quick = "Sweet. Crack on: 1) pick one tiny step 2) 5-min timer.";
      else if (personaRaw === "eve")  quick = "Thanks for letting me know. Would you like one tiny next step?";
      else if (personaRaw === "neutral") quick = "Thanks for letting me know.";
      else quick = "All good! Would you like any other support?";

      const inserted = await saveTurnToDB({
        conversationId, userId, botUserId: BOT_USER_ID,
        userMessage, botAnswer: quick, clientId
      });

      const userRow = inserted.find((r) => r.role === "user");
      const assistantRow = inserted.find((r) => r.role === "assistant");
      return NextResponse.json({
        conversationId,
        answer: quick,
        emotion: "Neutral",
        tier: "None",
        resolvedPersona: personaRaw || "neutral",
        citations: [],
        rows: { user: userRow, assistant: assistantRow },
      });
    }


    // Load stored meta
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

    // Persist persona & tone
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

    // ensure row exists
    await supabase
      .from("conversations")
      .upsert({ id: conversationId, updated_at: new Date().toISOString() })
      .select("id").maybeSingle();

    const toneText: string = (customStyleText?.trim()
      || (meta?.style_json as any)?.text
      || "");

    // Crisis regex hard stop
    const forced = checkFilters(userMessage);
    if (forced) {
      const card = buildCareCard("Imminent");
      const answer = careText(card);
          const inserted = await saveTurnToDB({
      conversationId, userId, botUserId: BOT_USER_ID,
      userMessage, botAnswer: answer, clientId
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

    // Kick off parallel work
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
    const retrievalP = retrieveContextWithFallback(userMessage);

    const [risk, profile, summary, historyMsgs, { context, hits }] = await Promise.all([
      riskP, profileP, summaryP, historyP, retrievalP,
    ]);

    const riskTier = (risk?.tier as string) || "None";
    if (riskTier === "Imminent" || riskTier === "Acute") {
      const card = buildCareCard(riskTier as CareTier);
      const answer = careText(card);
      const inserted = await saveTurnToDB({
        conversationId, userId, botUserId: BOT_USER_ID,
        userMessage, botAnswer: answer,
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

    if (summary?.trim()) {
      await maybeUpdateTitleFromSummary(conversationId, summary);
    }

    // Big-picture anchors: prefer risk.user_goals if present (no extra LLM here)
    const seedGoals = (risk?.user_goals ?? []).filter(Boolean).slice(0, 3);
    const anchors = seedGoals.length
      ? { primary: String(seedGoals[0]).slice(0,160), subgoals: seedGoals.slice(1).map(String), nonnegotiables: [] as string[] }
      : { primary: (summary || "").match(/[^.!?]+[.!?]?/)?.[0]?.slice(0,160) || "", subgoals: [] as string[], nonnegotiables: [] as string[] };

    // Off-track / insistent (batched, no duplicate calls)
    const prevUserMsg = [...historyMsgs].reverse().find((m) => m.role === "user")?.content || null;
    const { offCurr, simCurr, offPrev, simPrev, sameTopic } = await computeOffTrackBatched(
      userMessage, summary || "", prevUserMsg
    );
    const insistent = offCurr && (offPrev || sameTopic);

    // System prompt with **strict RAG grounding**
    const voiceSheet = voiceSheetV2(effectivePersona as Persona, toneText || undefined);
    const groundingRules = [
      "RAG Grounding Rules:",
      "- If CONTEXT is present, prefer it over memory. Do NOT fabricate details not supported by CONTEXT.",
      "- When using a fact from CONTEXT, include a bracketed reference like [1] or [2] referring to that block.",
      "- If CONTEXT is empty or irrelevant, answer normally but avoid specific unverifiable facts.",
    ].join("\n");
    const contextHeader = context
      ? `--- CONTEXT (RAG) — cite with [n] ---\n${context}\n--- END CONTEXT ---`
      : "--- CONTEXT (RAG) ---\n(none)\n--- END CONTEXT ---";

    const system = [
      "You are a concise, youth-support assistant for Australia.",
      "Follow the VOICE SHEET and never break its hard constraints.",
      "Priorities: (1) Safety (2) Personalisation (3) Helpfulness (4) RAG accuracy (5) Coherence with BIG_PICTURE.",
      groundingRules,
      "\n--- VOICE SHEET ---\n" + voiceSheet,
      "\n--- PROFILE ---\n" + JSON.stringify(profile || {}),
      "\n--- SUMMARY ---\n" + (summary || "(none)"),
      "\n--- BIG_PICTURE ---\n" + JSON.stringify(anchors || {}),
      "\n--- HINTS ---\n" + JSON.stringify({
        off_track: offCurr, insistent, sim_to_summary: simCurr,
        prev_sim_to_summary: simPrev, deflect_threshold: DEFLECT_SIM_THRESHOLD
      }),
      "\n--- RISK ---\n" + JSON.stringify(risk || {}),
      "\n" + contextHeader,
      "\nSafety:",
      '- If RISK.tier is "Imminent" or "Acute", urge immediate in-person help (Lifeline 13 11 14, emergency 000).',
      '- If "Elevated", validate feelings and encourage reaching out to trusted people/professionals.',
      "- Never claim to be a crisis service or provide emergency help.",
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

    // Decide Q mode
    const qMode = decideQuestionMode(
      effectivePersona as Persona,
      userMessage,
      historyMsgs as unknown as Turn[],
      toneText || undefined
    );

    // Persona shaping + tone overlay
    answer = shapeByPersona(effectivePersona as Persona, answer, userMessage, qMode);
    answer = applyToneOverlay(answer, toneText || undefined);

    if (riskTier === "Elevated") {
      answer += "\n\nIf it gets heavier, you can call Lifeline (13 11 14, 24/7). If you’re in danger, call 000.";
    }

    // Persist turn
    const inserted = await saveTurnToDB({
      conversationId, userId, botUserId: BOT_USER_ID,
      userMessage, botAnswer: answer
    });

    // Background summary refresh
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

    // Build citations (ordered)
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
};
