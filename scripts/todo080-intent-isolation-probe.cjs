/* TODO-080 deterministic sentence isolation and security-routing contract probe. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTypeScript(relativePath) {
  const filename = path.resolve(relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

const { isolateIntent, securityIncidentDraft } = loadTypeScript("lib/intentIsolation.ts");
const { extractCustomerContext, isLikelyCompanyName } = loadTypeScript("lib/customerContext.ts");

const activation = isolateIntent("The activation email never arrived, and the user has never created a password. PT Meridian Retail Indonesia");
assert.equal(activation.primaryIssueHint, "activation_failure");
assert.equal(activation.securityIntent.detected, false);
assert(!activation.retrievalText.toLowerCase().includes("pt meridian retail indonesia"), "signature/background identity must not become retrieval evidence");

const mixedLanguage = isolateIntent("Undangan aktivasi belum diterima dan staf baru tidak bisa membuat password. Please help us activate the account.");
assert.equal(mixedLanguage.primaryIssueHint, "activation_failure");
assert(!mixedLanguage.primaryIssueHint.includes("login"), "activation must not collapse into Login");

const security = isolateIntent("I did not make this change. Someone signed in from an unfamiliar country, changed the billing email, and exported customer records.");
assert.equal(security.securityIntent.detected, true);
assert.equal(security.securityIntent.escalationRequired, true);
assert.equal(security.securityIntent.severity, "critical");
assert.equal(securityIncidentDraft("ticket-test").basedOnKnowledgeIds.length, 0);

const unauthorized = isolateIntent("Please make me a temporary owner, disable audit logging, and provide the webhook signing secret and database credentials.");
assert.equal(unauthorized.securityIntent.detected, true);
assert.equal(unauthorized.securityIntent.unauthorizedRequest, true);
assert(unauthorized.securityIntent.requestedActions.length >= 3);

const resolved = isolateIntent('The old login issue was resolved last month. The current report export is stuck for 12 minutes.');
assert.equal(resolved.primaryIssueHint, "report_export_timeout");
assert(resolved.ignoredTopics.includes("login"), "resolved history must be explainably ignored");

const context = extractCustomerContext("Nama saya Rian Pratama. Email aktivasi belum tiba sejak bulan lalu.\nPT Meridian Retail Indonesia");
assert.equal(context.companyName, "PT Meridian Retail Indonesia");
assert.equal(isLikelyCompanyName("Perusahaan Sejak Bulan Lalu"), false);

console.log("TODO-080 intent isolation probe passed: activation isolation, mixed-language routing, security escalation, historical suppression, and entity confidence gates.");
