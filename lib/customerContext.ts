/*
 * TODO-050 — Customer context extraction (sender name, company, role).
 *
 * Deterministic and safety-first. The prior extractor matched a bare
 * "This is <phrase>" self-introduction case-insensitively, so a ticket ending
 * "...This is causing duplicate records." produced sender = "causing duplicate
 * records". This module extracts identity ONLY from clear self-identification
 * patterns and validates that the captured span actually looks like a person's
 * name / an affiliation / an explicit role — arbitrary issue-description text can
 * never become a name. It prefers UNKNOWN over a wrong identity.
 */

import type { ExtractedTicketFields } from "@/types/oip";

export interface CustomerContext {
  senderName: string | null;
  companyName: string | null;
  senderRole: string | null;
  confidence: { senderName: number; companyName: number; senderRole: number };
}

// Words that must never appear IN a person's name. Verbs/gerunds and issue
// vocabulary that show up in "This is <problem>" or "I am <doing X>" phrasing,
// plus function words and clause-boundary words. Deliberately excludes common
// first names/surnames (e.g. "mark", "grace") so real names still validate.
const NON_NAME_WORDS = new Set([
  // gerunds / verbs common in issue descriptions
  "causing", "blocking", "affecting", "happening", "creating", "breaking",
  "delaying", "working", "getting", "having", "seeing", "using", "trying",
  "running", "failing", "missing", "showing", "receiving", "sending",
  "reporting", "experiencing", "noticing", "looking", "writing", "calling",
  "is", "are", "was", "were", "be", "been", "has", "have", "had", "do", "does",
  "did", "can", "cannot", "could", "will", "would", "should",
  // issue nouns / adjectives
  "duplicate", "duplicates", "records", "record", "invoices", "invoice",
  "workflow", "reports", "report", "production", "customers", "customer",
  "problem", "problems", "issue", "issues", "error", "errors", "events",
  "event", "system", "data", "account", "accounts", "login", "field",
  "incorrect", "internal", "identical", "morning", "workspace", "dashboard",
  "notification", "notifications", "integration", "subscription", "charge",
  "charges", "message", "messages", "update", "updates", "request", "requests",
  "team", "teams", "user", "users", "admin", "name", "names", "email",
  "responsible", "invalid", "unknown", "empty", "blank", "required", "valid",
  "correct", "wrong", "broken", "failed", "pending", "active", "inactive",
  "enabled", "disabled", "affected", "blocked", "delayed", "created",
  // function words / clause boundaries
  "this", "that", "these", "those", "the", "a", "an", "our", "your", "their",
  "his", "her", "its", "my", "we", "us", "you", "they", "them", "it", "he",
  "she", "and", "or", "but", "so", "then", "here", "there", "from", "with",
  "for", "of", "at", "in", "on", "to", "as", "by", "who", "which", "what",
  "when", "where", "why", "how", "every", "some", "any", "all", "more", "most",
  "same", "other", "another", "one", "two", "side", "please", "hi", "hello",
  "hey", "thanks", "regards", "team's", "not", "no", "yes", "about", "into"
]);

// Words that end a name/affiliation scan (they introduce the next clause).
const CLAUSE_BOUNDARY_WORDS = new Set([
  "from", "at", "with", "of", "and", "who", "which", "that", "here", "we",
  "i", "but", "so", "because", "since", "please", "our", "the", "however",
  "regarding", "about", "in", "on", "for", "working", "reporting", "writing",
  "dari", "di", "untuk", "dengan", "yang", "kami", "saya"
]);

function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  // Keep internal capitals for names like "McArthur"; only fix all-lower/all-upper.
  if (/^[a-z'’.-]+$/.test(word) || /^[A-Z'’.-]+$/.test(word)) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word;
}

function isNameWord(word: string): boolean {
  const lower = word.toLowerCase().replace(/[.'’-]+$/g, "");
  if (lower.length < 2) return false;
  if (!/^[a-z][a-z'’-]*$/.test(lower)) return false;
  return !NON_NAME_WORDS.has(lower);
}

/**
 * True when a candidate string plausibly is a person's name: 1–4 alphabetic
 * words, none of them issue/function words. Used to validate both deterministic
 * captures and AI-provided names before they are shown to a customer.
 */
export function isLikelyPersonName(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (/[@\d]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return words.every((word) => isNameWord(word));
}

/**
 * Take leading words from a raw captured phrase while each is name-like; stop at
 * the first clause-boundary / non-name word. This bounds a self-introduction so
 * trailing issue text cannot bleed into the name ("satya nadella and i work..."
 * -> "Satya Nadella"; "causing duplicate records" -> none).
 */
function leadingName(phrase: string): string | null {
  const words = phrase.trim().split(/\s+/);
  const kept: string[] = [];
  for (const raw of words) {
    const word = raw.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z'’.-]+$/, "");
    if (!word) break;
    if (CLAUSE_BOUNDARY_WORDS.has(word.toLowerCase()) || !isNameWord(word)) break;
    kept.push(word);
    if (kept.length === 4) break;
  }
  if (kept.length === 0) return null;
  const name = kept.map(titleCaseWord).join(" ");
  return isLikelyPersonName(name) ? name : null;
}

// Self-identification lead-ins. Each captures a generous trailing phrase that
// leadingName() then trims to the valid name span.
const NAME_INTRO_PATTERNS: RegExp[] = [
  /\bmy name'?s?\s+(?:is\s+)?([A-Za-z][^.,\n;!?]{1,80})/i,
  /\bnama saya\s+([A-Za-z][^.,\n;!?]{1,80})/i,
  /\b[Ss]aya\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})/,
  /\bthis is\s+([A-Za-z][^.,\n;!?]{1,80})/i,
  /\bi(?:\s*am|'?m)\s+([A-Za-z][^.,\n;!?]{1,80})/i
];

// "Satya Nadella here" / "Satya here" — name immediately before "here".
const NAME_BEFORE_HERE = /\b([A-Za-z][A-Za-z'’-]+(?:\s+[A-Za-z][A-Za-z'’-]+){0,3})\s+here\b/i;

// Signature block: a sign-off line followed by a name line.
const SIGNOFF_LINE = /^(best regards|kind regards|warm regards|many thanks|regards|sincerely|thanks|thank you|best|cheers)[,!.]?$/i;
const SAME_LINE_SIGNOFF = /\b(?:best regards|kind regards|warm regards|many thanks|regards|sincerely|thanks|thank you|cheers|best)[,!]?\s+([A-Za-z][^.,\n;!?]{1,80})/i;

function extractName(text: string): string | null {
  // Signature block across lines takes priority (an explicit sign-off).
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    if (SIGNOFF_LINE.test(lines[i])) {
      const next = lines[i + 1];
      if (next && !/@/.test(next)) {
        const name = leadingName(next);
        if (name) return name;
      }
    }
  }
  for (const pattern of NAME_INTRO_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = leadingName(match[1]);
      if (name) return name;
    }
  }
  const hereMatch = text.match(NAME_BEFORE_HERE);
  if (hereMatch?.[1]) {
    const name = leadingName(hereMatch[1]);
    if (name) return name;
  }
  const sameLine = text.match(SAME_LINE_SIGNOFF);
  if (sameLine?.[1]) {
    const name = leadingName(sameLine[1]);
    if (name) return name;
  }
  return null;
}

// Company / organization tokens may include ordinary words ("British
// Government"), so the company scan is bounded by punctuation and continuation
// words rather than a name denylist. It still requires an AFFILIATION context.
const COMPANY_STOP_WORDS = new Set([
  "and", "who", "which", "that", "we", "i", "but", "so", "because", "please",
  "regarding", "about", "is", "are", "was", "were", "has", "have", "will",
  "would", "our", "my", "your", "their", "the", "a", "an", "here", "now",
  "today", "yesterday", "when", "where", "while", "however", "noticed", "need",
  "want", "reported", "reporting", "experiencing"
]);

const NON_COMPANY_PHRASES = new Set(["perusahaan", "company", "organization", "organisasi", "sejak", "bulan", "lalu", "last", "month", "year", "the", "old", "former"]);

function boundCompany(phrase: string): string | null {
  const words = phrase.trim().split(/\s+/);
  const kept: string[] = [];
  for (const raw of words) {
    const word = raw.replace(/^[^A-Za-z&]+/, "").replace(/[^A-Za-z0-9&'’.\-]+$/, "");
    if (!word) break;
    if (COMPANY_STOP_WORDS.has(word.toLowerCase())) break;
    if (!/^[A-Za-z&][A-Za-z0-9&'’.\-]*$/.test(word)) break;
    kept.push(word);
    if (kept.length === 5) break;
  }
  if (kept.length === 0) return null;
  const company = kept.map((w) => (/^[a-z'’&.\-]+$/.test(w) ? titleCaseWord(w) : w)).join(" ").trim().replace(/[.,!?]+$/g, "");
  // Reject a company that is only a single common function word.
  if (company.length < 2) return null;
  const companyWords = company.toLowerCase().split(/\s+/);
  if (companyWords.some((word) => NON_COMPANY_PHRASES.has(word))) return null;
  return company;
}

// Affiliation lead-ins: the customer states they belong to the organization.
const COMPANY_PATTERNS: RegExp[] = [
  /\bi work(?:ing)?\s+(?:at|for|in)\s+([A-Za-z][^.,\n;!?]{1,60})/i,
  /\bi am working\s+(?:at|for|in)\s+([A-Za-z][^.,\n;!?]{1,60})/i,
  /\bi(?:\s*am|'?m)\s+(?:from|with)\s+([A-Za-z][^.,\n;!?]{1,60})/i,
  /\b(?:dari|di)\s+([A-Za-z][^.,\n;!?]{1,60})/i,
  /\bat\s+([A-Z][A-Za-z0-9&.'’-]*(?:\s+[A-Z][A-Za-z0-9&.'’-]*){0,4})(?=[.,\n;!?]|$)/,
  /\bour (?:company|organi[sz]ation|org|firm|team|employer) is\s+([A-Za-z][^.,\n;!?]{1,60})/i
];
// "<name> from/at/with <Company>" following a self-introduction.
const NAME_THEN_COMPANY = /\b(?:my name'?s?\s+(?:is\s+)?|this is\s+|i(?:\s*am|'?m)\s+)[A-Za-z][A-Za-z'’ .-]{1,60}?\s+(?:from|at|with)\s+([A-Za-z][^.,\n;!?]{1,60})/i;

function extractCompany(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.slice(-4).reverse()) {
    const signature = line.match(/^((?:PT|CV|LLC|Ltd\.?|Inc\.?|Corp\.?|Company)\s+[A-Za-z0-9&.'’-]+(?:\s+[A-Za-z0-9&.'’-]+){0,5})[.,]?$/i);
    if (signature?.[1]) return signature[1].replace(/\s+/g, " ").trim();
  }
  for (const pattern of COMPANY_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const company = boundCompany(match[1]);
      if (company) return company;
    }
  }
  const chained = text.match(NAME_THEN_COMPANY);
  if (chained?.[1]) {
    const company = boundCompany(chained[1]);
    if (company) return company;
  }
  return null;
}

const ROLE_KEYWORDS = /(administrator|admin|manager|director|officer|engineer|analyst|owner|lead|specialist|coordinator|supervisor|consultant|developer|architect|president|founder|cto|cio|ceo|cfo|head of|support|billing|it|manajer|direktur|kepala|operasional|teknologi|dukungan|bisnis|pengembangan)\b/i;

// Explicit role statements only. Never inferred from a name or company.
const ROLE_PATTERNS: RegExp[] = [
  /\bi(?:\s*am|'?m)\s+(?:the|a|an)\s+([A-Za-z][A-Za-z /&.-]{2,50}?)(?:\s+(?:at|for|of|in|here)\b|[.,\n;!?]|$)/i,
  /\bi work as\s+(?:a|an|the)?\s*([A-Za-z][A-Za-z /&.-]{2,50}?)(?:\s+(?:at|for|of|in)\b|[.,\n;!?]|$)/i,
  /\bi(?:\s*am|'?m)\s+responsible for\s+([A-Za-z][A-Za-z /&.-]{2,50}?)(?:[.,\n;!?]|$)/i,
  /(?:^|[\n,])\s*((?:cto|cio|ceo|cfo|manajer|direktur|kepala|administrator|admin|manager|director|officer|engineer|analyst|founder|support|billing)(?:\s+[A-Za-z]+){0,2}?)(?:\s+(?:dari|di|untuk|at|for|of)\b|[.,\n;!?]|$)/im
];

/** True when the ticket contains an explicit role statement (used to gate AI role). */
export function textHasExplicitRole(text: string): boolean {
  return ROLE_PATTERNS.some((pattern) => {
    const match = text.match(pattern);
    return Boolean(match?.[1] && ROLE_KEYWORDS.test(match[1]));
  });
}

function extractRole(text: string): string | null {
  for (const pattern of ROLE_PATTERNS) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && ROLE_KEYWORDS.test(candidate) && candidate.length <= 50) {
      return candidate.replace(/\s+/g, " ");
    }
  }
  return null;
}

/**
 * Deterministic customer-context extraction. Returns nulls when no reliable
 * evidence exists — never a guess.
 */
export function extractCustomerContext(text: string): CustomerContext {
  const source = text ?? "";
  const senderName = extractName(source);
  const companyName = extractCompany(source);
  const senderRole = extractRole(source);
  return {
    senderName,
    companyName,
    senderRole,
    confidence: { senderName: senderName ? 0.95 : 0, companyName: companyName ? (/^(PT|CV|LLC|Ltd\.?|Inc\.?|Corp\.?)/i.test(companyName) ? 0.98 : 0.8) : 0, senderRole: senderRole ? 0.9 : 0 }
  };
}

export function isLikelyCompanyName(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const value = candidate.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 100 || /[@\d]{2,}/.test(value)) return false;
  const words = value.toLowerCase().split(/\s+/);
  if (words.some((word) => NON_COMPANY_PHRASES.has(word))) return false;
  return /^(pt|cv|llc|ltd\.?|inc\.?|corp\.?|company)\b/i.test(value) || words.length >= 2;
}

export function validateExtractedTicketFields(fields: ExtractedTicketFields): ExtractedTicketFields {
  return {
    ...fields,
    senderName: isLikelyPersonName(fields.senderName) ? fields.senderName : null,
    companyName: isLikelyCompanyName(fields.companyName) ? fields.companyName : null,
    senderRole: fields.senderRole?.trim() || null
  };
}
