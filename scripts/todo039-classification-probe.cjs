/*
 * TODO-039 — Natural-language classification generalization probe.
 *
 * Read-only. Verifies that naturally worded SSO/Authentication problems classify
 * as Authentication (generalizing beyond the TODO-037 fixtures) and that clean
 * negative/competing-category cases do NOT become Authentication and never
 * authorize the mature SSO hero. Uses the same pure production boundaries as
 * app/page.tsx; writes nothing.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(1); }

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));

const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

// 10 UNSEEN SSO/Authentication paraphrases (not in TODO-037). Varied wording.
const UNSEEN_SSO = [
  { id: "U01", subject: "Thrown back to login after the signing certificate swap", description: "Our staff sign in through the company single sign-on, but after the security team swapped the token-signing certificate, everyone is returned to the login screen." },
  { id: "U02", subject: "App keeps asking to authenticate after metadata refresh", description: "Employees authenticate with our corporate tenant, yet the product keeps redirecting them to authenticate again after the recent SAML metadata refresh." },
  { id: "U03", subject: "Endless loop between portal and the IdP", description: "Ever since we renewed the certificate our identity provider uses to sign responses, users loop endlessly between the portal and the IdP." },
  { id: "U04", subject: "Cannot reach dashboard after federated sign-in", description: "Workforce members complete the corporate login but never reach the dashboard; the browser just cycles back to the federated sign-in page." },
  { id: "U05", subject: "SSO stopped completing after signing key rotation", description: "After rotating the SAML signing key, our single sign-on stopped completing and staff are bounced back to re-enter credentials." },
  { id: "U06", subject: "Infinite handoff since the trust certificate was replaced", description: "The corporate identity platform accepts the user, then our product asks them to sign in again — an infinite handoff since the trust certificate was replaced." },
  { id: "U07", subject: "Federated authentication returns users to sign-on", description: "Federated authentication is broken: people verify at the enterprise identity system and are immediately returned to our sign-on page." },
  { id: "U08", subject: "Every SSO attempt ends in a redirect loop", description: "We updated the identity provider signing credential and now every SSO attempt ends in a redirect loop instead of an established session." },
  { id: "U09", subject: "SAML users cannot establish a session after metadata republish", description: "Since the identity metadata was re-published, SAML users cannot establish a session and keep landing back on the login prompt." },
  { id: "U10", subject: "External authentication never signs the user in", description: "Our external authentication provider validates the account, but the workspace never signs the user in and sends them around the federation loop again." }
];

// Clean negatives / competing categories — must NOT classify as Authentication
// and must not authorize the SSO hero. No SSO vocabulary is used.
const NEGATIVES = [
  { id: "N01", label: "password-reset", subject: "Forgot my password", description: "I forgot my password and the reset email never arrives." },
  { id: "N02", label: "login-typo", subject: "Login keeps failing", description: "My login keeps failing because I keep mistyping my username." },
  { id: "N03", label: "marketing-redirect", subject: "Page redirects to old URL", description: "A marketing landing page redirects visitors to an outdated promotional URL." },
  { id: "N04", label: "tls-api-cert", subject: "Expired TLS certificate on API", description: "The TLS certificate on our public API endpoint expired and clients get connection errors." },
  { id: "N05", label: "email-cert", subject: "Untrusted email server certificate", description: "Our outbound email server certificate is untrusted and messages bounce back." },
  { id: "N06", label: "permission-inheritance", subject: "Fix folder permission inheritance", description: "A manager needs permission inheritance fixed so their team inherits the shared folder role." },
  { id: "N07", label: "role-approval", subject: "Approve editor role", description: "Please approve the access request and assign the editor role to this user." },
  { id: "N08", label: "delivery-delay", subject: "Package delivery is late", description: "My package delivery is three days late and the tracking has not updated." },
  { id: "N09", label: "webhook-delivery", subject: "Webhook deliveries failing", description: "Our outbound webhook deliveries keep failing with a 500 error from the receiver." },
  { id: "N10", label: "generic-no-access", subject: "Users cannot access the system", description: "Several users say they cannot access the system this morning." }
];

function ticket(def) {
  return { id: def.id, ticketId: def.id, customerName: "TODO-039", subject: def.subject, description: def.description, category: "General", status: "new", createdAt: "2026-07-22T00:00:00.000Z" };
}

function authorizesHero(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const raw = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, raw, items, canonical.title);
  const compatible = matches.filter((m) => isCompatibleForDrafting(understanding, m.item, input));
  const selected = compatible.length ? selectPreferredMatch(input, compatible) : null;
  const draft = draftResponse(input, understanding, selected?.match ?? null, profile, false);
  return draft.basedOnKnowledgeIds.includes(HERO);
}

async function snapshot(id) {
  const where = { organizationId: id };
  const [org, k, t, e] = await Promise.all([
    prisma.organization.findUnique({ where: { id } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.count({ where }),
    prisma.trustEvidence.count({ where })
  ]);
  return crypto.createHash("sha256").update(JSON.stringify({ org, k, t, e })).digest("hex");
}
async function snapshots() { return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)]))); }

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  if (profile.id !== DEMO || items.length !== 45) throw new Error(`Expected mature demo; got ${profile.id}/${items.length}.`);

  const unseen = UNSEEN_SSO.map((def) => {
    const u = understandForProfile(ticket(def), profile);
    return { id: def.id, category: u.category, isAuth: u.category === "Authentication", signals: u.detectedSignals };
  });
  const unseenAuth = unseen.filter((r) => r.isAuth).length;
  console.log("=== Part E — 10 unseen SSO paraphrases ===");
  for (const r of unseen) console.log(`${r.isAuth ? "OK " : "XX "}${r.id} => ${r.category} [${r.signals.join(", ")}]`);
  console.log(`UNSEEN Authentication classification: ${unseenAuth}/10`);

  const negatives = NEGATIVES.map((def) => {
    const u = understandForProfile(ticket(def), profile);
    const authorized = authorizesHero(ticket(def), profile, items);
    return { id: def.id, label: def.label, category: u.category, isAuth: u.category === "Authentication", authorized };
  });
  const negAuth = negatives.filter((r) => r.isAuth).length;
  const negAuthorized = negatives.filter((r) => r.authorized).length;
  console.log("\n=== Part F — clean negative / competing controls ===");
  for (const r of negatives) console.log(`${!r.isAuth && !r.authorized ? "OK " : "XX "}${r.id} (${r.label}) => ${r.category} authorizedHero=${r.authorized}`);
  console.log(`NEGATIVES classified Authentication: ${negAuth}/10 · authorized hero: ${negAuthorized}/10`);

  const after = await snapshots();
  const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after);

  // Assertions: strong generalization on unseen SSO; zero authorization leakage.
  assert(unseenAuth >= 9, `Expected >=9/10 unseen SSO paraphrases to classify as Authentication, got ${unseenAuth}.`);
  assert.equal(negAuth, 0, `Clean negatives must not classify as Authentication (got ${negAuth}).`);
  assert.equal(negAuthorized, 0, `No negative may authorize the SSO hero (got ${negAuthorized}).`);
  assert(protectedUnchanged, "Protected organizations must be unchanged.");

  console.log(JSON.stringify({
    verdict: "PASS",
    unseenAuthClassification: `${unseenAuth}/10`,
    negativesAsAuthentication: `${negAuth}/10`,
    negativesAuthorizedHero: `${negAuthorized}/10`,
    protectedUnchanged
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
