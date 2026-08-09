import type { Ticket } from "@/types";

export type IntentSentenceLabel =
  | "ACTIVE_PROBLEM" | "BACKGROUND" | "RESOLVED_HISTORY" | "NEGATED" | "QUOTED"
  | "HYPOTHETICAL" | "REQUEST" | "WORKAROUND" | "OBSERVATION" | "SECURITY_SIGNAL";

export interface IntentSentence {
  text: string;
  labels: IntentSentenceLabel[];
  topics: string[];
  retrievalWeight: number;
  temporalState?: "current" | "historical" | "resolved" | "future" | "quoted" | "unknown";
  actionability?: "high" | "medium" | "low";
}

export interface IntentCandidate {
  intent: string;
  confidence: number;
  priority: number;
  temporalRelevance: number;
  actionability: number;
  reason: string;
  evidence: string[];
  status: "primary" | "secondary" | "historical" | "ignored";
}

export interface IntentContradiction {
  topic: string;
  statements: string[];
  detected: true;
  resolution: "investigation_required";
}

export interface SecurityIntent {
  detected: boolean;
  severity: "low" | "medium" | "high" | "critical";
  reasons: string[];
  escalationRequired: boolean;
  unauthorizedRequest: boolean;
  requestedActions: string[];
}

export interface IntentIsolationResult {
  version: 1;
  sentences: IntentSentence[];
  activeProblemText: string;
  currentRequestText?: string;
  retrievalText: string;
  ignoredTopics: string[];
  negatedTopics: string[];
  primaryIssueHint?: string;
  object?: string;
  requestedOutcome?: string;
  problemStage?: string;
  temporalState?: string;
  intentHierarchy?: IntentCandidate[];
  contradictions?: IntentContradiction[];
  contradictionDetected?: boolean;
  securityIntent: SecurityIntent;
}

/* TODO-080 security rules are intentionally preserved unchanged. */
const SECURITY_RULES: Array<{ pattern: RegExp; reason: string; severity: SecurityIntent["severity"] }> = [
  { pattern: /\b(phish(?:ing|ed)?|credential theft|stolen credentials|social engineering|fake (?:login|support) page|malicious link)\b/i, reason: "phishing or social-engineering signal", severity: "critical" },
  { pattern: /\b(unexpected login|unrecognized login|unknown login|unfamiliar login|signed in|logged in)\b[^.!?\n]{0,100}\b(not me|unfamiliar|unknown|foreign|country|location)|\b(account compromised|compromised account|session hijack|token theft|suspicious session|unauthorized access)\b/i, reason: "possible account compromise or unauthorized access", severity: "critical" },
  { pattern: /\b(disable|turn off|delete|suppress|remove)\b[^.!?\n]{0,80}\b(audit logs?|logging|audit trail)\b/i, reason: "request to disable or remove audit evidence", severity: "critical" },
  { pattern: /\b(?:api key|secret|credential|database (?:password|credentials|user)|private key|webhook(?:\s+(?:signing|verification))?\s+(?:secret|credential|key)|(?:webhook|api)\s+(?:signature|authentication|verification)\s+(?:failure|failed|rejected|invalid|mismatch))\b/i, reason: "secret, credential, webhook, or database access signal", severity: "high" },
  // Merely describing an administrator role is not an escalation request.
  // Require an explicit mutation/elevation verb so benign permission-denial
  // tickets do not become security incidents because they mention "Reporting
  // Administrator" in historical context.
  { pattern: /\b(temporary owner|make .*owner|promote .*owner|elevate privileges?|privilege escalation|bypass approval|grant .*admin(?:istrator)?|assign .*admin(?:istrator)?)\b/i, reason: "privilege escalation or owner/admin mutation signal", severity: "critical" },
  { pattern: /\b(?:akses tidak sah|akses tanpa izin|aktivitas akun yang tidak kami kenali|login dari lokasi yang tidak kami kenali|email mencurigakan|tautan(?: situs)?(?: yang)? berbeda)\b/i, reason: "possible phishing or unauthorized access signal", severity: "critical" },
  { pattern: /\b(export|download|dump)\b[^.!?\n]{0,60}\b(all data|customer data|users?|records?)\b/i, reason: "sensitive data export signal", severity: "high" },
  { pattern: /\b(password|login|account|email address|email)\b[^.!?\n]{0,80}\b(changed|changed by|not me|didn't|did not|unknown|unrecognized|change was not mine)\b/i, reason: "possible unauthorized credential or account change", severity: "critical" }
];

const SECURITY_ACTIONS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(disable|turn off|delete|remove)\b[^.!?\n]{0,80}\b(audit logs?|logging|audit trail)\b/i, label: "disable audit logging" },
  { pattern: /\b(make|promote|assign|grant|give)\b[^.!?\n]{0,50}\b(owner|admin|administrator|privilege)/i, label: "grant elevated privileges" },
  { pattern: /\b(provide|send|share|give|show|expose)\b[^.!?\n]{0,60}\b(api key|secret|password|credential|database)/i, label: "expose credentials or secrets" },
  { pattern: /\b(export|download|dump)\b[^.!?\n]{0,60}\b(all data|customer data|users?|records?)/i, label: "export sensitive data" },
  { pattern: /\b(approve|authorize|allow|bypass)\b[^.!?\n]{0,60}\b(without|no|missing)\b[^.!?\n]{0,30}\b(approval|authorization)/i, label: "bypass authorization" }
];

function normalize(value: string): string {
  return value.replace(/\r/g, "").replace(/[\u2018\u2019]/g, "'").trim();
}

function splitSentences(text: string): string[] {
  return normalize(text).split(/\n+|(?<=[.!?]["\u201d])\s+|(?<=[.!?])\s+/).map((part) => part.trim().replace(/^[-*]\s+/, "")).filter(Boolean);
}

function topicsFor(text: string): string[] {
  const signals: Array<[string, RegExp]> = [
    ["login", /\b(login|log in|sign in|masuk|kata sandi|password)\b/i],
    ["activation", /\b(activation|activate|aktivasi|undangan|invitation|activation email)\b/i],
    ["billing", /\b(invoice|billing|tagihan|charge|payment|pembayaran)\b/i],
    ["refund", /\b(refund|pengembalian dana|money back)\b/i],
    ["delivery", /\b(delivery|shipment|shipping|tracking|pengiriman|paket)\b/i],
    ["report_export", /\b(report|reporting|export|csv|unduh|download|data export)\b/i],
    ["permissions", /\b(permission|permissions|role|access denied|akses|owner|administrator|admin)\b/i],
    ["sso", /\b(sso|saml|identity provider|certificate|sertifikat)\b/i],
    ["security", /\b(phishing|compromised|unauthorized|unexpected login|audit|secret|credential|webhook|api key|database)\b/i]
  ];
  return signals.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function securityIntent(text: string): SecurityIntent {
  const reasons: string[] = [];
  let severity: SecurityIntent["severity"] = "low";
  const benignFederatedRotation = /\b(?:sso|saml|identity provider|corporate identity|federat(?:ed|ion)|certificate|signing credential|provider maintenance)\b/i.test(text)
    && !/\b(?:phishing|compromised|unauthorized|unfamiliar|not me|suspicious|unexpected)\b/i.test(text);
  const benignFederatedCredentialRotation = benignFederatedRotation
    && /\b(?:signing credential|signing certificate|certificate rotation|certificate renewal|signing metadata|credential replacement|provider maintenance)\b/i.test(text)
    && !/\b(?:provide|send|share|give|expose|reveal|forward)\b[^.!?\n]{0,60}\b(?:credential|secret|key|password)\b/i.test(text);
  const benignWebhookRotation = /\b(?:webhook|signature)\b[^.!?\n]{0,80}\b(?:secret rotation|rotated|rotation)\b/i.test(text)
    && !/\b(?:provide|send|share|give|expose)\b[^.!?\n]{0,60}\b(?:secret|credential|key)\b/i.test(text);
  for (const rule of SECURITY_RULES) {
    if (!rule.pattern.test(text)) continue;
    if (benignFederatedRotation && rule.reason === "possible unauthorized credential or account change") continue;
    if (benignFederatedCredentialRotation && rule.reason === "secret, credential, webhook, or database access signal") continue;
    if (benignWebhookRotation && rule.reason === "secret, credential, webhook, or database access signal") continue;
    reasons.push(rule.reason);
    if (rule.severity === "critical" || (rule.severity === "high" && severity !== "critical")) severity = rule.severity;
  }
  const requestedActions = SECURITY_ACTIONS
    .filter((action) => {
      const match = action.pattern.exec(text);
      if (!match || match.index === undefined) return false;
      const prefix = text.slice(Math.max(0, match.index - 45), match.index);
      // "Do not ask us to send credentials" is a safety boundary, not a
      // request to expose credentials. Negated security language must not
      // route an otherwise benign ticket to security review.
      return !/\b(?:do not|don't|dont|never|not|without)\b[^.!?\n]{0,35}$/i.test(prefix);
    })
    .map((action) => action.label);
  const unauthorizedRequest = requestedActions.length > 0 || /\b(unauthorized|without authorization|without approval|not authorized|no approval|bypass)\b/i.test(text);
  const detected = reasons.length > 0 || unauthorizedRequest;
  return { detected, severity: detected && severity === "low" ? "high" : severity, reasons: [...new Set(reasons)], escalationRequired: detected, unauthorizedRequest, requestedActions: [...new Set(requestedActions)] };
}

function hasQuotedText(text: string): boolean {
  return /["\u201c\u201d\u00ab\u00bb]/.test(text) || /^>/.test(text) || /\b(?:quoted|previous support message said|old quoted)\b/i.test(text);
}

function isTopicNegation(text: string, topics: string[]): boolean {
  if (topics.length === 0) return false;
  // Negative symptom grammar is not intent negation: "has not moved",
  // "never arrived", and "not received" describe the active failure.
  if (/\b(?:has not moved|not moved|never arrived|never received|not received|did not receive|not working|cannot|can't|unable)\b/i.test(text)) return false;
  const topicPattern = topics.join("|").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:not|no|never|don't|didn't|doesn't|without|bukan|tidak)\\b[^.!?\\n]{0,45}\\b(?:${topicPattern}|password reset|physical-address request|login issue|billing issue)\\b(?:[^.!?\\n]{0,35}\\b(?:issue|problem|request|reason|concern|context)\\b)?`, "i").test(text)
    || /\b(?:not the reason|not related|unrelated|do not reopen|don't reopen|jangan membuka kembali)\b/i.test(text);
}

function sentenceTemporalState(labels: IntentSentenceLabel[]): IntentSentence["temporalState"] {
  if (labels.includes("QUOTED")) return "quoted";
  if (labels.includes("RESOLVED_HISTORY")) return "resolved";
  if (labels.includes("BACKGROUND")) return "historical";
  return labels.includes("ACTIVE_PROBLEM") || labels.includes("REQUEST") ? "current" : "unknown";
}

function contradictionSignals(text: string): IntentContradiction[] {
  const statements = text.split(/\n+|(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const contradictions: IntentContradiction[] = [];
  const unused = statements.find((statement) => /\b(?:never used|unused|no one used|no activity|without activity)\b/i.test(statement));
  const activity = statements.find((statement) => /\b(?:logged in|signed in|exported|downloaded|employees? used|activity appeared)\b/i.test(statement));
  if (unused && activity) contradictions.push({ topic: "account_usage", statements: [unused, activity], detected: true, resolution: "investigation_required" });
  else if (/\b(?:never used|unused|no activity)\b[^.!?\n]{0,100}\b(?:logged in|signed in|exported|downloaded|employees? used|activity appeared)\b/i.test(text)) {
    contradictions.push({ topic: "account_usage", statements: [text], detected: true, resolution: "investigation_required" });
  }
  const neverReceived = statements.find((statement) => /\b(?:never received|never arrived|did not receive|not received)\b/i.test(statement));
  const received = statements.find((statement) => /\b(?:received|arrived|delivered)\b/i.test(statement) && !/\bnever\b/i.test(statement));
  if (neverReceived && received) contradictions.push({ topic: "delivery_or_message_receipt", statements: [neverReceived, received], detected: true, resolution: "investigation_required" });
  return contradictions;
}

function rankIntentCandidates(activeText: string, ignoredTopics: string[], contradictions: IntentContradiction[]): IntentCandidate[] {
  const candidates: Array<{ intent: string; pattern: RegExp; reason: string }> = [
    { intent: "security_incident", pattern: /\b(phishing|compromised|unauthorized|suspicious session|temporary owner|disable audit|secret|credential theft)\b/i, reason: "security signal requires authorized review" },
    { intent: "refund_investigation", pattern: /\b(refund|money back|pengembalian dana)\b/i, reason: "explicit refund or eligibility request" },
    { intent: "duplicate_invoice", pattern: /\b(?:duplicate invoice|two invoices|same subscription period|same period,? seats|billed twice)\b/i, reason: "duplicate invoice evidence outranks generic billing vocabulary" },
    { intent: "role_permission", pattern: /\b(permission|permissions|role|access denied|administrator approval)\b/i, reason: "access-control request or denial" },
    { intent: "report_export_timeout", pattern: /\b(report|export|csv|download)\b[^.!?\n]{0,80}\b(timeout|stuck|stall|minutes?|rows?|large|progress|hang)\b/i, reason: "export failure is the actionable problem" },
    { intent: "activation_failure", pattern: /\b(activation|activate|invitation|pending invitation|never created a password)\b/i, reason: "activation/provisioning request" },
    { intent: "sso_certificate", pattern: /\b(sso|saml|identity provider|certificate rotation|signing certificate)\b/i, reason: "federated authentication infrastructure issue" },
    { intent: "delivery_delay", pattern: /\b(tracking|shipment|delivery|package)\b[^.!?\n]{0,80}\b(delay|late|stalled|stuck|not moved|passed|not arrived)\b/i, reason: "current delivery delay or stale tracking" },
    { intent: "login_failure", pattern: /\b(cannot sign in|can't sign in|cannot log in|login failure|password|sign in|log in)\b/i, reason: "current authentication request" }
  ];
  const results: IntentCandidate[] = candidates.filter((candidate) => candidate.pattern.test(activeText)).map((candidate) => {
    const evidence = activeText.match(candidate.pattern)?.[0] ? [activeText.match(candidate.pattern)![0]] : [];
    const contradictionPenalty = contradictions.length > 0 && /refund|billing|login/i.test(candidate.intent) ? 0.2 : 0;
    const confidence = Math.max(0, Math.min(1, 0.85 - contradictionPenalty));
    return { intent: candidate.intent, confidence, priority: Math.round(confidence * 100), temporalRelevance: 1, actionability: 1, reason: contradictions.length > 0 ? `${candidate.reason}; contradiction requires investigation` : candidate.reason, evidence, status: "secondary" as const };
  });
  const historical = ignoredTopics.map((topic) => ({ intent: topic, confidence: 0.4, priority: 0, temporalRelevance: 0, actionability: 0, reason: "historical, quoted, or negated context", evidence: [topic], status: "historical" as const }));
  results.sort((left, right) => right.priority - left.priority || right.confidence - left.confidence);
  if (results[0]) results[0].status = "primary";
  return [...results, ...historical];
}

export function isolateIntent(ticketOrText: Ticket | string): IntentIsolationResult {
  const text = typeof ticketOrText === "string" ? ticketOrText : `${ticketOrText.subject}\n${ticketOrText.description}`;
  const security = securityIntent(text);
  const sentences = splitSentences(text).map((sentence) => {
    const topics = topicsFor(sentence);
    const labels: IntentSentenceLabel[] = [];
    const quoted = hasQuotedText(sentence);
    const resolved = /\b(resolved|already fixed|fixed last|previously|historical|former|old issue|no longer|last year|last month|in \w+ \d{4}|in (?:january|february|march|april|may|june|july|august|september|october|november|december)\b|during (?:january|february|march|april|may|june|july|august|september|october|november|december)\b|unrelated|not the reason|do not reopen|jangan membuka kembali)\b/i.test(sentence);
    const negated = isTopicNegation(sentence, topics);
    const request = /\b(please|help|need(?:s)?(?:\s+to|\s+help)?|can you|could you|we need|we want|confirm|explain|determine|investigate|request(?:s|ed)?|questions?|provide|evaluate|tolong|mohon|bisa|perlu|butuh)\b/i.test(sentence);
    const hypothetical = /\b(if|might|may|could be|possibly|wondering whether|jika|mungkin|apakah)\b/i.test(sentence);
    const workaround = /\b(tried|tested|cleared|reset|restarted|changed|removed|mengganti|mencoba|sudah)\b/i.test(sentence);
    const observation = /\b(shows?|display(?:s|ed)?|tracking (?:shows?|says?)|we see|portal|terlihat|menunjukkan)\b/i.test(sentence);
    const active = /\b(cannot|can't|unable|failed|failing|error|issue|problem|denied|stuck|stall(?:ed)?|timeout|delayed|missing|never arrived|never received|not received|not moved|has not moved|tidak bisa|tidak dapat|gagal|terblokir|belum menerima|aneh|mencurigakan)\b/i.test(sentence);
    const identityOnly = /^(?:pt|cv|llc|ltd\.?|inc\.?|corp\.?|company)\b/i.test(sentence) && !active && !request;
    if (active) labels.push("ACTIVE_PROBLEM");
    if (/\b(for context|background|recently|last month|last year|sebelumnya|sebagai konteks)\b/i.test(sentence)) labels.push("BACKGROUND");
    if (identityOnly) labels.push("BACKGROUND");
    if (resolved) labels.push("RESOLVED_HISTORY");
    if (negated) labels.push("NEGATED");
    if (quoted) labels.push("QUOTED");
    if (hypothetical) labels.push("HYPOTHETICAL");
    if (request) labels.push("REQUEST");
    if (workaround) labels.push("WORKAROUND");
    if (observation) labels.push("OBSERVATION");
    if (SECURITY_RULES.some((rule) => rule.pattern.test(sentence))) labels.push("SECURITY_SIGNAL");
    const uniqueLabels = [...new Set(labels)];
    const suppressed = uniqueLabels.includes("QUOTED") || uniqueLabels.includes("RESOLVED_HISTORY") || uniqueLabels.includes("NEGATED");
    const actionability: IntentSentence["actionability"] = request || active ? "high" : observation || workaround ? "medium" : "low";
    return { text: sentence, labels: uniqueLabels, topics, temporalState: sentenceTemporalState(uniqueLabels), actionability, retrievalWeight: suppressed || identityOnly ? 0 : active || request ? 1 : labels.includes("BACKGROUND") || labels.includes("OBSERVATION") || labels.includes("WORKAROUND") ? 0.35 : hypothetical ? 0.15 : 0.25 };
  });
  const weighted = sentences.filter((sentence) => sentence.retrievalWeight > 0).map((sentence) => sentence.text);
  const active = sentences.filter((sentence) => sentence.retrievalWeight > 0 && (sentence.labels.includes("ACTIVE_PROBLEM") || sentence.labels.includes("REQUEST"))).map((sentence) => sentence.text);
  const ignoredTopics = sentences.filter((sentence) => sentence.retrievalWeight === 0).flatMap((sentence) => sentence.topics);
  const negatedTopics = sentences.filter((sentence) => sentence.labels.includes("NEGATED")).flatMap((sentence) => sentence.topics);
  const activeText = active.join(" ");
  const subjectText = sentences[0]?.retrievalWeight && !activeText.startsWith(sentences[0].text) ? sentences[0].text : "";
  const currentRequestText = [subjectText, activeText].filter(Boolean).join(" ") || weighted.join(" ") || text;
  const analysisText = activeText || currentRequestText;
  const retrievalText = weighted.join(" ");
  const allText = `${analysisText} ${retrievalText}`.toLowerCase();
  const contradictions = contradictionSignals(text);
  const intentHierarchy = rankIntentCandidates(currentRequestText, ignoredTopics, contradictions);
  const primaryIssueHint = security.detected
    ? "security_incident"
    : /\b(?:duplicate invoice|two invoices|same subscription period|same period,? seats|billed twice)\b/i.test(analysisText)
    ? "duplicate_invoice"
    : /\b(refund|pengembalian dana)\b/i.test(analysisText)
    ? "refund_investigation"
    : /\b(access denied|permission|permissions|role|administrator|akses ditolak)\b/i.test(analysisText) && /\b(role|permission|export|approval|izin|hak akses)\b/i.test(analysisText)
    ? "role_permission"
    : /\b(report|export|csv|unduh|download)\b/i.test(analysisText) && /\b(timeout|timing out|stuck|stall|minutes?|baris|rows?|large|besar|progress|hang|lama|percent|persen)\b/i.test(analysisText)
    ? "report_export_timeout"
    : /\b(activation|aktivasi|invitation|undangan|activation email|never created a password|belum menerima email)\b/i.test(analysisText)
    ? "activation_failure"
    : /\b(invoice|billing|tagihan|email address|recipient)\b/i.test(analysisText) && /\b(change|update|incorrect|outdated|salah|ganti|ubah|perbarui|memperbarui|perubahan|mengubah|contact)\b/i.test(analysisText)
    ? "billing_contact_update"
    : /\b(?:sso|saml|identity provider|idp|federat(?:ed|ion)|identity metadata|signing (?:certificate|key|credential)|trust certificate|certificate (?:rotation|renewal|rollover)|sertifikat)\b/i.test(analysisText)
    ? "sso_certificate"
    : /\b(tracking|shipment|delivery|pengiriman|paket)\b/i.test(analysisText) && /\b(delay|late|stuck|stalled|not moved|passed|terlambat|belum)\b/i.test(analysisText)
    ? "delivery_delay"
    : undefined;
  const object = primaryIssueHint === "duplicate_invoice" ? "duplicate_invoice" : primaryIssueHint === "report_export_timeout" ? "large_report_export" : primaryIssueHint === "role_permission" ? "role_and_permission" : primaryIssueHint === "billing_contact_update" ? "billing_contact" : primaryIssueHint === "refund_investigation" ? "refund_and_renewal" : topicsFor(analysisText).join(",") || undefined;
  const requestedOutcome = primaryIssueHint === "security_incident" ? "authorized_security_review" : primaryIssueHint === "role_permission" ? "verify_required_role_permission" : primaryIssueHint === "report_export_timeout" ? "complete_report_export" : primaryIssueHint === "billing_contact_update" ? "correct_billing_contact" : primaryIssueHint === "refund_investigation" ? "investigate_refund" : primaryIssueHint === "duplicate_invoice" ? "investigate_duplicate_invoice" : requestOutcome(analysisText);
  return { version: 1, sentences, activeProblemText: activeText || currentRequestText || text, currentRequestText, retrievalText: retrievalText || activeText || text, ignoredTopics: [...new Set(ignoredTopics)], negatedTopics: [...new Set(negatedTopics)], primaryIssueHint, object, requestedOutcome, problemStage: /\b(timeout|stuck|denied|failed|gagal|ditolak)\b/i.test(allText) ? "failure" : undefined, temporalState: contradictions.length > 0 ? "contradictory_current" : sentences.some((sentence) => ["historical", "resolved", "quoted"].includes(sentence.temporalState ?? "")) ? "historical_and_current" : "current", intentHierarchy, contradictions, contradictionDetected: contradictions.length > 0, securityIntent: security };
}

function requestOutcome(text: string): string | undefined {
  if (/\b(refund|money back|pengembalian dana)\b/i.test(text)) return "refund_or_explanation";
  if (/\b(change|update|ubah|ganti)\b/i.test(text)) return "update_requested";
  if (/\b(help|investigate|explain|bantu|tolong)\b/i.test(text)) return "support_or_explanation";
  return undefined;
}

export function securityIncidentDraft(ticketId: string): { ticketId: string; draftResponse: string; basedOnKnowledgeIds: string[]; confidenceNote: string; source: "no_template" } {
  return { ticketId, draftResponse: "We cannot grant access, disable audit logging, expose credentials, or export sensitive data from this ticket. This report requires authorized security review. Please have the organization owner or security administrator confirm it through the approved security channel. No account, role, logging, secret, or data changes will be made without authorization.", basedOnKnowledgeIds: [], confidenceNote: "Security-sensitive request detected. EscalationRequired: authorized human security review is required before any action.", source: "no_template" };
}
