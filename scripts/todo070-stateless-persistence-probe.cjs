const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const persistence = require(path.join(root, "lib", "persistence", "index.ts"));
const context = require(path.join(root, "lib", "persistence", "context.ts"));

const ORG_A = "todo070-disposable-a";
const ORG_B = "todo070-disposable-b";
const actor = { id: "todo070-probe", name: "TODO-070 Probe", email: "probe@example.test" };

function makeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  };
}

function profile(id, initials) {
  return { id, name: `TODO-070 ${id}`, logoInitials: initials, industry: "Probe", description: "Disposable probe organization" };
}

function ticket(orgId, ticketId) {
  return { ticketId, orgId, rawMessage: `isolated ${orgId}`, subject: "probe", status: "open" };
}

function localSession(orgId, requestId) {
  return persistence.createPersistenceSession({
    organizationId: orgId,
    actorContext: actor,
    authority: "local",
    requestId,
    correlationId: requestId
  });
}

async function main() {
  global.window = { localStorage: makeStorage() };

  await assert.rejects(
    async () => context.createPersistenceContext({ organizationId: ORG_A, actorContext: actor, authority: "local", requestId: "" }),
    (error) => error.code === "PERSISTENCE_CONTEXT_MISSING"
  );

  const a = localSession(ORG_A, "todo070-a");
  const b = localSession(ORG_B, "todo070-b");
  assert.equal(a.context.organizationId, ORG_A);
  assert.equal(b.context.organizationId, ORG_B);
  assert.equal(a.context.authority, "local");
  assert.notEqual(a, b, "sessions must be operation-scoped objects");

  await Promise.all([
    a.saveOrganizationProfile(profile(ORG_A, "TA")),
    b.saveOrganizationProfile(profile(ORG_B, "TB")),
    a.saveTicketRecord(ticket(ORG_A, "TODO070-A-1")),
    b.saveTicketRecord(ticket(ORG_B, "TODO070-B-1"))
  ]);
  assert.equal((await a.loadOrganizationProfile()).id, ORG_A);
  assert.equal((await b.loadOrganizationProfile()).id, ORG_B);
  assert.deepEqual((await a.loadTicketRecords()).map((item) => item.orgId), [ORG_A]);
  assert.deepEqual((await b.loadTicketRecords()).map((item) => item.orgId), [ORG_B]);
  await assert.rejects(
    async () => { await a.saveTicketRecord(ticket(ORG_B, "TODO070-CROSS")); },
    (error) => error.code === "PERSISTENCE_CROSS_TENANT_PAYLOAD"
  );

  // Switching the UI/session reference cannot retarget an already-created A session.
  const inFlightA = localSession(ORG_A, "todo070-inflight-a");
  const switchedToB = localSession(ORG_B, "todo070-inflight-b");
  await Promise.all([
    inFlightA.saveTicketRecord(ticket(ORG_A, "TODO070-A-INFLIGHT")),
    switchedToB.saveTicketRecord(ticket(ORG_B, "TODO070-B-INFLIGHT"))
  ]);
  assert.ok((await inFlightA.loadTicketRecords()).every((item) => item.orgId === ORG_A));
  assert.ok((await switchedToB.loadTicketRecords()).every((item) => item.orgId === ORG_B));

  // Use the real server adapter/session with a transport stub only at the HTTP boundary.
  const requests = [];
  global.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method ?? "GET" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ok: true,
      status: 200,
      async json() {
        if (String(url).endsWith("/knowledge")) return { data: [] };
        if (String(url).includes("/tickets")) return { data: [] };
        return { data: profile(String(url).split("/api/organizations/")[1]?.split("/")[0] ?? ORG_A, "TS") };
      }
    };
  };
  const serverA = persistence.createPersistenceSession({ organizationId: ORG_A, actorContext: actor, authority: "server", requestId: "todo070-server-a" });
  const serverB = persistence.createPersistenceSession({ organizationId: ORG_B, actorContext: actor, authority: "server", requestId: "todo070-server-b" });
  await Promise.all([serverA.loadKnowledge(), serverB.loadKnowledge()]);
  assert.ok(requests.some((request) => request.url.includes(`/api/organizations/${ORG_A}/knowledge`)));
  assert.ok(requests.some((request) => request.url.includes(`/api/organizations/${ORG_B}/knowledge`)));
  assert.equal(serverA.context.authority, "server");
  assert.equal(serverB.context.authority, "server");
  assert.equal(a.context.authority, "local", "a server operation cannot mutate the local session authority");

  await a.deleteOrganization();
  await b.deleteOrganization();
  assert.deepEqual(await a.loadTicketRecords(), []);
  assert.deepEqual(await b.loadTicketRecords(), []);
  console.log("TODO-070 stateless persistence probe: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
