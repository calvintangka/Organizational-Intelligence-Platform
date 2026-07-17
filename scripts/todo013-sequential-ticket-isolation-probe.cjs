/* Focused TODO-013 probe: deterministic ticket state plus late-response guard. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  if (request === "server-only") return path.join(__dirname, "stubs", "server-only.cjs");
  if (request.startsWith("@/")) {
    const mapped = path.join(root, request.slice(2));
    if (fs.existsSync(`${mapped}.ts`)) return `${mapped}.ts`;
    if (fs.existsSync(`${mapped}.tsx`)) return `${mapped}.tsx`;
    if (fs.existsSync(path.join(mapped, "index.ts"))) return path.join(mapped, "index.ts");
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = function transpileTypeScript(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename
    });
    module._compile(output.outputText, filename);
  };
}

const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse } = require(path.join(root, "lib", "drafting.ts"));
const { generateReflection } = require(path.join(root, "lib", "reflection.ts"));
const { TicketRequestGuard } = require(path.join(root, "lib", "ticketRequestGuard.ts"));

const maesa = seedOrganizationProfiles.find((profile) => profile.id === "profile-maesa-tech");
const fastDrop = seedOrganizationProfiles.find((profile) => profile.id === "profile-fastdrop-logistics");
assert.ok(maesa && fastDrop, "checked-in mature profiles must exist for read-only logic fixtures");

function ticket(id, customerName, subject, description) {
  return { id, ticketId: id, customerName, subject, description, category: "", status: "new", createdAt: "2026-07-17T00:00:00.000Z" };
}

function knowledge(id, title, category, tags, lessonText) {
  return {
    id,
    title,
    canonicalProblemId: id,
    canonicalProblemTitle: title,
    problem: lessonText,
    problemSummary: lessonText,
    approvedAnswer: lessonText,
    internalGuidance: lessonText,
    customerResponseTemplate: `Hello {{customerName}}, ${lessonText}`,
    category,
    tags,
    sourceTicketId: `${id}-source`,
    timesReused: 2,
    timesSeen: 4,
    trustScore: 90,
    lessons: [{
      id: `${id}-lesson`,
      title: `${title} lesson`,
      rootCause: lessonText,
      solution: lessonText,
      signals: tags,
      customerResponse: `Hello {{customerName}}, ${lessonText}`,
      doNotPromise: []
    }],
    knowledgeVersions: [],
    learningHistory: []
  };
}

const memory = [
  knowledge("login-memory", "Login Issue", "Login", ["password", "login"], "Reset the password and verify the account login."),
  knowledge("billing-memory", "Billing Question", "Billing", ["invoice", "billing"], "Review the invoice and update the billing email."),
  knowledge("refund-memory", "Refund Request", "Billing", ["refund", "charge"], "Review the charge and process the approved refund."),
  knowledge("activation-memory", "Activation Failure", "Activation", ["activation", "license"], "Verify the license key and complete activation.")
];

function run(ticketInput, profile, items = memory) {
  const understanding = understandForProfile(ticketInput, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const matches = retrieveMemory(understanding, items);
  const top = matches[0] ?? null;
  const draft = draftResponse(ticketInput, understanding, top, profile, items.length === 0);
  const reflection = generateReflection(
    understanding,
    draft.draftResponse,
    top ? { item: top.item, similarity: top.matchScore, reason: top.matchReason } : null
  );
  return { understanding, canonical, matches, top, draft, reflection };
}

function assertFresh(result, currentTicket, priorTickets) {
  assert.equal(result.understanding.ticketId, currentTicket.ticketId);
  if (result.draft.source !== "no_template") {
    assert.ok(result.draft.draftResponse.includes(currentTicket.ticketId), `${currentTicket.ticketId} must be in its own draft`);
  }
  for (const prior of priorTickets) {
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(prior.customerName), false, `${currentTicket.ticketId} leaked customer ${prior.customerName}`);
    assert.equal(serialized.includes(prior.ticketId), false, `${currentTicket.ticketId} leaked ticket ${prior.ticketId}`);
  }
}

// Sequence 1: different customer and different problem.
const a1 = ticket("TODO013-A1", "Grace", "Cannot log in", "Grace cannot log in after forgetting her password.");
const b1 = ticket("TODO013-B1", "Derek", "Billing email change", "Derek needs the invoice sent to a different billing email.");
const resultA1 = run(a1, maesa);
const resultB1 = run(b1, maesa);
assertFresh(resultB1, b1, [a1]);
assert.notEqual(resultA1.understanding.category, resultB1.understanding.category);
assert.notEqual(resultA1.canonical.title, resultB1.canonical.title);

// Sequence 2: refund -> login -> activation, each with independent outputs.
const sequence2 = [
  ticket("TODO013-A2", "Ari", "Refund request", "Ari wants a refund for a duplicate charge."),
  ticket("TODO013-B2", "Bea", "Password login", "Bea cannot log in after a password reset."),
  ticket("TODO013-C2", "Chen", "Activation failure", "Chen's license key activation fails after installation.")
].map((item) => ({ item, result: run(item, maesa) }));
assert.deepEqual(sequence2.map(({ result }) => result.understanding.category), ["Billing", "Login", "Activation"]);
for (let index = 0; index < sequence2.length; index += 1) {
  assertFresh(sequence2[index].result, sequence2[index].item, sequence2.slice(0, index).map(({ item }) => item));
}

// Sequence 3: same customer, different issue; identity may repeat but work does not.
const a3 = ticket("TODO013-A3", "Grace", "Login", "Grace cannot log in after forgetting her password.");
const b3 = ticket("TODO013-B3", "Grace", "Refund", "Hi, this is Grace. I request a refund for an unrecognized charge.");
const resultA3 = run(a3, maesa);
const resultB3 = run(b3, maesa);
assert.equal(resultB3.understanding.extractedFields.senderName, "Grace");
assert.notEqual(resultA3.understanding.category, resultB3.understanding.category);
assertFresh(resultB3, b3, [{ ...a3, customerName: "Prior Ticket Customer" }]);

// Sequence 4: switching profile/resource scope changes the complete transient context.
const maesaRun = run(ticket("TODO013-M", "Maesa User", "Login", "A Maesa user cannot log in after a password reset."), maesa, [memory[0]]);
const fastDropItem = knowledge("delivery-memory", "Delivery Delay", "Delivery Delay", ["delivery", "tracking"], "Check the courier scan and confirm the delivery window.");
const fastDropRun = run(ticket("TODO013-F", "FastDrop User", "Tracking delay", "A FastDrop package tracking update is delayed."), fastDrop, [fastDropItem]);
const maesaReturn = run(ticket("TODO013-M2", "Maesa User", "Billing", "A Maesa invoice needs a billing email change."), maesa, [memory[1]]);
assert.equal(maesaRun.understanding.category, "Login");
assert.equal(fastDropRun.understanding.category, "Package Tracking");
assert.equal(maesaReturn.understanding.category, "Billing");
assert.equal(fastDropRun.draft.draftResponse.includes("Maesa"), false);
assert.equal(maesaReturn.draft.draftResponse.includes("FastDrop"), false);

// Async race: the same guard used by page.tsx invalidates Ticket A before its
// delayed result can apply after Ticket B becomes current.
async function raceCheck() {
  const guard = new TicketRequestGuard();
  const ticketARequest = guard.begin();
  let visibleState = "Ticket B";
  const lateA = new Promise((resolve) => setTimeout(() => resolve(ticketARequest), 5));
  const ticketBRequest = guard.begin();
  assert.equal(guard.isCurrent(ticketBRequest), true);
  const lateGeneration = await lateA;
  if (guard.isCurrent(lateGeneration)) visibleState = "Ticket A";
  assert.equal(visibleState, "Ticket B", "late Ticket A result must not overwrite Ticket B state");
  guard.cancel();
  assert.equal(guard.isCurrent(ticketBRequest), false);
}

raceCheck().then(() => {
  console.log("TODO-013 sequential-ticket isolation probe passed: four deterministic sequences and stale-response guard.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
