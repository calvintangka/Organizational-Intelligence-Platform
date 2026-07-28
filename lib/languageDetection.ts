/**
 * TODO-058 Phase B — provider-independent language detection.
 *
 * Deterministic, offline, and dependency-free by design: language detection is a
 * PLATFORM capability, so it must not vary with which AI provider happens to be
 * reachable (Phase J). An AI provider may later refine a low-confidence result,
 * but the deterministic answer is always available first.
 *
 * Two-stage detection:
 *   1. Script stage — Han / Hiragana / Katakana / Hangul are decisive for
 *      Japanese, Korean, and Chinese and need no word list.
 *   2. Lexical stage — for Latin-script languages, score weighted function words
 *      (which are the most language-diagnostic tokens in short support tickets)
 *      plus diacritic and orthography markers.
 *
 * Nothing here mutates or inspects organizational memory; the result is metadata
 * about the INPUT only, so it can never fork Organizational Memory by language.
 */

/** Languages TODO-058 supports as a platform capability. */
export const SUPPORTED_LANGUAGES = ["en", "id", "es", "fr", "de", "pt", "it", "ja", "ko", "zh"] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguageCode = "en";

export const LANGUAGE_LABELS: Record<SupportedLanguageCode, string> = {
  en: "English",
  id: "Indonesian",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese"
};

export type LanguageDetectionMethod = "script" | "lexical" | "fallback";

export interface LanguageScore {
  language: SupportedLanguageCode;
  score: number;
}

export interface LanguageDetection {
  /** Detected language, or the fallback when the text carries no usable signal. */
  language: SupportedLanguageCode;
  /** 0..1. Below CONFIDENT_DETECTION the caller should treat this as a hint. */
  confidence: number;
  method: LanguageDetectionMethod;
  /** True when nothing could be detected and the default was applied. */
  fallbackApplied: boolean;
  /** Ranked candidates, for UI explainability and reviewer override. */
  candidates: LanguageScore[];
}

/** At or above this, the detection is strong enough to drive response language. */
export const CONFIDENT_DETECTION = 0.6;

export function isSupportedLanguage(value: unknown): value is SupportedLanguageCode {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function languageLabel(code: SupportedLanguageCode): string {
  return LANGUAGE_LABELS[code];
}

/* ---------- Stage 1: script detection ---------- */

const HIRAGANA_KATAKANA = /[぀-ゟ゠-ヿ]/u;
const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/u;
const HAN = /[一-鿿㐀-䶿]/u;

function countMatches(text: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
  return (text.match(global) ?? []).length;
}

/**
 * Script detection for CJK. Japanese is identified by kana even when Han
 * characters dominate, because kana never appear in Chinese or Korean.
 */
function detectByScript(text: string): LanguageDetection | null {
  const kana = countMatches(text, HIRAGANA_KATAKANA);
  const hangul = countMatches(text, HANGUL);
  const han = countMatches(text, HAN);
  const total = kana + hangul + han;
  if (total === 0) return null;

  // Proportion of the non-space text that is CJK, so a stray CJK glyph inside an
  // otherwise English ticket does not flip the whole detection.
  const dense = text.replace(/\s+/gu, "").length;
  const share = dense > 0 ? total / dense : 0;

  let language: SupportedLanguageCode;
  if (kana > 0) language = "ja";
  else if (hangul > 0) language = "ko";
  else language = "zh";

  const candidates: LanguageScore[] = ([
    { language: "ja", score: kana },
    { language: "ko", score: hangul },
    { language: "zh", score: language === "ja" || language === "ko" ? 0 : han }
  ] as LanguageScore[])
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    language,
    // Script evidence is strong; scale by how much of the text is actually CJK.
    confidence: Math.min(1, 0.6 + share * 0.4),
    method: "script",
    fallbackApplied: false,
    candidates
  };
}

/* ---------- Stage 2: lexical detection for Latin-script languages ---------- */

/**
 * Weighted function words. Weight 2 marks a token that is strongly diagnostic of
 * exactly one of the supported languages; weight 1 marks a common token that is
 * shared with at least one sibling language and therefore only nudges the score.
 */
const LEXICAL_MARKERS: Record<Exclude<SupportedLanguageCode, "ja" | "ko" | "zh">, Record<string, number>> = {
  en: {
    the: 2, and: 1, "i": 1, my: 2, cannot: 2, "can't": 2, cant: 1, not: 1, with: 1, this: 1,
    is: 1, are: 1, was: 1, when: 1, every: 1, time: 1, please: 2, unable: 2, to: 1, "in": 1,
    for: 1, that: 1, have: 2, been: 2, it: 1, but: 1, you: 2, we: 1, our: 2, they: 1, log: 1
  },
  id: {
    saya: 2, tidak: 2, bisa: 2, "dan": 1, yang: 2, "ke": 1, dari: 2, untuk: 2, dengan: 2,
    ini: 2, itu: 1, sudah: 2, belum: 2, akan: 1, adalah: 2, kami: 2, kamu: 1, mereka: 1,
    setiap: 2, kali: 1, masuk: 1, kata: 1, sandi: 2, mohon: 2, bantuan: 2, terima: 1, kasih: 2
  },
  es: {
    "no": 1, puedo: 2, "el": 1, la: 1, los: 1, las: 1, "y": 1, "de": 1, "en": 1, que: 1,
    mi: 1, "es": 1, por: 1, para: 1, con: 1, una: 1, "un": 1, cuando: 2, cada: 1, vez: 2,
    intento: 2, pero: 2, esta: 1, muy: 1, gracias: 2, ayuda: 2, cuenta: 1, "está": 2, "sesión": 2,
    "contraseña": 2, "más": 2, "así": 2, siempre: 2, hola: 2
  },
  fr: {
    je: 2, ne: 1, pas: 2, "le": 1, la: 1, les: 1, "et": 1, "de": 1, "des": 1, du: 1,
    une: 1, "un": 1, que: 1, qui: 1, pour: 1, avec: 1, mon: 2, ma: 1, mes: 1, est: 1,
    "être": 2, chaque: 2, fois: 2, mais: 2, tr: 0, "très": 2, merci: 2, bonjour: 2,
    connecter: 2, "problème": 2, "réessayer": 2, nous: 1, vous: 1
  },
  de: {
    ich: 2, nicht: 2, kann: 2, der: 1, die: 1, das: 1, und: 1, ist: 1, mit: 1, mein: 2,
    meine: 2, meinem: 2, sich: 2, bei: 1, jedes: 2, mal: 1, aber: 2, auch: 2, wird: 2,
    werden: 2, wenn: 2, danke: 2, hallo: 1, anmelden: 2, passwort: 2, "für": 2, "über": 2
  },
  pt: {
    "não": 2, consigo: 2, "o": 1, "a": 1, os: 1, as: 1, "e": 1, "de": 1, "em": 1, que: 1,
    meu: 2, minha: 2, uma: 1, "um": 1, para: 1, com: 1, sempre: 1, cada: 1, vez: 1,
    quando: 1, mas: 2, muito: 1, obrigado: 2, ajuda: 1, conta: 1, senha: 2, "está": 1,
    fazer: 2, tento: 2, "são": 2, "também": 2
  },
  it: {
    non: 2, riesco: 2, il: 2, lo: 1, la: 1, "i": 1, gli: 2, le: 1, "e": 1, "di": 1,
    che: 1, mio: 2, mia: 2, una: 1, "un": 1, per: 1, con: 1, ogni: 2, volta: 2, ma: 1,
    molto: 1, grazie: 2, aiuto: 1, accedere: 2, viene: 2, sono: 2, questo: 2, della: 2, nel: 2
  }
};

const LATIN_LANGUAGES = Object.keys(LEXICAL_MARKERS) as Array<Exclude<SupportedLanguageCode, "ja" | "ko" | "zh">>;

/** Orthography markers: characters or sequences that only some languages use. */
const ORTHOGRAPHY_MARKERS: Array<{ language: Exclude<SupportedLanguageCode, "ja" | "ko" | "zh">; pattern: RegExp; weight: number }> = [
  { language: "es", pattern: /[ñ¿¡]/u, weight: 3 },
  { language: "de", pattern: /[äöüß]/u, weight: 3 },
  { language: "pt", pattern: /[ãõ]/u, weight: 3 },
  { language: "fr", pattern: /[œùûêç]/u, weight: 2 },
  { language: "it", pattern: /\b\w+(?:zione|zioni)\b/u, weight: 3 },
  { language: "pt", pattern: /\b\w+(?:ção|ções)\b/u, weight: 3 },
  { language: "es", pattern: /\b\w+(?:ción|ciones)\b/u, weight: 3 },
  { language: "fr", pattern: /\b\w+(?:tion|tions)\b/u, weight: 1 }
];

/** Lowercase and split on non-letters, preserving letters from every script. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

function detectByLexicon(text: string): LanguageDetection | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  const scores = new Map<SupportedLanguageCode, number>();
  for (const language of LATIN_LANGUAGES) scores.set(language, 0);

  for (const token of tokens) {
    for (const language of LATIN_LANGUAGES) {
      const weight = LEXICAL_MARKERS[language][token];
      if (weight) scores.set(language, (scores.get(language) ?? 0) + weight);
    }
  }
  for (const marker of ORTHOGRAPHY_MARKERS) {
    if (marker.pattern.test(text.toLowerCase())) {
      scores.set(marker.language, (scores.get(marker.language) ?? 0) + marker.weight);
    }
  }

  const candidates = [...scores.entries()]
    .map(([language, score]) => ({ language, score }))
    .filter((candidate) => candidate.score > 0)
    // Ties resolve by the canonical language order so detection is deterministic.
    .sort((a, b) => b.score - a.score || SUPPORTED_LANGUAGES.indexOf(a.language) - SUPPORTED_LANGUAGES.indexOf(b.language));

  if (candidates.length === 0) return null;

  const top = candidates[0];
  const runnerUp = candidates[1]?.score ?? 0;
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  // Confidence blends dominance over the runner-up with the share of all
  // evidence, so "one weak hit" never reads as certain.
  const dominance = top.score > 0 ? (top.score - runnerUp) / top.score : 0;
  const share = total > 0 ? top.score / total : 0;
  const evidence = Math.min(1, top.score / 6);
  const confidence = Math.min(1, Math.max(0.15, (dominance * 0.5 + share * 0.3 + evidence * 0.2)));

  return {
    language: top.language,
    confidence: Number(confidence.toFixed(3)),
    method: "lexical",
    fallbackApplied: false,
    candidates: candidates.slice(0, 4)
  };
}

export interface DetectLanguageOptions {
  /** Organization default, applied when the text carries no usable signal. */
  defaultLanguage?: SupportedLanguageCode;
}

/**
 * Detect the language of ticket text.
 *
 * Always returns a usable language: when no signal is found it falls back to the
 * organization default (or English) with `fallbackApplied` set and a confidence
 * of 0, so callers can distinguish "detected English" from "assumed English".
 */
export function detectLanguage(text: string, options: DetectLanguageOptions = {}): LanguageDetection {
  const fallbackLanguage = isSupportedLanguage(options.defaultLanguage) ? options.defaultLanguage : DEFAULT_LANGUAGE;
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length === 0) {
    return { language: fallbackLanguage, confidence: 0, method: "fallback", fallbackApplied: true, candidates: [] };
  }

  const script = detectByScript(value);
  if (script) return script;

  const lexical = detectByLexicon(value);
  if (lexical) return lexical;

  return { language: fallbackLanguage, confidence: 0, method: "fallback", fallbackApplied: true, candidates: [] };
}
