/*
 * RSS-1.2D.1 integration probe.
 *
 * Run against a built local server (`npm run start -- -p 3000`). The probe
 * authenticates as the configured development user, exercises the two runtime
 * writes that previously failed in the browser, and confirms malformed JSON is
 * still rejected by the API boundary.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: true });
const auth = require(path.join(root, "lib", "auth.ts"));
const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));

const baseUrl = process.env.RSS_PERSISTENCE_BASE_URL ?? "http://localhost:3000";
const organizationId = "profile-oip-developer-demo";

async function main() {
  const email = process.env.AUTH_DEVELOPMENT_USER_EMAIL?.trim();
  assert.ok(email, "AUTH_DEVELOPMENT_USER_EMAIL must be configured for the runtime probe.");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  assert.ok(user, `Configured development user was not found: ${email}`);
  const session = await auth.createSession(user.id);
  const headers = {
    Cookie: `${auth.AUTH_SESSION_COOKIE}=${session.token}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  try {
    const metricsResponse = await fetch(`${baseUrl}/api/organizations/${organizationId}/metrics`, { headers });
    const metricsPayload = await metricsResponse.json();
    assert.equal(metricsResponse.status, 200);
    const metricsWrite = await fetch(`${baseUrl}/api/organizations/${organizationId}/metrics`, {
      method: "PUT",
      headers,
      body: JSON.stringify(metricsPayload.data)
    });
    assert.equal(metricsWrite.status, 200, await metricsWrite.text());

    const candidatesResponse = await fetch(`${baseUrl}/api/organizations/${organizationId}/knowledge-candidates`, { headers });
    const candidatesPayload = await candidatesResponse.json();
    assert.equal(candidatesResponse.status, 200);
    const candidateBody = JSON.stringify(candidatesPayload.data);
    const candidateBytes = Buffer.byteLength(candidateBody);
    assert.ok(candidateBytes > 10 * 1024 * 1024, "Probe must cover the former 10 MB truncation boundary.");
    const candidatesWrite = await fetch(`${baseUrl}/api/organizations/${organizationId}/knowledge-candidates`, {
      method: "PUT",
      headers,
      body: candidateBody
    });
    assert.equal(candidatesWrite.status, 200, await candidatesWrite.text());

    const malformed = await fetch(`${baseUrl}/api/organizations/${organizationId}/knowledge-candidates`, {
      method: "PUT",
      headers,
      body: '{"truncated":'
    });
    const malformedPayload = await malformed.json();
    assert.equal(malformed.status, 400);
    assert.equal(malformedPayload.error?.code, "INVALID_REQUEST");

    console.log(JSON.stringify({
      verdict: "PERSISTENCE_RUNTIME_REPAIRED",
      organizationId,
      candidateCount: candidatesPayload.data.length,
      candidateBytes,
      metricsPutStatus: metricsWrite.status,
      candidatesPutStatus: candidatesWrite.status,
      malformedPutStatus: malformed.status
    }));
  } finally {
    await auth.deleteSession(session.token);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
