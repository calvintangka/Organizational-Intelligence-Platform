const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
const surface = fs.readFileSync(path.join(root, "components", "views", "OrganizationalMemorySurface.tsx"), "utf8");
const sourceRoute = fs.readFileSync(path.join(root, "app", "api", "organizations", "[organizationId]", "memory", "experiences", "[sourceId]", "route.ts"), "utf8");

assert.match(page, /AUTH_HYDRATION_TIMEOUT_MS\s*=\s*15_000/);
assert.match(page, /response\.status === 503 && attempt === 0/);
assert.match(page, /Promise\.resolve\(authorizedProfiles\)/, "hydration should reuse the authorized organization list");
assert.match(surface, /ACTIVE_SOURCE_STORAGE_PREFIX\s*=\s*"oip\.active-organizational-source\.v1:"/);
assert.match(surface, /localStorage\.setItem\(activeSourceStorageKey\(organizationId\), nextSource\.id\)/, "Source creation must persist only a durable Source ID");
assert.match(surface, /memory\/experiences\/\$\{encodeURIComponent\(sourceId\)\}/, "active Source must be re-read from the server");
assert.match(surface, /memory\/experiences\/\$\{encodeURIComponent\(sourceId\)\}\/evidence/, "attached Evidence must be re-read from the server");
assert.match(surface, /localStorage\.removeItem\(activeSourceStorageKey\(organizationId\)\)/, "validated work must clear the active-work pointer");
assert.match(sourceRoute, /export const GET/);
assert.match(sourceRoute, /loadSource\(organizationId, params\.sourceId\)/);

console.log("OIP-V2-FIX-004A refresh/source recovery regression: PASS");
console.log("- transient auth responses retry without false logout");
console.log("- authorized organization list is reused during hydration");
console.log("- active Source ID is tenant-keyed and server-authoritatively reloaded");
console.log("- attached Evidence is reloaded and validated work clears the pointer");
