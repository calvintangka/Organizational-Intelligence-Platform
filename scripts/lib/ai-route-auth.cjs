/*
 * Shared in-process AI route authentication stub (RSS-1.2S1).
 *
 * The AI proxy routes now require a fully authorized actor before they touch
 * provider configuration or the network. Probes that exercise the route
 * handlers directly (todo082a, todo038, rss-1.2a) must therefore present a
 * valid session. Rather than creating disposable database fixtures for every
 * unit-level probe, this helper swaps the three seams the AI authorization
 * boundary depends on — `requireAuthenticatedUser`, `resolveActiveOrganizationId`,
 * and `requireCapability` — for deterministic in-memory stand-ins.
 *
 * The boundary (`lib/server/aiAuthorization.ts`) resolves these helpers from
 * `lib/server/authorization.ts` at call time and the probe harness dedupes
 * module loading by absolute path, so replacing the exported functions here
 * affects the routes under test without any production code changes.
 *
 * Usage:
 *   const { installAIRouteAuthStub } = require("./lib/ai-route-auth.cjs");
 *   const restore = installAIRouteAuthStub({ role: "support_agent" });
 *   try { ... route.POST(new Request(...)) ... } finally { restore(); }
 */
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");

function installAIRouteAuthStub(options = {}) {
  const {
    role = "support_agent",
    organizationId = "probe-ai-org",
    user = { id: "probe-ai-user", name: "Probe AI User", email: "probe-ai@example.test" }
  } = options;

  const authorizationModule = require(path.join(root, "lib", "server", "authorization.ts"));

  const originals = {
    requireAuthenticatedUser: authorizationModule.requireAuthenticatedUser,
    resolveActiveOrganizationId: authorizationModule.resolveActiveOrganizationId,
    requireCapability: authorizationModule.requireCapability
  };

  authorizationModule.requireAuthenticatedUser = async () => user;
  authorizationModule.resolveActiveOrganizationId = async () => organizationId;
  authorizationModule.requireCapability = async (_organizationId, capability) => ({
    user,
    role,
    capability
  });

  return function restoreAIRouteAuthStub() {
    authorizationModule.requireAuthenticatedUser = originals.requireAuthenticatedUser;
    authorizationModule.resolveActiveOrganizationId = originals.resolveActiveOrganizationId;
    authorizationModule.requireCapability = originals.requireCapability;
  };
}

module.exports = { installAIRouteAuthStub };
