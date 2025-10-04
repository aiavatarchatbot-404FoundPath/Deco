// lib/personas.ts

// lib/personas.ts
export type Persona = 'neutral' | 'adam' | 'eve' | 'custom';
export type StylePreset = 'direct' | 'friendly' | 'coach' | 'explainer' | 'neutral';

export type StyleTokens = {
  // Core tone dimensions
  directness: number;        // 0..1 (higher = blunt/straight)
  warmth: number;            // 0..1 (higher = compassionate/encouraging)
  formality: number;         // 0..1 (higher = professional/academic)
  question_ratio: number;    // 0..1 (how often you ask questions)
  action_bias: number;       // 0..1 (how strongly you push an action/next step)
  jargon_tolerance: number;  // 0..1 (higher = ok with jargon)
  length: 'short' | 'medium' | 'long';
  emoji: boolean;

  // Tone-hardening controls (NOT about bullets/paragraphs)
  tone_strict?: boolean;           // when true, tone overrides other habits
  hard_max_words?: number | null;  // cap total words (for “super concise”)
  hard_max_sentences?: number | null; // cap sentences
  max_questions?: number | null;   // explicit question cap (overrides ratio)
  encouragement?: number;          // 0..1 (strength of motivational/validating language)
  no_greeting?: boolean;           // avoid “Hi…/Hey…”, keep tone tight
};

export const ADAM_DEFAULT: StyleTokens = {
  directness: 0.9,  warmth: 0.35, formality: 0.55,
  question_ratio: 0.03, action_bias: 0.9, jargon_tolerance: 0.45,
  length: 'short', emoji: false,
  tone_strict: false, hard_max_words: null, hard_max_sentences: null,
  max_questions: null, encouragement: 0.45, no_greeting: true,
};

export const EVE_DEFAULT: StyleTokens = {
  directness: 0.5, warmth: 0.92, formality: 0.4,
  question_ratio: 0.22, action_bias: 0.6, jargon_tolerance: 0.3,
  length: 'medium', emoji: false,
  tone_strict: false, hard_max_words: null, hard_max_sentences: null,
  max_questions: null, encouragement: 0.8, no_greeting: false,
};

export const NEUTRAL_DEFAULT: StyleTokens = {
  directness: 0.55, warmth: 0.55, formality: 0.5,
  question_ratio: 0.15, action_bias: 0.55, jargon_tolerance: 0.4,
  length: 'medium', emoji: false,
  tone_strict: false, hard_max_words: null, hard_max_sentences: null,
  max_questions: null, encouragement: 0.55, no_greeting: false,
};

const BASE: StyleTokens = {
  directness: 0.5, warmth: 0.5, formality: 0.5,
  question_ratio: 0.15, action_bias: 0.5, jargon_tolerance: 0.5,
  length: 'medium', emoji: false,

  tone_strict: false,
  hard_max_words: null,
  hard_max_sentences: null,
  max_questions: null,
  encouragement: 0.5,
  no_greeting: false,
};

// Keyword → tone deltas (tone-first, not layout)
const LEXICON: Record<string, Partial<StyleTokens> | ((t: StyleTokens)=>Partial<StyleTokens>)> = {
  // directness / firmness
  direct:        { directness: +0.3, question_ratio: -0.06 },
  blunt:         { directness: +0.35, warmth: -0.15, no_greeting: true },
  firm:          { directness: +0.25, warmth: -0.1, no_greeting: true },
  "no-nonsense": { directness: +0.35, warmth: -0.1, no_greeting: true },

  // warmth / encouragement
  warm:          { warmth: +0.35, encouragement: +0.3 },
  friendly:      { warmth: +0.3,  encouragement: +0.2 },
  supportive:    { warmth: +0.3,  encouragement: +0.3 },
  encouraging:   { warmth: +0.25, encouragement: +0.35 },

  // formality / casual
  professional:  { formality: +0.4, emoji: false },
  formal:        { formality: +0.4, emoji: false },
  academic:      { formality: +0.45, emoji: false, jargon_tolerance: +0.2 },
  casual:        { formality: -0.35 },
  conversational:{ formality: -0.25 },

  // brevity / verbosity
  concise:       { length: 'short', question_ratio: -0.05 },
  brief:         { length: 'short', question_ratio: -0.05 },
  "to the point":{ length: 'short', question_ratio: -0.05 },

  // questions
  curious:       { question_ratio: +0.1 },
  reflective:    { warmth: +0.2, question_ratio: +0.08 },

  // action bias
  coach:         { directness: +0.2, action_bias: +0.3 },
  motivational:  { action_bias: +0.25, encouragement: +0.25 },

  // language simplicity
  simple:        { jargon_tolerance: -0.3 },
  "simple words":{ jargon_tolerance: -0.35 },
};

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

function sanitizeFreeText(s: string) {
  return s.replace(
    /(ignore|bypass|override).{0,40}(rules|safety|system|guardrails)|reveal.{0,20}(prompt|system)/gi,
    ''
  );
}

export function compileStyleFromText(input: string, base: Partial<StyleTokens> = {}): StyleTokens {
  const clean = sanitizeFreeText(input || '').toLowerCase();
  const tokens: StyleTokens = { ...BASE, ...base };

  // 1) keyword lexicon (tone-only)
  for (const [key, mod] of Object.entries(LEXICON)) {
    if (clean.includes(key)) {
      const delta = typeof mod === 'function' ? mod(tokens) : mod;
      for (const [k, v] of Object.entries(delta)) {
        if (typeof (tokens as any)[k] === 'number' && typeof v === 'number') {
          (tokens as any)[k] = clamp01(((tokens as any)[k] as number) + v);
        } else {
          (tokens as any)[k] = v as any;
        }
      }
    }
  }

  // 2) strong “concise/one-liner” patterns → hard caps (tone, not layout)
  if (/(super|ultra)?\s*short|very short|ultra concise|one-?liner|one line only/.test(clean)) {
    tokens.length = 'short';
    tokens.hard_max_sentences = 1;
    tokens.tone_strict = true;
    tokens.no_greeting = true;
    tokens.question_ratio = clamp01(tokens.question_ratio - 0.08);
  }
  const mWords = clean.match(/(?:≤|<=|at most|no more than)\s*(\d{1,3})\s*words?/);
  if (mWords) {
    tokens.hard_max_words = parseInt(mWords[1], 10);
    tokens.tone_strict = true;
  }
  const mSents = clean.match(/(?:≤|<=|at most|no more than|max)\s*(\d{1,2})\s*sentences?/);
  if (mSents) {
    tokens.hard_max_sentences = parseInt(mSents[1], 10);
    tokens.tone_strict = true;
  }

  // 3) questions control (explicit)
  const q0 = /(no questions|don't ask questions)/.test(clean);
  const qN = clean.match(/(exactly|at most|no more than)\s*(\d{1,2})\s*question/);
  if (q0) {
    tokens.max_questions = 0;
    tokens.question_ratio = 0;
    tokens.tone_strict = true;
  } else if (qN) {
    tokens.max_questions = Math.max(0, parseInt(qN[2], 10));
    tokens.tone_strict = true;
  }

  // 4) emojis
  if (/use emoji|use emojis|emoji ok|include emojis/.test(clean)) tokens.emoji = true;
  if (/no emoji|without emojis|no emojis/.test(clean)) tokens.emoji = false;

  // 5) “strictly/ exactly/ must follow” → make tone dominant
  if (/strict(ly)?|exactly|must follow|follow this tone/.test(clean)) {
    tokens.tone_strict = true;
  }

  // 6) clamps
  tokens.question_ratio = clamp01(Math.min(tokens.question_ratio, 0.3));
  tokens.directness = clamp01(tokens.directness);
  tokens.warmth = clamp01(tokens.warmth);
  tokens.formality = clamp01(tokens.formality);
  tokens.action_bias = clamp01(tokens.action_bias);
  tokens.jargon_tolerance = clamp01(tokens.jargon_tolerance);
  tokens.encouragement = clamp01(tokens.encouragement ?? 0.5);

  return tokens;
}

export function styleGuideFromTokens(t: StyleTokens): string {
  const questionsLine = (t.max_questions ?? null) !== null
    ? `Questions: ask at most ${t.max_questions} clarifying question(s).`
    : `Questions: ${t.question_ratio <= 0.05 ? 'rarely (≤1)' : t.question_ratio <= 0.15 ? 'sometimes (≤2)' : 'more freely (≤3)'} per reply.`;

  const lines: string[] = [
    `Tone targets — direct=${t.directness.toFixed(2)}, warm=${t.warmth.toFixed(2)}, formal=${t.formality.toFixed(2)}.`,
    `Language: ${t.jargon_tolerance < 0.5 ? 'use simple words; define jargon' : 'technical terms allowed when relevant'}.`,
    `Length preference: ${t.length}.`,
    questionsLine,
    `Action bias: ${t.action_bias >= 0.75 ? 'include exactly one concrete next step' : 'suggest actions only if helpful'}.`,
    `Emojis: ${t.emoji ? 'allowed sparingly if tone matches' : 'do not use emojis'}.`,
    `Encouragement: ${t.encouragement! >= 0.75 ? 'high — be clearly supportive' : t.encouragement! >= 0.55 ? 'medium — be gently supportive' : 'neutral — avoid motivational language'}.`,
    `No changing facts/citations; if unsure, say so briefly.`,
  ];

  // HARD tone rules (make tone decisive)
  if (t.tone_strict) lines.push(`HARD: Tone instructions override other defaults.`);
  if (t.hard_max_words)     lines.push(`HARD: Total response ≤ ${t.hard_max_words} words.`);
  if (t.hard_max_sentences) lines.push(`HARD: Total response ≤ ${t.hard_max_sentences} sentence(s).`);
  if (t.no_greeting)        lines.push(`HARD: No greeting or sign-off.`);
  if ((t.max_questions ?? null) !== null) lines.push(`HARD: Do not exceed the question cap.`);

  // Tone polarity HARDeners
  if (t.directness >= 0.8)  lines.push(`HARD: Be straight and unhedged; avoid "maybe/might/could".`);
  if (t.warmth >= 0.8)      lines.push(`HARD: Validate feelings; include one brief encouraging line.`);
  if (t.formality >= 0.8)   lines.push(`HARD: Professional register; avoid slang/emojis.`);
  if (t.formality <= 0.2)   lines.push(`HARD: Casual register; contractions fine.`);

  return lines.join('\n- ');
}

 
