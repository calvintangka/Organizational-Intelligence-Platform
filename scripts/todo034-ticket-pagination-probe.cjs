/* TODO-034 read-only server ticket pagination/search probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-034 verifies persisted tickets read-only.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const ticketUtilities = require(path.join(root, "lib", "ticketRecords.ts"));

const DEMO = "profile-oip-developer-demo";
const MAESA = "profile-maesa-tech";
const PROTECTED = [DEMO, MAESA, "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];
const PAGE_SIZE = 20;

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function snapshot(organizationId) {
  const where = { organizationId };
  return digest(await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
    prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
    prisma.orgMetrics.findUnique({ where: { organizationId } }),
    prisma.ticketSequence.findUnique({ where: { organizationId } })
  ]));
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)])));
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

async function timed(read) {
  const started = performance.now();
  const value = await read();
  return { value, elapsedMs: performance.now() - started, payloadBytes: bytes(value) };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function isNewestFirst(tickets) {
  return tickets.every((ticket, index) => {
    if (index === 0) return true;
    const prior = tickets[index - 1];
    return prior.createdAt > ticket.createdAt
      || (prior.createdAt === ticket.createdAt && prior.ticketId >= ticket.ticketId);
  });
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

async function main() {
  const before = await snapshots();
  const coreHydration = await timed(() => Promise.all([
    persistence.listOrganizationProfiles(),
    persistence.loadKnowledge(DEMO),
    persistence.loadKnowledgeCandidates(DEMO),
    persistence.loadOrgMetrics(DEMO),
    persistence.loadIntelligenceLog(DEMO),
    persistence.loadEmergingPatterns(DEMO)
  ]));
  const fullTickets = await timed(() => persistence.loadTicketRecords(DEMO));

  const first = await timed(() => persistence.loadTicketPage(DEMO, {
    page: 1, pageSize: PAGE_SIZE, search: "", filter: "all"
  }));
  check("CASE A first page has expected size and total", first.value.tickets.length === PAGE_SIZE && first.value.total === 5000);
  check("CASE A first page is organization scoped", first.value.tickets.every((ticket) => ticket.orgId === DEMO));
  for (const filter of ["heavily_edited", "cold_start", "uncategorized", "rejected", "discarded"]) {
    const serverFiltered = await persistence.loadTicketPage(DEMO, { page: 1, pageSize: PAGE_SIZE, filter });
    const expectedTotal = ticketUtilities.filterTicketRecords(fullTickets.value, filter).length;
    check(`existing ${filter} filter retains client semantics`, serverFiltered.total === expectedTotal);
  }

  const second = await persistence.loadTicketPage(DEMO, { page: 2, pageSize: PAGE_SIZE, filter: "all" });
  const firstIds = new Set(first.value.tickets.map((ticket) => ticket.ticketId));
  check("CASE B second page has no page-one duplicates", second.tickets.length === PAGE_SIZE && second.tickets.every((ticket) => !firstIds.has(ticket.ticketId)));

  const last = await persistence.loadTicketPage(DEMO, {
    page: first.value.totalPages, pageSize: PAGE_SIZE, filter: "all"
  });
  const expectedLast = first.value.total % PAGE_SIZE || PAGE_SIZE;
  check("CASE C last page has correct remaining count", last.tickets.length === expectedLast);

  const repeat = await persistence.loadTicketPage(DEMO, { page: 1, pageSize: PAGE_SIZE, filter: "all" });
  check("CASE D ordering is stable and newest first", isNewestFirst(first.value.tickets)
    && JSON.stringify(repeat.tickets.map((ticket) => ticket.ticketId)) === JSON.stringify(first.value.tickets.map((ticket) => ticket.ticketId)));

  const target = first.value.tickets[0];
  const idSearch = await persistence.loadTicketPage(DEMO, {
    page: 1, pageSize: PAGE_SIZE, search: target.ticketId.toLowerCase(), filter: "all"
  });
  check("CASE E ticket ID search is case-insensitive", idSearch.tickets.some((ticket) => ticket.ticketId === target.ticketId));

  const searchableText = (target.subject || target.rawMessage).trim().slice(0, 80);
  const textSearch = await timed(() => persistence.loadTicketPage(DEMO, {
    page: 1, pageSize: PAGE_SIZE, search: searchableText.toUpperCase(), filter: "all"
  }));
  check("CASE F subject/body/customer text search finds the scoped ticket", textSearch.value.tickets.some((ticket) => ticket.ticketId === target.ticketId));

  const none = await persistence.loadTicketPage(DEMO, {
    page: 1, pageSize: PAGE_SIZE, search: "todo034-no-result-7d31e561", filter: "all"
  });
  check("CASE G no-result search is empty", none.total === 0 && none.tickets.length === 0 && none.totalPages === 0);

  await assert.rejects(() => persistence.loadTicketPage(DEMO, { page: 0, pageSize: PAGE_SIZE, filter: "all" }), (error) => error?.status === 400);
  await assert.rejects(() => persistence.loadTicketPage(DEMO, { page: 1, pageSize: 101, filter: "all" }), (error) => error?.status === 400);
  check("CASE H invalid page and page size fail safely", true);

  const isolated = await persistence.loadTicketPage(MAESA, {
    page: 1, pageSize: PAGE_SIZE, search: target.ticketId, filter: "all"
  });
  check("CASE I cross-organization search cannot retrieve the Demo ticket", isolated.total === 0 && isolated.tickets.length === 0);

  const [demoSwitchPage, maesaSwitchPage] = await Promise.all([
    persistence.loadTicketPage(DEMO, { page: 1, pageSize: 5, filter: "all" }),
    persistence.loadTicketPage(MAESA, { page: 1, pageSize: 5, filter: "all" })
  ]);
  check("CASE J organization-switch reads cannot leak stale pages", demoSwitchPage.tickets.every((ticket) => ticket.orgId === DEMO)
    && maesaSwitchPage.tickets.every((ticket) => ticket.orgId === MAESA));

  global.window = { localStorage: memoryStorage() };
  const localTickets = ticketUtilities;
  const localOrg = "todo034-local-probe";
  const localRows = Array.from({ length: 23 }, (_, index) => ({
    ...localTickets.createTicketRecord(`LOCAL-${String(index + 1).padStart(4, "0")}`, localOrg, `Customer Alpha local issue ${index + 1}`, `Local subject ${index + 1}`),
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
  }));
  await localTickets.saveTicketRecords(localOrg, localRows);
  const localPage = await localTickets.loadTicketPage(localOrg, { page: 2, pageSize: 10, search: "CUSTOMER ALPHA", filter: "all" });
  check("CASE K local mode uses compatible pagination and search", localPage.total === 23 && localPage.tickets.length === 10 && isNewestFirst(localPage.tickets));
  await assert.rejects(() => localTickets.loadTicketPage(localOrg, { page: 0, pageSize: 10, filter: "all" }));
  check("CASE K local mode shares bounded input validation", true);
  delete global.window;

  const metricsBefore = await persistence.loadOrgMetrics(DEMO);
  await persistence.loadTicketPage(DEMO, { page: 1, pageSize: PAGE_SIZE, filter: "all" });
  const metricsAfter = await persistence.loadOrgMetrics(DEMO);
  check("CASE L dashboard metrics remain authoritative and unchanged", JSON.stringify(metricsAfter) === JSON.stringify(metricsBefore));

  const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const caseSource = fs.readFileSync(path.join(root, "components", "views", "CaseLookupView.tsx"), "utf8");
  const routeSource = fs.readFileSync(path.join(root, "app", "api", "organizations", "[organizationId]", "tickets", "route.ts"), "utf8");
  check("initial hydration and organization switching omit full ticket reads", !pageSource.includes("persistence.loadTicketRecords(orgId)"));
  check("Cases uses page reads and stale-request cancellation", caseSource.includes("loadTicketPage") && caseSource.includes("cancelled = true") && !caseSource.includes("searchTicketRecords"));
  check("ticket route is membership protected and page-size bounded", routeSource.includes("withOrganizationRoute") && routeSource.includes("pageSize"));

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-034 must not modify protected organizations.");
  console.log(JSON.stringify({
    beforeInitialHydrationBytes: coreHydration.payloadBytes + fullTickets.payloadBytes,
    afterInitialHydrationBytes: coreHydration.payloadBytes,
    removedTicketPayloadBytes: fullTickets.payloadBytes,
    fullTicketReadMs: Number(fullTickets.elapsedMs.toFixed(1)),
    pageSize: PAGE_SIZE,
    firstPagePayloadBytes: first.payloadBytes,
    firstPageReadMs: Number(first.elapsedMs.toFixed(1)),
    searchPayloadBytes: textSearch.payloadBytes,
    searchReadMs: Number(textSearch.elapsedMs.toFixed(1)),
    dataSafety: "protected snapshots unchanged"
  }, null, 2));
  console.log("TODO-034 ticket pagination/search probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
