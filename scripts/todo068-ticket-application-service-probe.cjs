const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { processTicket, ProcessTicketError } = require(path.join(root, "lib", "application", "tickets", "processTicket.ts"));
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));

const profile = seedOrganizationProfiles.find((item) => item.id === "profile-maesa-tech");
assert.ok(profile, "probe profile must exist");

function fakePersistence({ fail = false } = {}) {
  const records = new Map();
  let sequence = 0;
  return {
    records,
    context: { organizationId: profile.id, authority: "local", requestId: "todo068-probe", actorContext: { id: "todo068-actor", name: "TODO-068 Probe" } },
    async generateTicketId() { return `${profile.id}-TODO068-${++sequence}`; },
    async loadTicketRecords() { return [...records.values()].filter((record) => record.orgId === profile.id); },
    async saveTicketRecord(record) {
      if (fail) throw new Error("injected persistence failure");
      assert.equal(record.orgId, profile.id, "persistence port must enforce organization scope");
      records.set(`${profile.id}:${record.ticketId}`, record);
    },
    async loadKnowledgeHistory() { return { validationRecords: [], memoryChangeRecords: [] }; }
  };
}

function ports(persistence) {
  return {
    persistence,
    ai: createAIAdapter({ mode: "disabled", baseUrl: "", model: "probe", timeoutMs: 1, proxyPath: "/probe" })
  };
}

function command(description, overrides = {}) {
  return {
    organizationId: profile.id,
    actorContext: { id: "todo068-actor", name: "TODO-068 Probe", email: "probe@example.test" },
    authority: "local",
    requestId: `todo068-request-${description.slice(0, 8)}`,
    ticketInput: { description, customerName: "Probe Customer", intakeMode: "single" },
    organizationProfile: profile,
    processingOptions: { knowledgeItems: [], sessionCreatedIds: new Set() },
    ...overrides
  };
}

async function main() {
  const persistence = fakePersistence();
  const basePorts = ports(persistence);

  const english = await processTicket(command("I cannot log in because my password is rejected."), { ...basePorts, idempotency: undefined });
  assert.equal(english.processingState, "in_review");
  assert.equal(english.persistedTicket.orgId, profile.id);
  assert.equal(english.language.detection.language, "en");
  assert.ok(english.draft.draftResponse.length > 0, "deterministic fallback must produce a draft");

  const indonesian = await processTicket(command("Saya tidak bisa masuk karena kata sandi saya ditolak."), { ...basePorts, idempotency: undefined });
  assert.equal(indonesian.language.detection.language, "id");
  assert.ok(indonesian.draft.draftResponse.length > 0);

  const business = await processTicket(command("What does your product do and what services does your company provide?"), { ...basePorts, idempotency: undefined });
  assert.equal(business.businessIntent.inquiryType, "business_inquiry");
  assert.equal(business.memoryMatch, null, "business inquiry without business memory uses profile grounding");

  const key = "todo068-duplicate-key";
  const first = await processTicket(command("I need help with my invoice.", { idempotencyKey: key, requestId: "todo068-first" }), basePorts);
  const replay = await processTicket(command("I need help with my invoice.", { idempotencyKey: key, requestId: "todo068-retry" }), basePorts);
  assert.equal(replay.replayed, true);
  assert.equal(replay.ticket.ticketId, first.ticket.ticketId, "replay must not allocate a second ticket");
  const freshIdempotency = new Map();
  const durableReplay = await processTicket(command("I need help with my invoice.", { idempotencyKey: key, requestId: "todo068-reload-retry" }), {
    ...basePorts,
    idempotency: { get: (entry) => freshIdempotency.get(entry), set: (entry, value) => freshIdempotency.set(entry, value) }
  });
  assert.equal(durableReplay.replayed, true, "persisted replay metadata must restore the original result after a process-local cache miss");
  assert.equal(durableReplay.ticket.ticketId, first.ticket.ticketId);
  await assert.rejects(
    () => processTicket(command("A different payload.", { idempotencyKey: key, requestId: "todo068-conflict" }), basePorts),
    (error) => error instanceof ProcessTicketError && error.failure.errorClass === "idempotency_conflict"
  );

  const otherProfile = { ...profile, id: "todo068-other-org" };
  await assert.rejects(
    () => processTicket(command("cross organization", { organizationId: otherProfile.id }), basePorts),
    (error) => error instanceof ProcessTicketError && error.failure.errorClass === "authorization_mismatch"
  );

  const failingPersistence = fakePersistence({ fail: true });
  await assert.rejects(
    () => processTicket(command("persistence failure"), ports(failingPersistence)),
    (error) => error instanceof ProcessTicketError && error.failure.errorClass === "persistence_failure"
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => processTicket(command("cancelled", { signal: controller.signal }), basePorts),
    (error) => error instanceof ProcessTicketError && error.failure.errorClass === "cancelled"
  );

  assert.equal(persistence.records.size, 4, "each successful non-replayed command creates exactly one isolated record");
  console.log("TODO-068 ticket application service probe: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
