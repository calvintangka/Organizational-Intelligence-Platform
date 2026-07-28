# TODO-058 — Language-Neutral Organizational Memory: Architecture & Design

Status: Phases A, B, E, F, H, I, J, K(partial), L, M, N implemented.
Phases C, D, G designed here, **not implemented**.

The objective is one shared Organizational Memory that serves every language —
never one memory per language.

---

## Phase A — Architecture review

### Pipeline and where language influences behavior

| Stage | Implementation | Language dependency (measured) |
|---|---|---|
| Ticket intake | `app/page.tsx` `processTicketPipeline` | None — raw text |
| Business relevance | `assessBusinessRelevanceForProfile` | **HARD** — lexical match of profile vocabulary over an ASCII-folded string |
| Domain classification | `classifyBusinessDomain` | **HARD** — 20 English signal lists |
| Understanding | `understandForProfile` | **HARD** — English category rules |
| Canonical detection | `identifyCanonicalProblem` | **INDIRECT** — consumes `understanding.category` |
| Knowledge retrieval | `lib/orgMemory.ts`, `lib/lessonSelection.ts` | **HARD** — lexical overlap on ASCII text |
| Lesson matching | `signalMatchesTicket`, `findMatchingLesson` | **HARD** — lexical signal match |
| Drafting | `lib/drafting.ts`, `lib/ai/prompts.ts` | **WAS** provider-chosen; now organization policy (Phase F) |
| Reflection | `lib/reflection.ts` | Inherits the language of the lesson text it stores |
| Memory update | `lib/canonicalProblemEngine.ts` | Language-neutral by id; content is whatever language it was authored in |

### The single root assumption

Three normalizers share one ASCII-only rule:

```
lib/textSignal.ts      containsSignal   [^a-z0-9\s-] -> " "
lib/domainClassifier.ts normalizeText   [^a-z0-9\s-] -> " "
lib/analyzer.ts        normalizeForSignalMatching (same shape)
```

Measured consequences (Phase A audit, `identifyCanonicalProblem` over the
Developer Demo profile, one login problem in ten languages):

```
en  relevant=true   category=Login          canonical=Login Issue
id  relevant=true   category=Login          canonical=Login Issue
pt  relevant=true   category=Login          canonical=Login Issue
it  relevant=true   category=Login          canonical=Login Issue
es  relevant=false  category=Uncategorized  canonical=Uncategorized Problem
fr  relevant=false  category=Uncategorized  canonical=Uncategorized Problem
de  relevant=false  category=Uncategorized  canonical=Uncategorized Problem
ja  relevant=false  category=Uncategorized  canonical=Uncategorized Problem
ko  relevant=false  category=Uncategorized  canonical=Uncategorized Problem
zh  relevant=false  category=Uncategorized  canonical=Uncategorized Problem
```

4/10 converge — and only **incidentally**: id/pt/it/en happen to contain the
English loanwords `login` / `password`. Two distinct failure modes:

1. **CJK is erased.** `"ログインできません"` normalizes to `""`. Nothing can match.
2. **Accented Latin words are split, not folded.** `"sesión"` → `"sesi n"`,
   `"não"` → `"n o"`. The token is destroyed rather than folded to `sesion`/`nao`.

### What already supports multilingual input

- The **AI tiers** (LM Studio, Claude) are multilingual, which is why non-English
  tickets "mostly worked" — but only when a provider was reachable, and the
  language of the reply was the model's choice, not policy.
- **Canonical identity is already language-neutral**: canonical problems and
  lessons are keyed by stable ids (`demo-ki-…`, `demo-les-…`), never by text. The
  data model needs no change to be shared across languages — only the *routing*
  into it is language-dependent.

That second point is the key architectural finding: **the memory is already
language-neutral; the lookup path is not.** So the fix belongs in matching, not
in the schema, and no migration or re-authoring of memory is required.

---

## Design decisions

| Decision | Rationale |
|---|---|
| Concepts, not translations | A concept id (`invoice`) is language-neutral; aliases are surface forms. One row serves every language, so no duplicate concepts, knowledge, or lessons. |
| Deterministic detection | Language support is a platform capability, not a vendor feature (Phase J). Detection must work with every provider down. |
| Language is metadata | Stored on the ticket, never on knowledge. Memory cannot fork by language if language is never part of its identity. |
| Additive settings | `conceptVocabulary` and `languagePolicy` are optional. An organization that never opens the settings behaves exactly as before (Phase L). |
| New normalizer, not a replacement | `foldForMatching` is additive. Swapping the three shipped normalizers is Phase C and changes retrieval for every existing organization, so it is staged separately behind a probe. |

---

## Implemented

### Phase B — Language detection (`lib/languageDetection.ts`)

Two stages, no dependencies, no network:

1. **Script** — Hiragana/Katakana ⇒ `ja`, Hangul ⇒ `ko`, Han-only ⇒ `zh`.
   Confidence scales with the CJK share of the text, so one stray glyph in an
   English ticket cannot flip the result.
2. **Lexical** — weighted function words per Latin language plus orthography
   markers (`ñ¿¡`→es, `äöüß`→de, `ãõ`→pt, `-zione`→it, `-ção`→pt, `-ción`→es).
   Confidence blends dominance over the runner-up, share of total evidence, and
   absolute evidence, so a single weak hit never reads as certain.

Ties break on the canonical language order, so detection is deterministic.
Unusable input returns the organization default with `fallbackApplied: true` and
confidence `0` — "assumed English" is always distinguishable from "detected
English". Measured: 20/20 across all ten languages, long and short form.

### Unicode-safe folding (`lib/textNormalization.ts`)

`foldForMatching` keeps `\p{L}\p{N}` from every script and folds **only** the
Latin combining diacritics `U+0300–U+036F`, then re-composes with NFC.

> Stripping all `\p{M}` is wrong for Japanese: dakuten/handakuten
> (`U+3099`/`U+309A`) are combining marks that distinguish real characters, so
> `ログイン` would flatten to `ロクイン`. The probe covers this — it caught the bug.

### Phase E — Concept vocabulary (`lib/conceptVocabulary.ts`)

10 built-in concepts × ~179 aliases across all ten languages (`login`,
`password`, `account`, `invoice`, `payment`, `subscription`, `refund`, `error`,
`access_denied`, `verification_code`). Organization concepts extend the built-ins
and win on id collision. `conceptsInText` matches on folded text; Latin aliases
keep a word-boundary guard (so `key` does not match inside `monkey`), while CJK
matches on substring presence because those scripts do not delimit words.

### Phase F — Response language policy (`lib/languagePolicy.ts`)

`organizationLanguage`, `responseMode` (`customer_language` /
`organization_language` / `fixed_language`), `fixedResponseLanguage`,
`internalLanguage`, `minimumDetectionConfidence`. `resolveResponseLanguage`
returns the target language plus a human-readable reason. A detection below the
confidence bar **never** selects a language — it falls back to the organization
language, so a weak guess cannot cause a reply in a language the customer did not
write. The decision is passed into `buildDraftCustomerResponsePrompt` as an
explicit instruction, so the provider no longer chooses.

### Phases H, I, J, M

- **H** — Organization → Language settings card; ticket workspace shows detected
  language, confidence, method, the reply language, and a reviewer override. An
  override is authoritative (confidence 1) and re-resolves through the same
  policy, so it cannot bypass policy.
- **I** — **Zero schema change.** `Organization.settings` and
  `TicketRecord.classification` are already `Json`. Both new fields are optional
  and the server carries them forward when a client omits them, so an older
  client cannot erase them (the TODO-056 failure mode, prevented by design).
- **J** — Detection, concepts, and policy are pure functions with no provider
  dependency. The policy is resolved *before* any provider call and passed in.
- **M** — detection 1–9 µs, concept matching ~60 µs, policy <1 µs per ticket.
  Against multi-second AI latency this is not measurable.

---

## Designed, NOT implemented

### Phase C — Language-neutral canonical matching

Insert a concept layer between raw text and the existing classifiers:

```
ticket text
  → detectLanguage()                     (implemented)
  → conceptsInText(text, concepts)       (implemented)
  → CONCEPT SET  ────────────────────────┐   language-neutral
  → understanding / domain / canonical   ┘   (needs rewiring)
```

Concretely:

1. Add `concepts: string[]` to `Understanding`, populated by `conceptsInText`.
2. Give each `DOMAIN_RULES` entry and each analyzer category rule a
   `concepts: string[]` alongside its existing English `signals`.
3. Score a rule as `max(englishSignalScore, conceptScore)`. English tickets keep
   the identical path and identical score — this is what makes the change
   backward compatible — while a Japanese ticket reaches the same rule through
   concepts.
4. `identifyCanonicalProblem` is then already language-neutral, because it
   consumes the category rather than the text.

Result: `"I can't log in"`, `"Saya tidak bisa login"`, `"No puedo iniciar sesión"`,
and `"ログインできません"` all produce `{login, password}` → category `Login` →
canonical **`Login Issue`** — one canonical, no `Login Issue EN` / `ID` / `ES`.
(The concept half of this is already proven: the probe asserts all ten languages
reach the same concept set today.)

**Risk and mitigation.** This touches the rule scoring used by every retrieval
probe. Mitigation: concepts *add* score, never subtract, so no English ticket can
lose a match it previously had. Gate: TODO-037/039/040/046/047, BUG-008,
TODO-025G, and mature-retrieval must be byte-identical before and after.

### Phase D — Multilingual semantic retrieval

`signalMatchesTicket` and `findMatchingLesson` match lesson signals lexically
against ticket text. Make lesson signals concept-aware:

1. At lesson-commit time, store `conceptSignals: string[]` next to the existing
   text signals (derived, additive, no re-authoring of existing lessons).
2. In `signalMatchesTicket`, a signal matches if the text matches lexically
   **or** the ticket's concept set contains the signal's concept.
3. Existing lessons with no `conceptSignals` fall back to today's behavior
   exactly — so the 180 seeded demo lessons need no migration.

An English lesson then becomes reusable from an Indonesian, Spanish, or Japanese
ticket **without duplication**, because the lesson is reached through concepts
rather than through its own language.

If concept coverage proves insufficient for long-tail wording, the smallest
production-safe enhancement is an **optional** AI normalization pass that maps an
unmatched ticket to concept ids (never to a translated canonical), cached per
ticket. It stays optional so Phase J holds when no provider is reachable.

### Phase G — Reflection and memory

Reflection needs one rule: **a lesson is written in the organization's
`internalLanguage`, regardless of the ticket's language.** Then a lesson promoted
from a Japanese ticket and one promoted from an English ticket are the same
lesson in the same language, reinforcing the same memory — the existing
`lessonContentFingerprint` and `dedupeLessonCollection` already collapse them.
No language-keyed lesson ids, ever. Trust accrues to the canonical, which has no
language, so trust behavior is unchanged by construction.

---

## Phase N — Data safety

No reset, no reseed, no migration, no duplicate knowledge/canonicals/lessons.
This change writes nothing to the database: verified byte-identical row counts
(knowledge 55, tickets 5089, validations 1862, patterns 56) before and after.

---

## Remaining risk

The gap between "detected + concepts identified" and "routed into memory by
concept" is Phases C/D. Until they land, a Japanese or Spanish ticket is still
classified `Uncategorized` by the deterministic layer and depends on an AI tier —
i.e. today's incidental behavior, now **measured** by the TODO-058 probe rather
than assumed.
