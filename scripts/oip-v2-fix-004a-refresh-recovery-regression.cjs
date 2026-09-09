const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
const surface = fs.readFileSync(path.join(root, "components", "views", "OrganizationalMemorySurface.tsx"), "utf8");
const sourceRoute = fs.readFileSync(path.join(root, "app", "api", "organizations", "[organizationId]", "memory", "experiences", "[sourceId]", "route.ts"), "utf8");

assert.match(page, /AUTH_HYDRATION_TIMEOUT_MS\s*=\s*15_000/);
assert.match(page, /for \(let attempt = 0; attempt < 2 && !cancelled; attempt \+= 1\)/, "auth hydration must remain bounded");
assert.match(page, /response\.status === 503 && attempt === 0/);
assert.match(page, /response\.status === 401[\s\S]{0,160}setAuthStatus\("unauthenticated"\)/, "401 must remain unauthenticated behavior");
assert.match(page, /Promise\.resolve\(authorizedProfiles\)/, "hydration should reuse the authorized organization list");
assert.match(surface, /ACTIVE_SOURCE_STORAGE_PREFIX\s*=\s*"oip\.active-organizational-source\.v1:"/);
assert.match(surface, /function activeSourceStorageKey\(organizationId: string\): string[\s\S]{0,180}encodeURIComponent\(organizationId\)/, "active Source pointer must be tenant-keyed");
assert.match(surface, /localStorage\.setItem\(activeSourceStorageKey\(organizationId\), nextSource\.id\)/, "Source creation must persist only a durable Source ID");
assert.match(surface, /async function resumeSavedDraft\(\): Promise<void>/, "saved-draft recovery must be explicit");
const resumeBlock = surface.match(/async function resumeSavedDraft\(\): Promise<void> \{[\s\S]*?\n  \}\n\n  function closeEntry/);
assert.ok(resumeBlock, "explicit Resume implementation must remain structurally discoverable");
assert.match(resumeBlock[0], /Promise\.all\(\[/, "Resume must perform the Source and Evidence reads together");
const resumeReads = resumeBlock[0].match(/memory\/experiences\/\$\{encodeURIComponent\([^)]*\)\}[^`]*`/g) ?? [];
assert.equal(resumeReads.length, 2, "Resume must have exactly one Source read and one Evidence read");
assert.match(resumeReads[0], /memory\/experiences\/\$\{encodeURIComponent\([^)]*\)\}/, "Resume must re-read the Source from the server");
assert.match(resumeReads[1], /\/evidence`/, "Resume must re-read attached Evidence from the server");
assert.match(resumeBlock[0], /setSource\(nextSource\)/);
assert.match(resumeBlock[0], /setSourceEvidence\(nextEvidence\)/);
assert.match(resumeBlock[0], /canApplyDraftHydration/, "Resume must reject stale or cross-organization responses");
assert.match(surface, /Start new experience/);
assert.match(surface, /Resume saved experience/);
assert.match(surface, /localStorage\.removeItem\(activeSourceStorageKey\(organizationId\)\)/, "validated work must clear the active-work pointer");
assert.match(sourceRoute, /export const GET/);
assert.match(sourceRoute, /loadSource\(organizationId, params\.sourceId\)/);

const mountEffect = surface.match(/useEffect\(\(\) => \{[\s\S]*?return \(\) => \{[\s\S]*?\};[\s\S]*?\}, \[organizationId\]\);/);
assert.ok(mountEffect, "Knowledge mount recovery effect must remain structurally discoverable");
assert.match(mountEffect[0], /localStorage\.getItem\(activeSourceStorageKey\(organizationId\)\)/);
assert.match(mountEffect[0], /setSavedDraftSourceId\(sourceId\)/, "mount must expose the saved pointer for explicit recovery");
assert.match(mountEffect[0], /A saved organizational experience is available/);
assert.doesNotMatch(mountEffect[0], /setSource\(nextSource\)|setSourceEvidence\(nextEvidence\)|setEntryOpen\(true\)/, "mount must not silently reopen or apply the saved Source");
assert.doesNotMatch(mountEffect[0], /validateLearning|recordOutcome|\/validate|\/outcomes/, "refresh must not auto-validate or create an Outcome");

console.log("OIP-V2-FIX-004A refresh/source recovery regression: PASS");
console.log("- transient auth responses retry without false logout");
console.log("- authorized organization list is reused during hydration");
console.log("- active Source ID is tenant-keyed and remains a non-authoritative pointer");
console.log("- explicit Resume server-authoritatively reloads Source and attached Evidence");
console.log("- validated work clears the pointer; refresh does not auto-validate or create Outcomes");
