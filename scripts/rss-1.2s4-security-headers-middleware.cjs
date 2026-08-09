/*
 * RSS-1.2S4 security headers & middleware probe.
 *
 * Verification-only and read-only (no database writes). Assumes a production
 * build exists (`npm run build`) and starts `next start` on a disposable port,
 * then verifies the centralized security header policy on HTML, API, static,
 * developer-diagnostics, and connector responses, verifies the production CSP
 * is nonce-based with no unprotected inline scripts, and runs the negative
 * (browser-blocking) assertions.
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const configuredBaseUrl = process.env.RSS12S4_BASE_URL || "";
let baseUrl = configuredBaseUrl || "";
let port = configuredBaseUrl ? (new URL(configuredBaseUrl).port || "80") : "";
const DEFAULT_PROBE_PORT = 3500;
const PORT_SCAN_LIMIT = 3510;
const STARTUP_TIMEOUT_MS = Number(process.env.RSS12S4_STARTUP_TIMEOUT_MS || 30000);
const READINESS_REQUEST_TIMEOUT_MS = Number(process.env.RSS12S4_READINESS_REQUEST_TIMEOUT_MS || 1000);
const matureOrganizationId = "profile-oip-developer-demo";

const countTables = {
  users: "users",
  sessions: "auth_sessions",
  tickets: "ticket_records",
  knowledgeItems: "knowledge_items",
  candidates: "knowledge_candidates",
  validations: "validation_records",
  memoryChanges: "memory_change_records",
  trustEvidence: "trust_evidence",
  governedActions: "governed_actions",
  connectorInstallations: "connector_installations",
  authorizationAudits: "authorization_decision_audits",
  durableJobs: "durable_jobs"
};

async function counts(db) {
  const result = {};
  for (const [key, table] of Object.entries(countTables)) {
    result[key] = Number((await db.query(`select count(*)::int as count from ${table}`)).rows[0].count);
  }
  return result;
}

async function matureDigest(db) {
  const rows = (await db.query(
    'select id, "trustScore", revision, content from knowledge_items where "organizationId"=$1 order by id',
    [matureOrganizationId]
  )).rows;
  return cryptoDigest(rows);
}

function cryptoDigest(value) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateRequiredEnvironment(environment = process.env) {
  const required = ["DATABASE_URL", "NEXT_PUBLIC_OIP_PERSISTENCE_MODE", "RATE_LIMIT_HASH_SECRET"];
  return required.filter((name) => !String(environment[name] ?? "").trim());
}

function canBindPort(portNumber) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(portNumber, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });
}

async function selectProbeEndpoint() {
  if (configuredBaseUrl) {
    const parsed = new URL(configuredBaseUrl);
    if (!parsed.port) throw new Error("RSS12S4_BASE_URL must include an explicit probe port");
    if (!(await canBindPort(Number(parsed.port)))) {
      throw new Error(`configured RSS12S4 port ${parsed.port} is already occupied; refusing to test an unknown server`);
    }
    baseUrl = configuredBaseUrl.replace(/\/$/, "");
    port = parsed.port;
    return;
  }
  for (let candidate = DEFAULT_PROBE_PORT; candidate <= PORT_SCAN_LIMIT; candidate += 1) {
    if (await canBindPort(candidate)) {
      port = String(candidate);
      baseUrl = `http://127.0.0.1:${port}`;
      return;
    }
  }
  throw new Error(`no dedicated probe port available in ${DEFAULT_PROBE_PORT}-${PORT_SCAN_LIMIT}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitForReady(url, child, timeoutMs = STARTUP_TIMEOUT_MS) {
  const startedAt = Date.now();
  const attempts = [];
  while (Date.now() - startedAt < timeoutMs) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`child exited before readiness (exit=${child.exitCode})`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READINESS_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${url}/api/auth/me`, { signal: controller.signal });
      attempts.push({ status: response.status, elapsedMs: Date.now() - startedAt });
      if (response.status === 200 || response.status === 401) {
        return { elapsedMs: Date.now() - startedAt, attempts };
      }
    } catch (error) {
      attempts.push({ error: error?.name === "AbortError" ? "request-timeout" : "connection-error", elapsedMs: Date.now() - startedAt });
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(1, timeoutMs - (Date.now() - startedAt)))))
  }
  const last = attempts.at(-1) ?? null;
  throw new Error(`readiness timeout after ${Date.now() - startedAt}ms; attempts=${attempts.length}; last=${JSON.stringify(last)}`);
}

async function startNextServer() {
  const missing = validateRequiredEnvironment({ ...process.env, RATE_LIMIT_HASH_SECRET: "rss12s4-probe-secret" });
  if (missing.length) throw new Error(`required production configuration missing: ${missing.join(", ")}`);
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
    cwd: process.cwd(),
    windowsHide: true,
    env: { ...process.env, RATE_LIMIT_HASH_SECRET: "rss12s4-probe-secret", RATE_LIMIT_MODE: "off" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  next.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-12000); });
  next.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-12000); });
  try {
    const readiness = await waitForReady(baseUrl, next);
    return { process: next, stdout, stderr, readiness };
  } catch (error) {
    await stopChild(next);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
}

async function runNegativeStartupControls() {
  const controls = [];
  const freePort = async (start) => {
    for (let candidate = start; candidate < start + 20; candidate += 1) {
      if (await canBindPort(candidate)) return candidate;
    }
    throw new Error("no negative-control port available");
  };

  const wrongPort = await freePort(3520);
  try {
    await waitForReady(`http://127.0.0.1:${wrongPort}`, null, 300);
    controls.push({ name: "wrong port target is detected", passed: false });
  } catch {
    controls.push({ name: "wrong port target is detected", passed: true });
  }

  const exitedChild = spawn(process.execPath, ["-e", "process.exit(17)"], { windowsHide: true, stdio: "ignore" });
  try {
    await waitForReady(`http://127.0.0.1:${wrongPort}`, exitedChild, 500);
    controls.push({ name: "child exit before readiness is detected", passed: false });
  } catch (error) {
    controls.push({ name: "child exit before readiness is detected", passed: /exited before readiness/.test(error.message) });
  } finally {
    await stopChild(exitedChild);
  }

  const missing = validateRequiredEnvironment({ DATABASE_URL: "", NEXT_PUBLIC_OIP_PERSISTENCE_MODE: "server", RATE_LIMIT_HASH_SECRET: "synthetic" });
  controls.push({ name: "missing production configuration is explicit", passed: missing.includes("DATABASE_URL") });

  const wrongServerPort = await freePort(3540);
  const wrongServer = http.createServer((request, response) => {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("wrong server");
  });
  await new Promise((resolve) => wrongServer.listen(wrongServerPort, "127.0.0.1", resolve));
  try {
    await waitForReady(`http://127.0.0.1:${wrongServerPort}`, null, 500);
    controls.push({ name: "readiness rejects the wrong server", passed: false });
  } catch {
    controls.push({ name: "readiness rejects the wrong server", passed: true });
  } finally {
    await new Promise((resolve) => wrongServer.close(resolve));
  }

  const hangingChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true, stdio: "ignore" });
  let timeoutDetected = false;
  try {
    await waitForReady(`http://127.0.0.1:${wrongPort}`, hangingChild, 300);
  } catch {
    timeoutDetected = true;
  } finally {
    await stopChild(hangingChild);
  }
  controls.push({ name: "cleanup after readiness timeout is reliable", passed: timeoutDetected && (hangingChild.exitCode !== null || hangingChild.killed === true) });
  return { passed: controls.every((control) => control.passed), controls };
}

async function get(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const headers = Object.fromEntries(response.headers.entries());
  return { status: response.status, headers, body: await response.text() };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  await selectProbeEndpoint();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const before = await counts(db);
  const matureBefore = await matureDigest(db);
  const evidence = { identity: { baseUrl, port, readinessContract: "GET /api/auth/me must return 200 or 401" } };
  let next;
  try {
    const startupStartedAt = Date.now();
    next = await startNextServer();
    evidence.startup = {
      command: `${process.execPath} node_modules/next/dist/bin/next start -p ${port}`,
      elapsedMs: Date.now() - startupStartedAt,
      readiness: next.readiness,
      stdout: next.stdout,
      stderr: next.stderr
    };
  } catch (error) {
    await db.end().catch(() => {});
    throw error;
  }
  try {
    // ------------------------------------------------------------------ HTML
    const page = await get("/");
    evidence.page = {
      status: page.status,
      csp: page.headers["content-security-policy"],
      hsts: page.headers["strict-transport-security"],
      xfo: page.headers["x-frame-options"],
      nosniff: page.headers["x-content-type-options"],
      referrer: page.headers["referrer-policy"],
      permissions: page.headers["permissions-policy"],
      coop: page.headers["cross-origin-opener-policy"],
      corp: page.headers["cross-origin-resource-policy"]
    };
    check("HTML returns 200", page.status === 200);
    check("HTML includes Content-Security-Policy", typeof page.headers["content-security-policy"] === "string");
    check("HTML includes Strict-Transport-Security (production)", page.headers["strict-transport-security"] === "max-age=31536000; includeSubDomains");
    check("HTML includes X-Frame-Options DENY", page.headers["x-frame-options"] === "DENY");
    check("HTML includes X-Content-Type-Options nosniff", page.headers["x-content-type-options"] === "nosniff");
    check("HTML includes Referrer-Policy", page.headers["referrer-policy"] === "strict-origin-when-cross-origin");
    check("HTML includes Permissions-Policy", typeof page.headers["permissions-policy"] === "string");
    check("HTML includes Cross-Origin-Opener-Policy", page.headers["cross-origin-opener-policy"] === "same-origin");
    check("HTML includes Cross-Origin-Resource-Policy", page.headers["cross-origin-resource-policy"] === "same-origin");

    const csp = page.headers["content-security-policy"] ?? "";
    check("CSP defines default-src 'self'", /default-src 'self'/.test(csp));
    check("CSP script-src is nonce-based without unsafe-inline", /script-src 'self' 'nonce-[A-Za-z0-9+/_-]+'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp));
    check("CSP frame-ancestors blocks embedding", /frame-ancestors 'none'/.test(csp));
    check("CSP object-src 'none'", /object-src 'none'/.test(csp));
    check("CSP base-uri 'self'", /base-uri 'self'/.test(csp));
    check("CSP form-action 'self'", /form-action 'self'/.test(csp));

    const inlineScripts = page.body.match(/<script(?![^>]*src=)[^>]*>/g) ?? [];
    const inlineScriptsWithNonce = inlineScripts.filter((tag) => /nonce="/.test(tag)).length;
    const inlineScriptsWithoutNonce = inlineScripts.length - inlineScriptsWithNonce;
    evidence.inlineScripts = { total: inlineScripts.length, withNonce: inlineScriptsWithNonce, withoutNonce: inlineScriptsWithoutNonce };
    check("every inline script carries the CSP nonce", inlineScriptsWithoutNonce === 0, `without nonce=${inlineScriptsWithoutNonce}`);

    const cspNonceMatch = csp.match(/nonce-([A-Za-z0-9+/_-]+)/);
    const scriptNonces = new Set([...(page.body.match(/nonce="([^"]+)"/g) ?? [])].map((m) => m.slice(7, -1)));
    evidence.nonceConsistency = { cspNonce: cspNonceMatch?.[1], scriptNonces: [...scriptNonces] };
    check("script nonces match the CSP nonce", cspNonceMatch !== null && scriptNonces.size === 1 && scriptNonces.has(cspNonceMatch[1]));

    // ---------------------------------------------------------------- API
    const api = await get("/api/auth/me");
    evidence.api = { status: api.status, cache: api.headers["cache-control"], hasCsp: typeof api.headers["content-security-policy"] === "string", hasCors: typeof api.headers["access-control-allow-origin"] === "string" };
    check("API returns a consistent status", api.status === 401 || api.status === 200);
    check("API Cache-Control is no-store", api.headers["cache-control"] === "no-store");
    check("API includes security headers", typeof api.headers["content-security-policy"] === "string" && api.headers["x-content-type-options"] === "nosniff" && api.headers["x-frame-options"] === "DENY");
    check("API exposes no Access-Control-Allow-Origin", api.headers["access-control-allow-origin"] === undefined, "no unnecessary cross-origin exposure");

    // ---------------------------------------------------- developer routes
    const diagnostics = await get("/api/developer/ai/providers");
    evidence.developerDiagnostics = { status: diagnostics.status, noStore: diagnostics.headers["cache-control"] === "no-store" };
    check("developer diagnostics route is reachable", diagnostics.status === 401 || diagnostics.status === 200);
    check("developer diagnostics response is not cached", diagnostics.headers["cache-control"] === "no-store");

    // -------------------------------------------------------- static assets
    const scriptSrc = page.body.match(/src="(\/_next\/static\/[^"]+\.js)"/)?.[1];
    assert(scriptSrc, "the HTML must reference a compiled script for the static-asset check");
    const asset = await get(scriptSrc);
    evidence.staticAsset = { path: scriptSrc, status: asset.status, hasCsp: typeof asset.headers["content-security-policy"] === "string" };
    check("static asset is served", asset.status === 200);
    check("middleware does not add CSP to static assets", asset.headers["content-security-policy"] === undefined, "static assets keep their CDN/cache behavior");

    // ---------------------------------------------------- connector webhook
    const webhook = await fetch(`${baseUrl}/api/connectors/webhook/nonexistent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const webhookHeaders = Object.fromEntries(webhook.headers.entries());
    evidence.webhook = { status: webhook.status, hasHeaders: typeof webhookHeaders["content-security-policy"] === "string" };
    check("connector webhook path is processed by middleware", webhook.status === 404 || webhook.status === 400 || webhook.status === 403 || webhook.status === 202, `status=${webhook.status}`);
    check("connector webhook response carries security headers", typeof webhookHeaders["content-security-policy"] === "string");

    // --------------------------------------------------------- NEGATIVE TESTS
    // iframe embedding: XFO DENY + frame-ancestors 'none'.
    check("NEG: application cannot be framed (XFO + frame-ancestors)", page.headers["x-frame-options"] === "DENY" && /frame-ancestors 'none'/.test(csp));
    // inline script injection: no unprotected inline scripts exist.
    check("NEG: no inline script can execute without the per-request nonce", inlineScriptsWithoutNonce === 0 && /'nonce-/.test(csp));
    // external object embedding blocked.
    check("NEG: object/embed/applet embedding blocked", /object-src 'none'/.test(csp));
    // MIME sniffing disabled.
    check("NEG: MIME sniffing disabled", page.headers["x-content-type-options"] === "nosniff");
    // Feature abuse blocked.
    check("NEG: camera/microphone/geolocation denied", /camera=\(\)/.test(page.headers["permissions-policy"] ?? "") && /microphone=\(\)/.test(page.headers["permissions-policy"] ?? "") && /geolocation=\(\)/.test(page.headers["permissions-policy"] ?? ""));
    // No unnecessary cross-origin access.
    check("NEG: no cross-origin CORS exposure on HTML", page.headers["access-control-allow-origin"] === undefined);
    // Referrer leakage limited.
    check("NEG: referrer policy limits leakage", page.headers["referrer-policy"] === "strict-origin-when-cross-origin");

    evidence.negative = { framed: false, inlineScriptExecutable: false, objectEmbeddable: false, mimeSniffing: true, featureAbuse: false, crossOrigin: false, referrerLeak: false };

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await stopChild(next.process);
    const after = await counts(db);
    const matureAfter = await matureDigest(db);
    evidence.dataSafety = {
      globalCountsRestored: JSON.stringify(before) === JSON.stringify(after),
      matureDigestRestored: matureBefore === matureAfter
    };
    await db.end();
  }
  assert.equal(evidence.dataSafety.globalCountsRestored, true, "the probe must not mutate the database");
  assert.equal(evidence.dataSafety.matureDigestRestored, true, "mature organizational memory must be unchanged");
  evidence.negativeStartupControls = await runNegativeStartupControls();
  console.log(JSON.stringify({ negativeStartupControls: evidence.negativeStartupControls }, null, 2));
  assert.equal(evidence.negativeStartupControls.passed, true, "negative startup controls must pass");
  console.log(JSON.stringify({ startup: evidence.startup, dataSafety: evidence.dataSafety, negativeStartupControls: evidence.negativeStartupControls }, null, 2));
  console.log(JSON.stringify(evidence.dataSafety));
  console.info("RSS-1.2S4 security headers & middleware probe passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
