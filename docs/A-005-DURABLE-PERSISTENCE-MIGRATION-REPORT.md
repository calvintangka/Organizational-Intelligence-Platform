# A-005 Durable Shared Persistence & Environment-Independent Organizational Memory

**Migration Architecture Report · 2026-07-10**

---

## Table of Contents

[A](#a-executive-summary) · [B](#b-current-persistence-architecture) · [C](#c-complete-persisted-state-inventory) · [D](#d-current-domain-entity-relationship-map) · [E](#e-organization-isolation-findings--bug-005) · [F](#f-data-access-coupling-analysis) · [G](#g-recommended-persistence-abstraction) · [H](#h-database-technology-recommendation) · [I](#i-proposed-database-schema) · [J](#j-authentication-and-actor-identity-boundary) · [K](#k-localstorage-migration-strategy) · [L](#l-testing-and-agent-access-strategy) · [M](#m-staged-implementation-plan) · [N](#n-regression-test-requirements) · [O](#o-risks-and-mitigations) · [P](#p-exact-first-implementation-task) · [Q](#q-codex-prompt-for-the-first-implementation-task) · [R](#r-files-codex-may-modify) · [S](#s-files-codex-must-not-modify) · [T](#t-documentation-that-must-be-updated-after-implementation)

---

## A. Executive Summary

OIP's validated learning pipeline is technically sound and architecturally governed. Its persistence layer is not. Every piece of Organizational Memory — knowledge items, trust scores, validation records, memory change history — lives in one browser's `localStorage` with no organization scoping, no actor identity, and no shared access. This report maps the exact gap between what the code does today and what durable, organization-scoped persistence requires, then recommends the smallest safe migration path that does not break the validated learning system already built.

The three findings that drive urgency:

- **BUG-005 is structural.** `selectOrganization()` switches the active profile but does not reload knowledge — because all knowledge is stored under global, org-agnostic keys. Every organization sees the same knowledge base.
- **No entity carries `organizationId`** except `TicketRecord`. Knowledge items, validation records, memory change records, candidates, patterns, and metrics all lack it. Adding the column to a database schema is easy; backfilling existing data consistently is not.
- **The persistence abstraction boundary already exists.** `lib/orgMemory.ts`, `lib/organizationProfile.ts`, and `lib/ticketRecords.ts` completely encapsulate localStorage. The domain logic in `app/page.tsx` never calls `localStorage` directly. This is the most important architectural fact in the migration: the swap surface is small and well-defined.

The recommended path is a **six-phase staged migration** — Phase 0 (this document) through Phase 5 — that introduces a persistence adapter interface, adds `organizationId` to all domain entities, deploys a SQLite database behind existing API routes, migrates localStorage exports safely, then adds persistent test organizations for agent regression access. Authentication (Phase 6) is scoped and sequenced last.

---

## B. Current Persistence Architecture

All persistence is client-side. `lib/orgMemory.ts` is the canonical persistence module. It defines a `STORAGE_VERSION = "v2"` constant and stores every domain entity under keys of the form `oip.{entity}.v2`. The organization profile uses a separate versioning suffix `v1`.

React state in `app/page.tsx` is the runtime source of truth. Persistence is triggered by `useEffect` hooks that watch each state variable and call the corresponding `save*` function whenever the value changes after hydration. On mount, a single `useEffect` loads all entities from localStorage and sets state.

The flow is:

```
Browser mount
  → useEffect([], [])
    → loadOrganizationProfile() → setOrganizationProfile()
    → loadKnowledge()           → setKnowledgeItems()
    → loadKnowledgeCandidates() → setKnowledgeCandidates()
    → loadValidationRecords()   → setValidationRecords()
    → loadMemoryChangeRecords() → setMemoryChangeRecords()
    → loadOrgMetrics()          → setOrgMetrics()
    → loadOrgLog()              → setIntelligenceLog()
    → loadEmergingPatterns()    → setEmergingPatterns()
    → loadTicketRecords()       → setTicketRecords()
    → setHydrated(true)

State mutation
  → useEffect([knowledgeItems, hydrated])
    → saveKnowledge(knowledgeItems)  ← writes immediately on any change
```

Self-heal migrations run inside `loadKnowledge()`: `repairCorruptedCustomerTemplates()` and `repairLegacyLessonResponseTemplates()` execute on every app mount and persist back if they changed anything. There is no formal migration version table; the `v2` key suffix is the entire version strategy.

> **Key architectural fact:** The domain logic (`app/page.tsx`, `lib/drafting.ts`, `lib/trustEngine.ts`, etc.) never references `window.localStorage` directly. All storage access goes through the three persistence modules. This is the swap point for server-side persistence.

---

## C. Complete Persisted-State Inventory

| Entity | Storage Key | Read Function | Write Function | Mutation Authority | Org-Scoped? | Actor-Scoped? | Migration Risk |
|--------|-------------|---------------|----------------|-------------------|-------------|---------------|----------------|
| `KnowledgeItem[]` | `oip.knowledge.v2` | `loadKnowledge()` | `saveKnowledge()` | `applyValidatedMemoryChange()` in page.tsx | NO | NO | HIGH — no orgId field; self-heal migrations must not re-run destructively |
| `KnowledgeCandidate[]` | `oip.knowledgeCandidates.v2` | `loadKnowledgeCandidates()` | `saveKnowledgeCandidates()` | `createCandidate()`, `importKnowledgePack()` | NO | NO | MEDIUM — no orgId; status field can be proposed/validated/rejected |
| `ValidationRecord[]` | `oip.validationRecords.v2` | `loadValidationRecords()` | `saveValidationRecords()` | `applyValidatedMemoryChange()` | NO | PARTIAL — actor: "knowledge_validator" (hard-coded string) | HIGH — append-only; must remain traceable; actor field is fake identity |
| `MemoryChangeRecord[]` | `oip.memoryChanges.v2` | `loadMemoryChangeRecords()` | `saveMemoryChangeRecords()` | `applyValidatedMemoryChange()` | NO | NO | HIGHEST — contains full before/after KnowledgeItem snapshots as JSON blobs; large |
| `OrgMetrics` | `oip.orgMetrics.v2` | `loadOrgMetrics()` | `saveOrgMetrics()` | page.tsx metric accumulation | NO | NO | MEDIUM — flat scalar bag; loses per-day granularity on migration |
| `IntelligenceLogEntry[]` | `oip.intelligenceLog.v2` | `loadOrgLog()` | `saveOrgLog()` | page.tsx pipeline events | NO | NO | LOW — capped at 80 entries; ephemeral diagnostic value |
| `EmergingPattern[]` | `oip.emergingPatterns.v2` | `loadEmergingPatterns()` | `saveEmergingPatterns()` | `upsertEmergingPattern()` | NO | NO | MEDIUM — no orgId; contains example ticket references |
| `TicketRecord[]` | `oip.ticketRecords.v2` | `loadTicketRecords()` | `saveTicketRecords()` | `createTicketRecord()`, page.tsx updates | PARTIAL — orgId field exists but not used for key isolation | NO | MEDIUM — has orgId on record but all orgs share one list; no filtering enforced |
| Ticket counters | `oip.ticketCounter.v2` | `loadCounters()` | `saveCounters()` | `generateTicketId()` | PARTIAL — counter keyed by profile.id but stored globally | NO | LOW — per-org counter already keyed; easy to migrate |
| `OrganizationProfile` | `oip.organizationProfile.v1` | `loadOrganizationProfile()` | `saveOrganizationProfile()` | `changeOrganizationProfile()` | N/A — is the org | NO | LOW — single selected profile; v1 key (diverges from v2 entities) |
| `OrganizationProfile[]` (list) | `oip.organizationList.v1` | `loadOrganizationList()` | `saveOrganizationList()` | `addOrganization()`, `syncProfileIntoList()` | N/A — is the list | NO | LOW — seeded from `seedOrganizationProfiles`; no history |
| Theme preference | `maesa-theme` | `localStorage.getItem` direct | `localStorage.setItem` direct | settings toggle | NO | NO | NONE — UI preference; not organizational memory |

### Seed / Hydration Behavior

`loadKnowledge()` falls back to `seedOrganizationalKnowledge()` when localStorage is empty. This means a clean profile always starts with the seed knowledge items from `data/seedKnowledge.ts`. The seed is not organization-scoped — every organization gets the same starting knowledge. That is intentional today but becomes a correctness problem once multiple organizations have distinct live memory.

### In-Memory State Used as Persistence

Two state slices are never persisted to localStorage and exist only for the current session:

- `metrics` (`Metrics` type) — session-level ticket counters reset on page reload. The persisted equivalent is `orgMetrics` (`OrgMetrics` type).
- `sessionCreatedIds` — tracks which knowledge IDs were created this session, used to prevent duplicate commits. Lost on reload.

---

## D. Current Domain Entity Relationship Map

| Entity | Stable ID? | ID Generation | Has organizationId? | Has actorId? | Relationships | Append-only? | Canonical vs. Derived |
|--------|-----------|---------------|---------------------|--------------|---------------|--------------|----------------------|
| `KnowledgeItem` | YES | Client: `crypto.randomUUID()` or template | NO | NO | `sourceTicketId`, `knowledgeVersions[].sourceTicketId`, `lessons[].sourceTicketId` | PARTIAL — mutable trust/reuse fields; versions[] append-only | Canonical |
| `Lesson` (embedded) | YES | Client: `lesson-${Date.now()}` | NO (inherited via parent) | NO | `sourceTicketId` | PARTIAL — embedded; parent item is mutable | Canonical — embedded sub-entity |
| `KnowledgeVersion` (embedded) | YES | `versionId` field | NO (inherited) | NO | `sourceTicketId` | YES — append-only via versions[] | Canonical — versioned history |
| `KnowledgeCandidate` | YES | Client: `candidate-${Date.now()}` | NO | NO | `sourceTicketIds[]`, `relatedKnowledgeId?` | NO — status field mutated (proposed→validated/rejected) | Canonical — learning pipeline |
| `ValidationRecord` | YES | Client: `vr-${Date.now()}` | NO | PARTIAL — actor: always "knowledge_validator" | `candidateId`, `knowledgeId?`, `knowledgeVersionId?` | YES — appended never mutated | Canonical — audit |
| `MemoryChangeRecord` | YES | Client: `mcr-${Date.now()}` | NO | NO | `knowledgeId`, `candidateId`, `validationRecordId` | YES — append-only audit | Canonical — governance |
| `TicketRecord` | YES | `generateTicketId()` → `{PREFIX}-{DATE}-{NNNN}` | YES — `orgId` field present | NO | `validationRecordIds[]`, `memoryMatch.knowledgeId` | NO — status field mutated through pipeline | Canonical — case record |
| `EmergingPattern` | YES | Client: `pattern-${Date.now()}` | NO | NO | `exampleTickets[].ticketId` | NO — status and counters mutated | Derived from ticket patterns |
| `OrgMetrics` | N/A | N/A | NO | NO | None | NO — accumulator bag | Derived |
| `OrganizationProfile` | YES — `id` | Static seed or user-created | IS the org | NO | None | NO — mutated directly | Canonical |

### Key Structural Observations

- `Lesson` and `KnowledgeVersion` are embedded sub-entities inside `KnowledgeItem` rather than first-class database rows. This works in localStorage but complicates relational storage — these will need to stay as JSON columns or be normalized into child tables.
- All IDs are client-generated using `Date.now()`-based patterns. These are not guaranteed globally unique across users or environments. Migration to a server must either preserve these IDs (safe if they came from one browser) or assign new stable IDs (requires a mapping table).
- `MemoryChangeRecord.beforeState` and `afterState` are full `KnowledgeItem` JSON snapshots. In a relational database, these will be stored as `JSONB` columns. They can be large.
- The `KnowledgeProvenance` embedded in `KnowledgeItem` contains `createdBy` and `validatedBy` string fields — both currently hold the string `"knowledge_validator"`, not real actor identity.

---

## E. Organization Isolation Findings / BUG-005

> **BUG-005 CONFIRMED:** Organization switching does not reload or isolate organizational memory. All organizations share one knowledge base, one validation history, one metrics bag, and one pattern list. This is a fundamental architectural gap, not a display bug.

### Exact Failure Trace

`selectOrganization()` at `app/page.tsx:1455`:

```ts
function selectOrganization(id: string) {
  const found = organizationList.find((org) => org.id === id);
  if (!found || found.id === organizationProfile.id) return;
  setOrganizationProfile(found);          // ← switches profile
  setBusinessRelevance(null);             // ← clears transient UI state
  setAiAdvisory(null);
  setErrorMessage("");
  addLogEntries([...]);
  // ← MISSING: reload of knowledgeItems, validationRecords,
  //             memoryChangeRecords, orgMetrics, emergingPatterns
}
```

Even if reloads were added, they would retrieve the same data — because all entities are stored under global, org-agnostic localStorage keys:

```
oip.knowledge.v2          ← NOT oip.knowledge.{orgId}.v2
oip.validationRecords.v2  ← NOT oip.validationRecords.{orgId}.v2
oip.orgMetrics.v2         ← NOT oip.orgMetrics.{orgId}.v2
```

### Paths Where Cross-Organization Leakage Occurs

| Path | Leakage Type | Severity |
|------|-------------|----------|
| Knowledge retrieval after org switch | Org A reads Org B's validated knowledge items and trust scores | CRITICAL |
| Ticket classification post-switch | Org A's categories and canonical problems applied to Org B's tickets | CRITICAL |
| Metrics display | OrgMetrics accumulate across all organizations into one counter bag | HIGH |
| Trust evaluation | Org A's validation records govern trust for Org B's knowledge items | CRITICAL |
| Lesson reuse | Org A's lessons surface in Org B's drafts | CRITICAL |
| Pattern detection | Org A's emerging patterns shown in Org B's pattern view | MEDIUM |
| Reflection / memory commit | New knowledge committed from Org B enters the shared org-agnostic pool | CRITICAL |
| Cases view | TicketRecords have orgId but all are loaded together; filtering is not enforced in all views | MEDIUM |

### Fix Sequence Recommendation

**Fix organization isolation before database migration.** The reason: adding a database while cross-org leakage exists would persist the leakage durably and make it harder to clean up. The correct order is:

1. Add `organizationId` to all domain entity types (Phase 1 — type changes only).
2. Enforce org-scoped loading in all persistence helpers using org-partitioned localStorage keys (Phase 2 — localStorage isolation first).
3. Migrate to a server-side database behind the same persistence interface (Phase 3).

Fixing org isolation in localStorage first means that by the time the database is introduced, the data model is already correctly scoped and the migration is clean.

---

## F. Data Access Coupling Analysis

### Direct localStorage Access

The only files that call `window.localStorage` directly:

- `lib/orgMemory.ts` — all knowledge/candidate/validation/memoryChange/metrics/log/pattern persistence
- `lib/organizationProfile.ts` — profile and org list persistence
- `lib/ticketRecords.ts` — ticket records and counters
- `app/page.tsx` — one direct call: `window.localStorage.getItem("maesa-theme")` and `setItem` for theme (line 606, 651)

The domain functions in `lib/analyzer.ts`, `lib/trustEngine.ts`, `lib/drafting.ts`, `lib/reflection.ts`, `lib/canonicalProblemEngine.ts`, `lib/memory.ts`, `lib/bulkUpload.ts`, and `lib/knowledgePacks.ts` do **not** touch localStorage. They receive and return typed domain objects. This is the correct coupling.

### Coupling Assessment

> **Coupling is low and well-bounded.** The persistence layer is already separated from the domain layer. The three persistence modules act as informal repositories. The migration does not require rewriting domain logic.

### What the Persistence Modules Currently Lack

- They do not accept `organizationId` as a parameter — all reads/writes are global.
- They do not have an async interface — they are synchronous localStorage wrappers. A database backend requires async/await.
- They have no error propagation contract — failures are silently swallowed.
- They have no transaction semantics — a write to knowledge does not atomically update validationRecords.

### Recommended Abstraction

Do not add a new architectural layer. Instead, evolve the three existing persistence modules into a clean interface:

```ts
// lib/orgMemory.ts evolves to:
export async function loadKnowledge(organizationId: string): Promise<KnowledgeItem[]>
export async function saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void>

// Behind the interface, two adapters:
// 1. LocalStorageAdapter — current behavior, keyed by orgId
// 2. ServerAdapter — fetches from /api/persistence/*
```

This is the minimal change that enables the localStorage→database swap without touching `app/page.tsx` domain logic. The three persistence modules become thin adapters. No `PersistenceRepository` class hierarchy or dependency injection framework is needed at this stage.

The one file that needs updating outside the persistence modules is `app/page.tsx`: all calls to `load*()` and `save*()` must be made async, and the `useEffect` save hooks must await the adapter.

---

## G. Recommended Persistence Abstraction

The recommended abstraction is an **adapter pattern on the existing modules**, not a new repository class system. The interface is implicitly defined by the current function signatures, extended to accept `organizationId` and return `Promise`.

### Adapter Interface (conceptual)

```ts
interface PersistenceAdapter {
  // Knowledge
  loadKnowledge(orgId: string): Promise<KnowledgeItem[]>
  saveKnowledge(orgId: string, items: KnowledgeItem[]): Promise<void>

  // Candidates
  loadCandidates(orgId: string): Promise<KnowledgeCandidate[]>
  saveCandidates(orgId: string, candidates: KnowledgeCandidate[]): Promise<void>

  // Validation
  loadValidationRecords(orgId: string): Promise<ValidationRecord[]>
  saveValidationRecords(orgId: string, records: ValidationRecord[]): Promise<void>

  // Memory Changes
  loadMemoryChangeRecords(orgId: string): Promise<MemoryChangeRecord[]>
  saveMemoryChangeRecords(orgId: string, records: MemoryChangeRecord[]): Promise<void>

  // Tickets
  loadTicketRecords(orgId: string): Promise<TicketRecord[]>
  saveTicketRecords(orgId: string, records: TicketRecord[]): Promise<void>

  // Metrics, Log, Patterns
  loadOrgMetrics(orgId: string): Promise<OrgMetrics>
  saveOrgMetrics(orgId: string, metrics: OrgMetrics): Promise<void>
  loadOrgLog(orgId: string): Promise<IntelligenceLogEntry[]>
  saveOrgLog(orgId: string, entries: IntelligenceLogEntry[]): Promise<void>
  loadEmergingPatterns(orgId: string): Promise<EmergingPattern[]>
  saveEmergingPatterns(orgId: string, patterns: EmergingPattern[]): Promise<void>

  // Organizations
  loadOrganizationProfile(orgId: string): Promise<OrganizationProfile | null>
  saveOrganizationProfile(profile: OrganizationProfile): Promise<void>
  loadOrganizationList(): Promise<OrganizationProfile[]>
  saveOrganizationList(list: OrganizationProfile[]): Promise<void>
}
```

### Phase 1 Implementation: LocalStorageAdapter

The `LocalStorageAdapter` reimplements the current persistence modules with org-partitioned keys:

```ts
// Key strategy: oip.{entity}.{orgId}.v3
const KNOWLEDGE_KEY = (orgId: string) => `oip.knowledge.${orgId}.v3`;
```

The version suffix bumps from `v2` to `v3` at this point to signal that keys are now org-scoped. The old `v2` keys remain in the browser for migration purposes.

### Phase 3 Implementation: ServerAdapter

The `ServerAdapter` calls Next.js API routes:

```
// GET  /api/persistence/knowledge?orgId=profile-maesa-tech
// POST /api/persistence/knowledge   { orgId, items }
// etc.
```

The swap from `LocalStorageAdapter` to `ServerAdapter` is controlled by an environment variable (`NEXT_PUBLIC_PERSISTENCE_ADAPTER=server`). During transition, a **hybrid adapter** can write to both and read from the server, enabling a gradual cutover.

---

## H. Database Technology Recommendation

### Prototype-to-Persistent Stage

> **Recommendation: SQLite via Prisma ORM, deployed as a file alongside the Next.js app.**

**Why SQLite:** Zero infrastructure. A single file on disk. No Docker container, no cloud database to provision, no connection string management. A solo developer on a hackathon timeline can have a working persistent database in one afternoon. Prisma handles schema migrations with `prisma migrate dev`. SQLite supports JSON columns (`TEXT` with application-level parsing, or `JSON1` extension) for the large blob fields (`beforeState`, `afterState`, `lessons`, `knowledgeVersions`). All foreign key constraints, composite indexes, and append-only enforcement can be implemented immediately.

**Why Prisma:** Type-safe schema definition in one file (`prisma/schema.prisma`). Auto-generates TypeScript client. Migration history tracked in `prisma/migrations/`. Straightforward to swap the provider from `sqlite` to `postgresql` with zero query rewrites. The team is already using TypeScript — Prisma fits without a learning curve.

**Limitation of SQLite:** Not safe for concurrent writes from multiple processes. Acceptable for a solo dev environment. Not acceptable for a production multi-user deployment. The migration path to PostgreSQL is explicit and planned.

### Long-Term Production Stage

> **Recommendation: PostgreSQL, hosted on Neon (serverless) or Supabase (auth + db bundle).**

**Why PostgreSQL:** Full JSONB support for embedded sub-entities. Transactions across tables (critical for the candidate → validation → knowledge atomic commit). Row-level security (future organization isolation at the database layer). Proven at scale. Prisma supports it with no query changes from SQLite.

**Why Neon over Supabase initially:** Neon is pure PostgreSQL with a generous free tier and zero lock-in. No auth layer to configure. The Prisma connection string is identical to any other PostgreSQL host. Supabase is a better choice once authentication is being added (Stage 6) because it bundles auth, row-level security policies, and a database into one product.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| MongoDB / DocumentDB | Not recommended | The domain model has explicit referential integrity requirements (candidate → validation → memory change). A document database would require manual joins and makes append-only enforcement harder to audit. |
| Drizzle ORM | Alternative to Prisma | Lighter weight, faster, TypeScript-first. Valid choice. Prisma has better migration tooling and a larger ecosystem for a solo developer at this stage. |
| Turso (libSQL) | Considered | SQLite-compatible, edge-deployable. Good choice if the app moves to Vercel Edge. Slightly more complex setup than file-based SQLite for current prototype stage. |
| IndexedDB | Rejected | Still browser-only. Solves quota limits but not the shared-access or agent-regression problems. |
| Redis | Rejected | In-memory by default. Not suitable for organizational memory that must survive restarts without snapshot complexity. |

---

## I. Proposed Database Schema

All tables include `organization_id` as a non-null foreign key. All lookup tables are indexed on `(organization_id, id)`. Append-only tables are indexed on `(organization_id, created_at)` for ordered retrieval.

```sql
-- Organizations
CREATE TABLE organizations (
  id           TEXT PRIMARY KEY,           -- e.g. "profile-maesa-tech"
  name         TEXT NOT NULL,
  industry     TEXT NOT NULL,
  profile_json TEXT NOT NULL,              -- full OrganizationProfile as JSON
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Items (canonical organizational memory)
CREATE TABLE knowledge_items (
  id                      TEXT PRIMARY KEY,
  organization_id         TEXT NOT NULL REFERENCES organizations(id),
  title                   TEXT NOT NULL,
  problem                 TEXT NOT NULL,
  category                TEXT NOT NULL,
  approved_answer         TEXT NOT NULL,
  tags                    TEXT NOT NULL DEFAULT '[]',     -- JSON array
  trust_score             REAL NOT NULL DEFAULT 20,
  times_reused            INTEGER NOT NULL DEFAULT 0,
  lifecycle_state         TEXT NOT NULL DEFAULT 'active',
  source_ticket_id        TEXT NOT NULL,
  canonical_problem_id    TEXT,
  canonical_problem_title TEXT,
  customer_response_tmpl  TEXT,
  internal_guidance       TEXT,
  lessons                 TEXT NOT NULL DEFAULT '[]',     -- JSON: Lesson[]
  knowledge_versions      TEXT NOT NULL DEFAULT '[]',     -- JSON: KnowledgeVersion[]
  learning_history        TEXT NOT NULL DEFAULT '[]',     -- JSON: LearningHistoryEntry[]
  example_tickets         TEXT NOT NULL DEFAULT '[]',     -- JSON: CanonicalProblemExample[]
  provenance              TEXT,                           -- JSON: KnowledgeProvenance
  validation              TEXT,                           -- JSON: KnowledgeValidation
  approved_at             DATETIME NOT NULL,
  last_used_at            DATETIME,
  last_validated_at       DATETIME,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ki_org ON knowledge_items(organization_id);
CREATE INDEX idx_ki_org_cat ON knowledge_items(organization_id, category);

-- Knowledge Candidates (proposed memory mutations)
CREATE TABLE knowledge_candidates (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id),
  source_ticket_ids    TEXT NOT NULL DEFAULT '[]',   -- JSON array
  proposed_action      TEXT NOT NULL,                -- create_new|merge_existing|create_version|trust_update_only
  proposed_content     TEXT NOT NULL,                -- JSON: KnowledgeCandidateContent
  related_knowledge_id TEXT REFERENCES knowledge_items(id),
  rationale            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'proposed',  -- proposed|validated|rejected
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_kc_org ON knowledge_candidates(organization_id);
CREATE INDEX idx_kc_org_status ON knowledge_candidates(organization_id, status);

-- Validation Records (append-only audit)
CREATE TABLE validation_records (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id),
  candidate_id         TEXT NOT NULL REFERENCES knowledge_candidates(id),
  knowledge_id         TEXT REFERENCES knowledge_items(id),
  knowledge_version_id TEXT,
  decision             TEXT NOT NULL,    -- approved|rejected
  actor                TEXT NOT NULL,    -- actor string (dev identity now, real userId later)
  role_exercised       TEXT NOT NULL DEFAULT 'knowledge_validator',
  rationale            TEXT,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_vr_org ON validation_records(organization_id);
CREATE INDEX idx_vr_org_kid ON validation_records(organization_id, knowledge_id);
-- No UPDATE or DELETE on this table ever.

-- Memory Change Records (append-only audit with before/after snapshots)
CREATE TABLE memory_change_records (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id),
  knowledge_id         TEXT NOT NULL REFERENCES knowledge_items(id),
  candidate_id         TEXT NOT NULL REFERENCES knowledge_candidates(id),
  validation_record_id TEXT NOT NULL REFERENCES validation_records(id),
  change_type          TEXT NOT NULL,    -- reflection action
  before_state         TEXT,             -- JSON: KnowledgeItem | null
  after_state          TEXT NOT NULL,    -- JSON: KnowledgeItem
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mcr_org ON memory_change_records(organization_id);
CREATE INDEX idx_mcr_org_kid ON memory_change_records(organization_id, knowledge_id);
-- No UPDATE or DELETE on this table ever.

-- Ticket Records
CREATE TABLE ticket_records (
  ticket_id             TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id),
  raw_message           TEXT NOT NULL,
  subject               TEXT,
  classification        TEXT,             -- JSON: TicketRecordClassification
  memory_match          TEXT,             -- JSON: TicketRecordMemoryMatch
  draft_source          TEXT,             -- ai_advisory|deterministic|no_template|null
  resolution            TEXT NOT NULL,    -- JSON: TicketRecordResolution
  reflection            TEXT NOT NULL,    -- JSON: TicketRecordReflection
  validation_record_ids TEXT NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'open',
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tr_org ON ticket_records(organization_id);
CREATE INDEX idx_tr_org_status ON ticket_records(organization_id, status);
CREATE INDEX idx_tr_org_created ON ticket_records(organization_id, created_at DESC);

-- Ticket Counters (per-org sequence)
CREATE TABLE ticket_counters (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  counter_key     TEXT NOT NULL,    -- profile.id
  count           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, counter_key)
);

-- Org Metrics (one row per org, mutable accumulator)
CREATE TABLE org_metrics (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  metrics_json    TEXT NOT NULL,    -- JSON: OrgMetrics
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Intelligence Log (per-org, capped)
CREATE TABLE intelligence_log (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  event           TEXT NOT NULL,
  detail          TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_log_org_created ON intelligence_log(organization_id, created_at DESC);

-- Emerging Patterns
CREATE TABLE emerging_patterns (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id),
  title            TEXT NOT NULL,
  summary          TEXT NOT NULL,
  category         TEXT NOT NULL,
  tags             TEXT NOT NULL DEFAULT '[]',
  keywords         TEXT NOT NULL DEFAULT '[]',
  example_tickets  TEXT NOT NULL DEFAULT '[]',
  times_seen       INTEGER NOT NULL DEFAULT 1,
  confidence_score REAL NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'monitoring',
  first_seen_at    DATETIME NOT NULL,
  last_seen_at     DATETIME NOT NULL
);
CREATE INDEX idx_ep_org ON emerging_patterns(organization_id);
```

---

## J. Authentication and Actor Identity Boundary

A-005 does not require full authentication. It requires a minimum identity boundary that enables organization-scoped storage without becoming an architectural backdoor.

### Staged Identity Model

| Stage | Identity | Actor Field | Org Membership | Authorization |
|-------|----------|-------------|----------------|---------------|
| **Stage 1 (A-005)** | Dev/test actor from env var: `DEV_ACTOR_ID=dev-calvin` | Populated from env at request time | Env-configured org: `DEV_ORG_ID` | None — all operations allowed in dev mode |
| **Stage 2** | Session token (cookie-based, no OAuth) | Stable token-derived actorId | Single org per actor, stored in session | Basic — org boundary enforced |
| **Stage 3** | Real OAuth / Supabase Auth | auth.uid() or provider sub | org_memberships table | Row-level security on org boundary |
| **Stage 4** | Same as Stage 3 | Immutable per-provider sub | Roles and permissions | Full authorization enforcement |

### Stage 1 Safe Guards

The dev actor pattern must not become a production backdoor. Enforced through:

- Stage 1 API routes check `process.env.NODE_ENV === 'development'` before accepting dev actor headers.
- The `actor` field in all server API responses is logged and never accepted from the client request body — it is always server-resolved.
- No route with a dev actor path may reach a production database. Environment variables gate this explicitly.

The `actor` field currently contains the string `"knowledge_validator"` everywhere. In Stage 1, it becomes the env-configured dev actor ID. In Stage 2 it becomes a real session-derived identity. The database column does not change — only the value being written changes.

---

## K. localStorage Migration Strategy

> **Core principle:** No silent destructive replacement. The existing mature browser state must be exportable, previewable, and migrateable explicitly. A failed migration must leave the browser state untouched.

### Required Properties

- **Explicit trigger:** Migration only runs when the user clicks "Migrate to server" in Settings. Never auto-triggered on page load.
- **Export first:** User can download a `oip-export-{date}.json` before migration begins.
- **Preview before commit:** Show a summary of entities found: N knowledge items, M validation records, P lessons, Q ticket records.
- **Target organization selection:** User selects which organization the browser data belongs to (defaulting to the currently-selected profile).
- **Duplicate detection:** Compare incoming IDs against existing server records; existing IDs skip insert (idempotent).
- **Stable ID preservation:** Client-generated IDs are kept as-is. No re-ID on migration. Relationships (candidateId → validationRecordId → knowledgeId) remain intact.
- **KnowledgeVersion preservation:** The `knowledgeVersions[]` array embedded in each KnowledgeItem must be transferred intact without flattening.
- **Lesson preservation:** All `lessons[]` embedded in KnowledgeItems transferred intact, including signals and doNotPromise arrays.
- **Provenance preservation:** `KnowledgeProvenance` and `KnowledgeValidation` embedded objects transferred as JSON columns.
- **ValidationRecord integrity:** All validation records transferred with their candidateId → knowledgeId links. The append-only constraint begins at migration time.
- **Migration record:** A `migrations` table entry records when the migration ran, which org, how many entities were transferred, and whether it succeeded.
- **Rollback:** If the server returns an error during bulk insert, the entire migration transaction rolls back. Browser state is not modified.
- **Idempotency:** Running the migration twice produces no duplicates. All inserts use `INSERT OR IGNORE` (SQLite) or `INSERT ... ON CONFLICT DO NOTHING` (PostgreSQL).

### Fields That Cannot Currently Be Reconstructed

| Missing Field | Entity | Impact | Mitigation |
|--------------|--------|--------|------------|
| `organizationId` | KnowledgeItem, ValidationRecord, MemoryChangeRecord, KnowledgeCandidate, EmergingPattern, OrgMetrics | HIGH — must be inferred at migration time | User selects the organization during migration; it is stamped onto all entities |
| Real `actor` identity | ValidationRecord, MemoryChangeRecord, KnowledgeProvenance | MEDIUM — validation history has fake actor | Preserve "knowledge_validator" as-is; document that pre-migration records have synthetic actor identity |
| Per-day metric granularity | OrgMetrics | LOW — only current-day counter preserved | Migrate the flat metric bag as-is; accept that historical per-day breakdown is not recoverable |
| Intelligence log beyond 80 entries | IntelligenceLogEntry[] | LOW — ring buffer caps at 80 | Migrate what exists; older entries are already gone |

### Migration Endpoint Design

```
POST /api/migrate/from-localstorage
Body: {
  organizationId: string,
  preview: boolean,          // true = dry run, return counts only
  payload: {
    knowledgeItems:      KnowledgeItem[],
    knowledgeCandidates: KnowledgeCandidate[],
    validationRecords:   ValidationRecord[],
    memoryChangeRecords: MemoryChangeRecord[],
    ticketRecords:       TicketRecord[],
    orgMetrics:          OrgMetrics,
    emergingPatterns:    EmergingPattern[],
    intelligenceLog:     IntelligenceLogEntry[]
  }
}
Response: {
  preview?: { counts, conflicts, newItems, skippedIds }
  success?: boolean
  migrationId?: string
}
```

---

## L. Testing and Agent Access Strategy

The development/testing model must give Codex, Claude Code, and human testers access to mature organizational state without requiring the specific browser profile where live QA was performed.

> **Recommendation: Dedicated persistent test organization with seeded fixture state, loaded from a committed JSON file.**

### Test Organization Structure

```
data/fixtures/
  test-org-maesa-tech.json     ← Maesa Tech test org fixture
  test-org-fastdrop.json       ← FastDrop test org fixture
  test-org-pramana-legal.json  ← Pramana Legal test org fixture

Each fixture contains:
{
  organization: OrganizationProfile,
  knowledgeItems: KnowledgeItem[],        // mature — Login/Billing/etc with trust > 50
  knowledgeCandidates: KnowledgeCandidate[],
  validationRecords: ValidationRecord[],
  memoryChangeRecords: MemoryChangeRecord[],
  ticketRecords: TicketRecord[],          // Grace/Derek/Putri/etc historical cases
  emergingPatterns: EmergingPattern[],
  orgMetrics: OrgMetrics
}
```

### Fixture Generation

Fixtures are generated from a live localStorage export using a CLI script:

```sh
npx tsx scripts/export-test-fixture.ts \
  --org profile-maesa-tech \
  --out data/fixtures/test-org-maesa-tech.json
```

The script reads the current localStorage (via a Playwright browser automation), redacts any PII in raw ticket messages, and writes the fixture file. This becomes the committed regression baseline.

### Test Database Seeding

```sh
npx tsx scripts/seed-test-db.ts \
  --fixture data/fixtures/test-org-maesa-tech.json \
  --db .db/test.sqlite
```

Agents and CI runs point to the test database. They never touch the development or production database.

### Regression Sequences Supported

- Grace Adeyemi — Login Issue with discrimination, sender name extraction
- Derek Huang — lesson reuse, placeholder rendering
- Putri Lestari — switched-laptop/browser-saved-password lesson match
- Stephanie Gunawan — lesson-grounded reflection, trust update only
- Adrian Santoso — Billing classification, no Login lesson match (BUG-006 regression)
- Jevania / Felix / Clara — additional QA sequences as fixtures are captured

### Agent Access Model

- Agents use environment variable `DATABASE_URL=file:.db/test.sqlite`
- Production database uses a different env var not available to agents
- Agents may reset the test database by re-running the seed script
- Agents may not access production or staging databases

---

## M. Staged Implementation Plan

### Phase 0 — Architecture Decision (This Document)

**Objective:** Define the schema, adapter interface, migration strategy, and phase sequence. No code written.

- Files affected: `ai/` documentation only
- Verification: This report reviewed and approved
- Rollback: N/A — doc only

### Phase 1 — Domain Types + Adapter Interface

**Objective:** Add `organizationId?` to all entity types. Make persistence functions async. Introduce the adapter interface. localStorage still the backend. No behavioral change.

Files affected:
- `types/knowledge.ts` — add `organizationId?`
- `types/ticket.ts` — no change needed (`orgId` exists)
- `types/patterns.ts` — add `organizationId?`
- `types/metrics.ts` — add `organizationId?` to OrgMetrics
- `lib/orgMemory.ts` — async signatures, org param
- `lib/organizationProfile.ts` — async signatures
- `lib/ticketRecords.ts` — async signatures
- `app/page.tsx` — await all load/save calls

Migration risk: LOW — type additions are additive; optional field  
Verification: `npx tsc --noEmit` passes; app loads normally  
Rollback: Revert type changes; no data modified

### Phase 2 — Organization Isolation in localStorage (BUG-005 Fix)

**Objective:** Switch storage keys to org-partitioned form. `selectOrganization()` reloads all data. Fix cross-org leakage.

New key format: `oip.knowledge.{orgId}.v3`

Files affected:
- `lib/orgMemory.ts` — parameterized keys
- `lib/ticketRecords.ts` — org-partitioned keys
- `app/page.tsx` — `selectOrganization()` reloads state

Migration risk: MEDIUM — existing v2 data must be migrated to v3 keys on first load  
Verification: Switch org → knowledge reloads; no cross-org data visible  
Rollback: Revert key format; v2 data still intact

### Phase 3 — Server-Side Database (SQLite/Prisma)

**Objective:** Deploy Prisma + SQLite. Add Next.js API routes behind the adapter interface. Feature-flag the backend (`PERSISTENCE_ADAPTER=server`).

New files:
- `prisma/schema.prisma`
- `prisma/migrations/`
- `app/api/persistence/*.ts`
- `lib/adapters/serverAdapter.ts`
- `lib/adapters/localStorageAdapter.ts`

Migration risk: MEDIUM — new infra; localStorage fallback kept active  
Verification: With `PERSISTENCE_ADAPTER=server`, app loads from database; data persists across browser profile wipes  
Rollback: Set `PERSISTENCE_ADAPTER=localStorage`

### Phase 4 — localStorage Export + Migration UI

**Objective:** Add explicit migration flow in Settings. Export button. Preview modal. Server-side migration endpoint. Idempotent insert.

New files:
- `components/views/MigrationView.tsx`
- `app/api/migrate/from-localstorage/route.ts`
- `scripts/export-test-fixture.ts`

Migration risk: LOW — explicit user action; no auto-migration  
Verification: Export → preview → migrate flow; fixture file committed  
Rollback: Migration endpoint returns errors → user retries; browser unchanged

### Phase 5 — Persistent Test Organizations + Agent Fixtures

**Objective:** Commit fixture files for all three test orgs. Seeding script. Separate test database. Codex/Claude Code point to test DB.

New files:
- `data/fixtures/test-org-*.json`
- `scripts/seed-test-db.ts`
- `.db/test.sqlite` (gitignored; generated)

Migration risk: NONE to production; test only  
Verification: Agent runs regression sequence against test DB and gets correct lesson matches  
Rollback: Delete test DB and re-seed

### Phase 6 — Authentication + Actor Identity

**Objective:** Real auth (Supabase or NextAuth). Immutable actorId on all validation records. OrganizationMembership table. Row-level security.

**Scope note:** This phase is NOT part of A-005. It is the next architectural milestone after A-005 is complete.

Migration risk: HIGH — all API routes change  
Verification: Unauthorized actor cannot read another org's data

---

## N. Regression Test Requirements

The migration must preserve all of the following behaviors. Each can be verified against the committed fixture database before and after each phase:

| Behavior | Verification Method | Fixture Required |
|----------|--------------------|--------------------|
| Validated learning pipeline (candidate → validation → knowledge) | Submit new ticket, approve, commit reflection; verify ValidationRecord and MemoryChangeRecord created | Any org with empty knowledge |
| Lesson reuse (Derek/Putri/Stephanie) | Submit ticket matching lesson signals; verify lesson-grounded draft rendered | Login Issue with switched-laptop lesson at trust > 20 |
| Contradiction blocking (Adrian) | Submit billing ticket; verify no Login lesson match | Login Issue knowledge item present |
| Trust accumulation across sessions | Resolve two tickets against same knowledge item; trust score increases persist after page reload | Login Issue at trust 20 |
| KnowledgeVersion history preserved | Create version via reflection; verify versions[] count increases; old version retrievable | Any knowledge item |
| MemoryChangeRecord append-only | Verify no UPDATE on memory_change_records table; only INSERTs | Any org |
| WHY THIS RESPONSE / ProvenancePanel | Resolve a lesson-grounded ticket; WHY THIS RESPONSE names the lesson and signals | Login Issue with lessons |
| Human review gate for AI drafts | With AI enabled, submit ticket with AI draft; verify status stays "in_review" until approved | Cold-start state |
| Organization isolation post Phase 2 | Switch org; verify knowledge items change to org B's memory | Two orgs with different knowledge |
| Knowledge Pack import | Import login-issues-v1.json; verify lessons appear in knowledge; validate; verify in DB | Empty Maesa Tech org |

---

## O. Risks and Mitigations

### HIGH — Accidental data loss during v2→v3 key migration

The one-time migration from global keys to org-partitioned keys in localStorage could silently drop data if the migration function crashes mid-way.

**Mitigation:** Migrate by *copying* to new keys first; only remove old keys after successful read-back from new keys. Keep a backup copy under a third key for one release cycle.

### HIGH — Cross-organization data leakage on migration

If the migration stamps the wrong organizationId on entities, another organization's knowledge becomes corrupted with foreign data.

**Mitigation:** Migration requires explicit org selection. Dry-run preview shows entity counts before commit. Migration is wrapped in a database transaction.

### HIGH — Broken stable IDs — client-generated IDs collide in multi-user environment

`Date.now()`-based IDs from different clients can collide. A ValidationRecord from two different users created at the same millisecond would conflict.

**Mitigation:** Phase 1 changes ID generation to use `crypto.randomUUID()` (available in modern browsers and Node.js 14.17+). Server-side ID assignment is available for Phases 3+.

### HIGH — MemoryChangeRecord before/after JSON blobs corrupt on schema drift

The KnowledgeItem shape stored in beforeState/afterState may diverge from the current TypeScript type over time, causing deserialization errors on old records.

**Mitigation:** Never deserialize old beforeState/afterState blobs back into typed KnowledgeItem objects in domain logic. Treat them as opaque historical snapshots for audit display only.

### MED — Trust score inflation or reset across the migration boundary

If trustScore values are not migrated correctly, mature knowledge items could appear as low-trust or high-trust in ways that affect auto-resolution gating.

**Mitigation:** Migration includes explicit validation: every knowledge item's trustScore is checked against its successfulResolutions count; anomalous items are flagged in the preview report.

### MED — Partial write leaves knowledge item and validation record inconsistent

If the server crashes between writing the ValidationRecord and updating the KnowledgeItem, the candidate is marked validated but the knowledge item does not reflect the change.

**Mitigation:** The migration endpoint wraps all inserts in a single database transaction. The existing app write path (`applyValidatedMemoryChange()`) must also be wrapped in a server-side transaction in Phase 3.

### MED — Stale browser/server divergence after cutover

A user who continues using localStorage after the server is deployed will accumulate changes not visible to other users or agents.

**Mitigation:** The feature flag (`PERSISTENCE_ADAPTER`) applies to all users simultaneously. Once server mode is enabled, the localStorage adapter is disabled. A banner informs users that state was migrated.

### MED — Agent test contamination — test fixtures mixed with dev data

If agents use the same database as the developer, their test tickets and knowledge mutations appear in the dev workspace.

**Mitigation:** Agents always use `DATABASE_URL=file:.db/test.sqlite`. Dev and test databases are separate files. CI uses a fresh test database seeded from fixtures on each run.

### LOW — localStorage quota exceeded before migration runs

Mature localStorage with many MemoryChangeRecord blobs may approach the 5–10 MB browser quota.

**Mitigation:** Current `saveOrgLog()` already caps at 80 entries. MemoryChangeRecord count grows with every validation; monitoring the count is worthwhile. The export-before-migration flow mitigates data loss even if quota is reached.

### LOW — Self-heal migrations replay destructively on server

`repairCorruptedCustomerTemplates()` and `repairLegacyLessonResponseTemplates()` run inside `loadKnowledge()`. On a server, this could trigger unwanted writes on every request.

**Mitigation:** Phase 3 moves self-heal migrations to a one-time startup script (`scripts/repair-migrations.ts`) rather than running them inside `loadKnowledge()` on every call.

---

## P. Exact First Implementation Task

> **First task: Phase 1 — Add `organizationId` to domain entity types and make persistence functions accept it as a parameter, with localStorage as the adapter implementation. No behavioral change. Build and typecheck must pass.**

### Exact Scope

1. Add `organizationId?: string` to `KnowledgeItem` in `types/knowledge.ts`.
2. Add `organizationId?: string` to `KnowledgeCandidate` in `types/knowledge.ts`.
3. Add `organizationId?: string` to `ValidationRecord` in `types/knowledge.ts`.
4. Add `organizationId?: string` to `MemoryChangeRecord` in `types/knowledge.ts`.
5. Add `organizationId?: string` to `EmergingPattern` in `types/patterns.ts`.
6. Add `organizationId?: string` to `OrgMetrics` in `types/metrics.ts`.
7. Update `lib/orgMemory.ts`: all `load*` and `save*` functions accept an optional `organizationId?: string` parameter. When provided, keys become `oip.{entity}.{organizationId}.v3`. When absent, fall back to the current `v2` keys (backward compatibility during transition). Return types become `Promise<T>`.
8. Update `lib/ticketRecords.ts`: same optional org parameter on load/save functions.
9. Update `lib/organizationProfile.ts`: make load/save functions return `Promise<T>`.
10. Update `app/page.tsx`: add `async/await` to all calls to persistence functions inside `useEffect` hooks. The mount `useEffect` becomes an async IIFE. Pass `organizationProfile.id` to all `load*`/`save*` calls.
11. Update `applyValidatedMemoryChange()` in `app/page.tsx` to stamp `organizationId: organizationProfile.id` onto new candidates, validation records, and memory change records before saving.
12. Run `npm run build` and `npx tsc --noEmit`. Both must pass.

### What This Task Must NOT Do

- Must not change storage key format (that is Phase 2).
- Must not create any database files or install any database packages.
- Must not change `selectOrganization()` behavior (that is Phase 2).
- Must not change any learning pipeline logic.
- Must not change the `clearOrganization()` behavior.

---

## Q. Codex Prompt for the First Implementation Task

```
You are implementing Phase 1 of the A-005 persistence migration for the OIP prototype. This is a preparatory type-extension and async-interface task only. No database is created. No storage keys change. No behavioral change occurs. Build and typecheck must pass when done.

CONTEXT:
- OIP is a Next.js 15 / React 19 / TypeScript app at `app/page.tsx`
- All persistence is in `lib/orgMemory.ts`, `lib/organizationProfile.ts`, `lib/ticketRecords.ts`
- Types live in `types/knowledge.ts`, `types/patterns.ts`, `types/metrics.ts`
- The app currently calls persistence functions synchronously in useEffect hooks
- Read `ai/BOUNDARIES.md` before starting. Do not modify any pipeline logic.

TASK: Add organizationId fields to domain types, make persistence functions async, pass organizationId through.

STEP 1 — types/knowledge.ts:
Add `organizationId?: string` as an optional field to:
- KnowledgeItem (after the `id` field)
- KnowledgeCandidate (after the `id` field)
- ValidationRecord (after the `id` field)
- MemoryChangeRecord (after the `id` field)
Do not change any other fields. Do not reorder fields.

STEP 2 — types/patterns.ts:
Add `organizationId?: string` to EmergingPattern (after `id`).

STEP 3 — types/metrics.ts:
Add `organizationId?: string` to OrgMetrics (after the last existing field).

STEP 4 — lib/orgMemory.ts:
Change ALL load* and save* function signatures to:
- Accept an optional `organizationId?: string` parameter as the first parameter
- Return `Promise<T>` instead of `T`
- Key logic: if organizationId is provided, use key `oip.{entity}.${organizationId}.v3`; otherwise fall back to the existing `oip.{entity}.v2` key unchanged
- Wrap the existing synchronous body in `return Promise.resolve(...)` — do not change the actual logic
- seedOrganizationalKnowledge(), seedOrgMetrics(), seedEmergingPatterns() stay synchronous
- clearOrganization() stays synchronous
- deriveOrgStats() stays synchronous

STEP 5 — lib/ticketRecords.ts:
Apply the same async-signature change to loadTicketRecords() and saveTicketRecords():
- Accept optional `organizationId?: string` as first parameter
- Return Promise<T>
- loadCounters() / saveCounters() / generateTicketId() stay synchronous

STEP 6 — lib/organizationProfile.ts:
Make loadOrganizationProfile(), saveOrganizationProfile(), loadOrganizationList(), saveOrganizationList() return Promise<T>. No new parameters needed. Wrap bodies in Promise.resolve().

STEP 7 — app/page.tsx:
- The mount useEffect at line ~594 must become an async IIFE:
  useEffect(() => { (async () => { ... })(); }, []);
- Every call to load*() in that IIFE must be awaited and pass organizationProfile.id where relevant:
  setKnowledgeItems(await loadKnowledge(organizationProfile.id));
  etc.
- The save useEffect hooks must become async:
  useEffect(() => { if (hydrated) { saveKnowledge(organizationProfile.id, knowledgeItems); } }, [...]);
  (No need to await in useEffect unless you need the result — fire-and-forget is fine)
- In applyValidatedMemoryChange(): when creating a new KnowledgeCandidate, ValidationRecord, or MemoryChangeRecord, stamp organizationId: organizationProfile.id onto the object before saving.
- The one direct localStorage call for theme (line ~606 and ~651) may remain direct.

STEP 8 — Verify:
Run: npm run build
Run: npx tsc --noEmit
Both must pass with zero errors. Report pass/fail.

STEP 9 — Update ai/CHANGELOG.md and ai/CURRENT_STATUS.md per the mandatory closing steps in ai/CODING_WORKFLOW.md.

DO NOT:
- Change storage key names (no v3 keys yet)
- Install any packages
- Modify lib/trustEngine.ts, lib/reflection.ts, lib/drafting.ts, lib/analyzer.ts, lib/memory.ts
- Change any UI components
- Create any database files
- Change clearOrganization() behavior
- Change selectOrganization() behavior
```

---

## R. Files Codex May Modify

```
types/knowledge.ts
types/patterns.ts
types/metrics.ts
lib/orgMemory.ts
lib/organizationProfile.ts
lib/ticketRecords.ts
app/page.tsx
ai/CHANGELOG.md
ai/CURRENT_STATUS.md
ai/CODEBASE_MAP.md (only if new files were added — they were not in Phase 1)
```

---

## S. Files Codex Must Not Modify

```
lib/trustEngine.ts
lib/reflection.ts
lib/drafting.ts
lib/analyzer.ts
lib/memory.ts
lib/canonicalProblemEngine.ts
lib/bulkUpload.ts
lib/knowledgePacks.ts
lib/patternDiscovery.ts
lib/domainClassifier.ts
lib/ai/*  (all files)
app/api/* (all files)
components/* (all files)
data/* (all files)
types/knowledge.ts — only additions allowed; no field renames, reorders, or removals
ai/BOUNDARIES.md
ai/ARCHITECTURE.md (Phase 1 does not change architecture)
docs/* (all files — documentation update deferred to Phase end)
prisma/* (does not exist yet)
```

---

## T. Documentation That Must Be Updated After Implementation

| Document | After Which Phase | What to Update |
|----------|------------------|----------------|
| `ai/CHANGELOG.md` | Every phase | Standard changelog entry per CODING_WORKFLOW.md format |
| `ai/CURRENT_STATUS.md` | Every phase | What changed, what is now true, what remains open |
| `ai/CODEBASE_MAP.md` | Phase 3 (new files added) | Add adapter files, Prisma files, API routes, migration script |
| `ai/ARCHITECTURE.md` | Phase 3 | Persistence section: replace "browser localStorage via lib/orgMemory.ts" with server-side description. Note adapter pattern. |
| `ai/BOUNDARIES.md` | Phase 3 | Boundary 8 (reset/danger): update to reference database-level clearing, not just localStorage.removeItem |
| `docs/implementation/16_STORAGE_ARCHITECTURE.md` | After Phase 5 | Document the actual deployed storage architecture: SQLite/Prisma, org-scoped tables, adapter pattern, migration strategy |
| `docs/architecture/09_DATA_ARCHITECTURE.md` | After Phase 5 | Note that organizationId is now present on all canonical entities; actor identity gap still exists pre-Phase 6 |
| This report (A-005) | After each phase completes | Mark each phase as COMPLETED with actual date and any deviations from plan |
