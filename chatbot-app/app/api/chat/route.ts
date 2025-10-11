// app/api/chat/route.ts
/**
 * CHAT ROUTE — Read Me
 * --------------------
 * Flow (POST):
 *  0) Validate input + ensure ownership (works for anon + signed-in)
 *  1) Hard safety regex (instant crisis path)
 *  2) Load profile/mood/summary/history in parallel
 *  3) Risk assess (ensemble: regex + LLM JSON + heuristics) using latest msg + short history
 *  4) RAG retrieve (with hint for higher risk)
 *  5) Build system prompt + CARE card
 *  6) Call Chat model
 *  7) Save user + assistant messages
 *  8) Occasionally refresh summary
 *  9) Return envelope (answer, tier, suggestions, citations, rows)
 *
 * Key knobs:
 *  - TOP_K, SIM_THRESHOLD, MAX_CONTEXT_CHARS (RAG)
 *  - SUMMARY_REFRESH_EVERY, MAX_PAIRS (history/summary)
 *  - Safety regexes and the ensemble risk assessor
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// =======================================
// 1) Runtime & Clients
// =======================================
export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // SERVER ONLY
);

// =======================================
// 2) Config
// =======================================
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL  = process.env.CHAT_MODEL  || "gpt-4o-mini";
const SUM_MODEL   = process.env.SUM_MODEL   || CHAT_MODEL;

const TOP_K = Number(process.env.RAG_TOP_K || 6);
const SIM_THRESHOLD = Number(process.env.RAG_SIM_THRESHOLD || 0.2);
const RPC_NAME = process.env.RPC_NAME || "match_file_chunks";
const MAX_CONTEXT_CHARS = 12000;

// Rolling summary config
const MAX_PAIRS = Number(process.env.CHAT_MAX_PAIRS || 6);            // last N user/assistant pairs
const SUMMARY_MAX_CHARS = 1500;                                       // cap stored summary
const SUMMARY_REFRESH_EVERY = Number(process.env.SUMMARY_EVERY || 3); // refresh cadence

const BOT_USER_ID = process.env.BOT_USER_ID || undefined;

// =======================================
// 3) Safety (regex hard stop) — with negation & idiom guards
// =======================================
const DANGER_PATTERNS: string[] = [
  "\\bsuicid(e|al)\\b","\\bkill(ing)? myself\\b","\\bend(ing)? my life\\b",
  "\\bwant to die\\b","\\bi want to die\\b","\\bcan't go on\\b",
  "\\bno reason to live\\b","\\bi wish i was dead\\b",
  "\\boverdose(d)?\\b","\\bcut (myself|deep)\\b","\\battempt(ed)?\\b",
];
const NEGATION_RX = /\b(don't|do not|never|no longer|not)\b/i;
const IDIOMS_RX = /\b(killed it|dead tired|die of laughter|this killed me|that slayed me)\b/i;
const COMPILED_DANGER_PATTERNS = DANGER_PATTERNS.map(p => new RegExp(p, "i"));

/** Returns "Imminent" when a high-risk literal pattern is found (unless negated/idiom), else null. */
function checkFilters(userInput: string): "Imminent" | null {
  const text = userInput.toLowerCase();
  if (IDIOMS_RX.test(text)) return null;
  // If clear negation like "I don't want to die", don't trigger.
  if (NEGATION_RX.test(text) && /\b(die|kill myself|suicid(e|al))\b/i.test(text)) return null;
  for (const rx of COMPILED_DANGER_PATTERNS) if (rx.test(text)) return "Imminent";
  return null;
}

// =======================================
// 4) Types
// =======================================
type RoleTurn = { role: "user" | "assistant"; content: string };

type RiskTier = "Imminent" | "Acute" | "Elevated" | "Low" | "None";

type Evidence = { quote: string; start?: number; end?: number };

type RiskAssessment = {
  tier: RiskTier;
  signals: string[];
  protective: string[];
  user_goals: string[];
  criteria_met: {
    ideation?: boolean;
    plan?: boolean;
    means?: boolean;
    timeframe?: boolean;
    attempt?: boolean;
    hopelessness?: boolean;
    self_harm_urges?: boolean;
    negation_present?: boolean;
  };
  confidence: number;
  evidence: Evidence[];
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

// =======================================
// 5) Retrieval utilities (embeddings + RPC)
// =======================================
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

  // assemble up to MAX_CONTEXT_CHARS
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
// 6) Personalisation helpers (profile, mood, supports)
// =======================================
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

// =======================================
// 7) Conversation & summary helpers
// =======================================
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
  const turnsTxt = recentTurns.map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n");

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

// =======================================
// 8) Persistence for a single turn (user + assistant)
// =======================================
async function saveTurnToDB({
  conversationId, userId, botUserId, userMessage, botAnswer,
}: {
  conversationId: string; userId?: string; botUserId?: string;
  userMessage: string; botAnswer: string;
}) {
  const now = new Date();
  const aBitLater = new Date(now.getTime() + 1); // 1 ms later
  const rows: any[] = [
    { conversation_id: conversationId, sender_id: userId ?? null, role: "user",      content: userMessage, created_at: now.toISOString() },
    { conversation_id: conversationId, sender_id: botUserId ?? null, role: "assistant", content: botAnswer,  created_at: aBitLater.toISOString() },
  ];

  const { data, error } = await supabase
    .from("messages")
    .insert(rows)
    .select("id, conversation_id, sender_id, role, content, created_at")
    .order("created_at", { ascending: true });

  if (error) console.error("saveTurnToDB error:", error);
  return data ?? [];
}

// =======================================
// 9) Risk assessment (LLM JSON + inline validation + rules + heuristics)
// =======================================

const ALLOWED_TIERS: RiskTier[] = ["Imminent","Acute","Elevated","Low","None"];

function isString(x: any): x is string { return typeof x === "string"; }
function numberOrUndef(x: any): number | undefined {
  return typeof x === "number" && isFinite(x) ? x : undefined;
}
function arrOfStrings(x: any): string[] {
  return Array.isArray(x) ? x.filter(isString) : [];
}
function arrOfEvidence(x: any): Evidence[] {
  if (!Array.isArray(x)) return [];
  const out: Evidence[] = [];
  for (const e of x) {
    if (e && typeof e === "object" && isString(e.quote)) {
      out.push({ quote: e.quote, start: numberOrUndef(e.start), end: numberOrUndef(e.end) });
    }
  }
  return out;
}

/** Parse & coerce model JSON into a RiskAssessment with safe defaults. */
function parseRiskJSON(text: string): RiskAssessment {
  let o: any;
  try { o = JSON.parse(text); } catch { o = {}; }
  const tier = ALLOWED_TIERS.includes(o?.tier) ? o.tier as RiskTier : "None";
  const criteria_raw = (o && typeof o.criteria_met === "object" && o.criteria_met) || {};
  const criteria = {
    ideation: !!criteria_raw.ideation,
    plan: !!criteria_raw.plan,
    means: !!criteria_raw.means,
    timeframe: !!criteria_raw.timeframe,
    attempt: !!criteria_raw.attempt,
    hopelessness: !!criteria_raw.hopelessness,
    self_harm_urges: !!criteria_raw.self_harm_urges,
    negation_present: !!criteria_raw.negation_present,
  };
  const confidence = typeof o?.confidence === "number" && isFinite(o.confidence)
    ? Math.min(1, Math.max(0, o.confidence))
    : 0.5;

  return {
    tier,
    signals: arrOfStrings(o?.signals),
    protective: arrOfStrings(o?.protective),
    user_goals: arrOfStrings(o?.user_goals),
    criteria_met: criteria,
    confidence,
    evidence: arrOfEvidence(o?.evidence),
  };
}

/** Low-level LLM classifier that returns structured JSON and passes through the inline validator. */
async function classifyRisk(rawInputForModel: string): Promise<RiskAssessment> {
  const prompt = `
You are a safety triage classifier. Return ONLY JSON with keys:
tier, signals, protective, user_goals, criteria_met, confidence, evidence.

Schema:
{
  "tier": "Imminent" | "Acute" | "Elevated" | "Low" | "None",
  "signals": string[],
  "protective": string[],
  "user_goals": string[],
  "criteria_met": {
    "ideation"?: boolean,
    "plan"?: boolean,
    "means"?: boolean,
    "timeframe"?: boolean,
    "attempt"?: boolean,
    "hopelessness"?: boolean,
    "self_harm_urges"?: boolean,
    "negation_present"?: boolean
  },
  "confidence": number in [0,1],
  "evidence": [{"quote": string, "start"?: number, "end"?: number}]
}

Definitions:
- Imminent: explicit intent + (plan OR means OR timeframe) OR current attempt.
- Acute: ideation with concerning specifics (but not imminent) OR recent attempt without current means/timeframe.
- Elevated: passive ideation OR severe hopelessness/self-harm urges without plan/means/timeframe.
- Low: distress without self-harm ideation.
- None: no risk signals.

IMPORTANT:
- Extract 1–3 short "evidence" quotes DIRECTLY from the latest USER message (not assistant).
- Set "confidence" based on clarity of criteria match and presence/absence of negation.
- If negation like "I don't want to die" is present, set criteria_met.negation_present = true.

Text to classify:
"""${rawInputForModel}"""`;

  const r = await openai.chat.completions.create({
    model: SUM_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.0,
    // If supported by your SDK/runtime:
    response_format: { type: "json_object" } as any,
  });

  const text = r.choices?.[0]?.message?.content?.trim() || "{}";
  try {
    return parseRiskJSON(text);
  } catch (err) {
    console.warn("classifyRisk JSON parse failed:", err);
    return {
      tier: "None",
      signals: [],
      protective: [],
      user_goals: [],
      criteria_met: {},
      confidence: 0.3,
      evidence: [],
    };
  }
}

/** Heuristic scan of key markers for a second opinion. */
function heuristicScan(text: string) {
  const t = text.toLowerCase();
  const ideation = /\b(kill myself|suicid(e|al)|want to die|end my life)\b/.test(t);
  const plan = /\b(plan|planning|i will|i'm going to)\b/.test(t);
  const means = /\b(rope|pills|knife|razor|bridge|gun)\b/.test(t);
  const timeframe = /\b(tonight|today|now|this week|tomorrow|at \d{1,2}(:\d{2})?\s?(am|pm)?)\b/.test(t);
  const attempt = /\b(overdose|cut (myself|deep)|attempt(ed)?|tried to (kill|harm) myself)\b/.test(t);
  const hopelessness = /\b(hopeless|can't go on|no reason to live|worthless|burden)\b/.test(t);
  const self_harm_urges = /\b(self[- ]?harm|urge to cut|urge to hurt myself)\b/.test(t);
  const negation_present = NEGATION_RX.test(t) && /\b(die|kill myself|suicid(e|al))\b/.test(t);
  return { ideation, plan, means, timeframe, attempt, hopelessness, self_harm_urges, negation_present };
}

function heuristicTier(h: ReturnType<typeof heuristicScan>): RiskTier {
  if (h.attempt || (h.ideation && (h.plan || h.means || h.timeframe))) return "Imminent";
  if (h.ideation && (h.plan || h.means || h.timeframe)) return "Acute";
  if (h.ideation || h.self_harm_urges || h.hopelessness) return "Elevated";
  return "Low";
}

/** Enforce taxonomy rules regardless of model noise. */
function enforceRiskRules(ra: RiskAssessment): RiskAssessment {
  const c = ra.criteria_met || {};
  const imminentOK = c.attempt || (c.ideation && (c.plan || c.means || c.timeframe));
  if (ra.tier === "Imminent" && !imminentOK) ra.tier = "Acute";
  if (ra.tier === "Acute" && !(c.ideation || c.attempt)) ra.tier = "Elevated";
  if (c.negation_present && (ra.tier === "Imminent" || ra.tier === "Acute")) ra.tier = "Elevated";
  return ra;
}

/** Build a short recent context window for the classifier. */
function recentWindow(history: RoleTurn[], k = 6): string {
  const turns = history.slice(-k).map(t => `${t.role}: ${t.content}`).join("\n");
  return turns;
}

/** Ensemble assessor: regex gate + LLM JSON + heuristics → highest tier, rules-enforced. */
async function assessRisk(latestUserMessage: string, history: RoleTurn[]): Promise<RiskAssessment> {
  // A) Regex fast gate (only for immediate escalation)
  const gate = checkFilters(latestUserMessage); // "Imminent" | null

  // Build classification input (include short history for context)
  const inputForModel =
    latestUserMessage +
    (history.length ? `\n\nRecent context:\n${recentWindow(history, 6)}` : "");

  // B) LLM JSON
  const llm = await classifyRisk(inputForModel);

  // C) Heuristics (on latest message only)
  const h = heuristicScan(latestUserMessage);
  const hTier = heuristicTier(h);

  // Choose the highest severity among gate, llm.tier, hTier
  const order: RiskTier[] = ["None","Low","Elevated","Acute","Imminent"];
  const candidates: RiskTier[] = [gate ?? "None", llm.tier, hTier];
  let chosen: RiskTier = "None";
  for (const t of candidates) if (order.indexOf(t) > order.indexOf(chosen)) chosen = t;

  // Merge + rules
  const merged: RiskAssessment = enforceRiskRules({
    ...llm,
    tier: chosen,
    criteria_met: { ...llm.criteria_met, ...h },
  });

  return merged;
}

// =======================================
// 10) Micro-templates: style string + CARE card
// =======================================
function buildStyle(profile: UserProfile | null) {
  const tone = profile?.preferred_tone || "warm";
  const style = (tone === "professional")
    ? "professional, clear, non-judgmental"
    : tone === "casual"
    ? "casual, friendly, non-judgmental"
    : "warm, supportive, non-judgmental";
  // Align with policy: keep tone guidance, do NOT force next steps unconditionally.
  return `${style}; use plain language; 2–4 short paragraphs; mirror the user's words.`;
}

function buildCARECard({
  profile, risk, supports, recentMood
}: {
  profile: UserProfile | null; risk: RiskAssessment; supports: SupportOption[]; recentMood: any[];
}) {
  const name = profile?.display_name;
  const addressByName = name ? `Hi ${name}, ` : "";
  const safetyLine = (risk.tier === "Imminent" || risk.tier === "Acute")
    ? "If you feel unsafe, call 000 now. It’s the fastest way to get help in Australia."
    : "";

  const firstSupport = supports[0] ? `You can also talk to ${supports[0].label} at ${supports[0].phone}.` : "";
  const lastFeel = recentMood?.[0]?.feeling ? `I remember you mentioned feeling ${recentMood[0].feeling} recently.` : "";

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

// =======================================
// 11) Healthcheck
// =======================================
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/chat" });
}

// =======================================
// 12) POST handler (main flow)
// =======================================
export async function POST(req: Request) {
  try {
    // ---- STEP 0: input + ownership
    const { conversationId, userMessage } = await req.json();
    if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    if (!userMessage)     return NextResponse.json({ error: "userMessage is required" }, { status: 400 });

    // Normalize header for anon flow
    let userId = req.headers.get("x-user-id") || undefined;
    if (userId === "null" || userId === "undefined" || userId === "") userId = undefined;

    await ensureConversationOwned(conversationId, userId);

    // Exit command (no DB write)
    if (userMessage.trim().toLowerCase() === "exit") {
      return NextResponse.json({
        conversationId,
        answer: "I’ll be here if you need me again. Take care! 😊",
        emotion: "Neutral",
        tier: "None",
        suggestions: [],
        citations: [],
      });
    }

    // ---- STEP 1: Regex hard-stop (immediate escalation)
    const forcedTier = checkFilters(userMessage);
    if (forcedTier) {
      const profile = await loadUserProfile(userId);
      const supports = buildSupportOptions(profile);

      const answer = [
        "I’m really concerned about your safety.",
        "If you are in immediate danger, please call 000 now.",
        `${profile?.display_name ? profile.display_name + "," : ""}You’re not alone — I care about your safety.`,
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
      await refreshSummary({ conversationId, currentSummary, recentTurns: recentForSummary, wordsTarget: 180 });

      const userRow = inserted.find(r => r.role === "user");
      const assistantRow = inserted.find(r => r.role === "assistant");

      return NextResponse.json({
        conversationId,
        answer,
        emotion: "Negative",
        tier: forcedTier, // "Imminent"
        suggestions: supports.map(s => `${s.label} — ${s.phone}`),
        citations: [],
        rows: { user: userRow, assistant: assistantRow },
      });
    }

    // ---- STEP 2: Personalisation + history (parallel)
    const [profile, recentMood, summary, historyMsgs] = await Promise.all([
      loadUserProfile(userId),
      loadRecentMood(conversationId, 5),
      loadSummary(conversationId),
      loadLastPairs(conversationId, MAX_PAIRS),
    ]);
    const supports = buildSupportOptions(profile);

    // ---- STEP 3: Risk assess (ensemble over latest + short history)
    const risk = await assessRisk(userMessage, historyMsgs);

    // ---- STEP 4: RAG retrieve (with hint if higher risk)
    const ragHint = (risk.tier === "Elevated" || risk.tier === "Acute")
      ? "grounded coping skills; short actionable steps; safety-plan examples; youth friendly; Australian and more specifically Queensland context\n"
      : "";
    const { context, hits } = await retrieveContext(ragHint + userMessage);

    // ---- STEP 5: Build system prompt & scaffolds
    const systemPrompt =
`You are a concise, empathetic youth-support assistant for Australia.

PRIORITIES (in order):
1) Safety first:
 - Imminent → lead with 000 (Australia) and crisis lines.
 - Acute → include a safety line (“If you feel unsafe, call 000”) and build a tiny safety plan.
2) Personalisation: reflect the user's words and the profile/summary/mood provided.
3) Helpfulness: when the user asks for help, or when risk is Elevated/Acute, offer 2–3 small, doable next steps tailored to their goals and context.
4) RAG: use provided Context ONLY to add accurate ideas/resources; never hallucinate.
5) Tone: ${buildStyle(profile)}

DO:
- Use 'CARE' structure: Connect → Acknowledge → Reflect → Explore small next steps (when appropriate).
- Mirror key phrases the user used. Use their name/pronouns if provided.
- If youth ≤25, prefer youth-specific supports. If indigenous==true, include 13YARN.
- Provide suggestions in simple bullet points. Do not use Markdown formatting.

DON'T:
- Don’t minimise feelings; don’t lecture; don’t promise confidentiality or outcomes.
- Don’t give medical diagnoses or definitive clinical claims.`;

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

    // ---- STEP 6: Generate answer
    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.2,
    });

    const answer =
      resp.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I couldn't generate an answer right now.";

    // ---- STEP 7: Persist turn
    const inserted = await saveTurnToDB({
      conversationId,
      userId,
      botUserId: BOT_USER_ID,
      userMessage,
      botAnswer: answer,
    });

    // ---- STEP 8: Maybe refresh summary
    const assistantCount = await countAssistantMessages(conversationId);
    const currentSummary = await loadSummary(conversationId);
    const shouldRefresh =
      (assistantCount > 0 && assistantCount % SUMMARY_REFRESH_EVERY === 0) ||
      !currentSummary || currentSummary.trim().length === 0;

    if (shouldRefresh) {
      const recentForSummary = await loadLastPairs(conversationId, Math.max(6, MAX_PAIRS));
      await refreshSummary({ conversationId, currentSummary, recentTurns: recentForSummary, wordsTarget: 180 });
    }

    // ---- STEP 9: Build envelope (UI-friendly)
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

    return NextResponse.json({
      conversationId,
      answer,
      emotion: (risk.tier === "None" || risk.tier === "Low") ? "Neutral" : "Negative",
      tier: risk.tier,
      suggestions,
      citations,
      rows: { user: userRow, assistant: assistantRow },
    });

  } catch (e: any) {
    console.error("CHAT route error:", e);
    return NextResponse.json({ error: e.message ?? "chat error" }, { status: 400 });
  }
}
