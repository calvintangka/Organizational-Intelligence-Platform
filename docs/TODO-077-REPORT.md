# TODO-077 Dependency Security Remediation & Framework Upgrade Report

## Verdict

COMPLETED_WITH_LIMITATIONS

The dependency baseline was remediated without architectural, schema, migration, Organizational Memory, worker, or connector behavior changes. `npm audit` and `npm audit --omit=dev` both report zero vulnerabilities.

The limitations are bounded: TODO-063 has no repository probe or package script; the legacy `test-oip-regression` probe remains blocked by its existing migration-import fixture conflict; and browser verification was performed in the available Chromium-based in-app browser, not as separate Firefox/Safari runs.

## Dependency Inventory

The final lockfile is npm lockfile v3 with 288 resolved packages: 171 production, 78 development, 41 optional, and no peer or peer-optional packages. The direct inventory is:

| Package | Baseline -> final | Latest compatible / wanted | Latest available | Class | Purpose | Risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `@prisma/adapter-pg` | 7.8.0 -> 7.9.1 | 7.9.1 | 7.9.1 | direct production | Prisma PostgreSQL driver adapter | medium when separated from client | upgrade together |
| `@prisma/client` | 7.8.0 -> 7.9.1 | 7.9.1 | 7.9.1 | direct production | generated database client | medium when separated from CLI | upgrade together |
| `dotenv` | 16.6.1 -> 16.6.1 | 16.6.1 | 17.4.2 | direct production | environment loading | major-version behavior change | leave unchanged |
| `next` | 15.5.19 -> 15.5.22 | 15.5.22 | 16.3.0 | direct production | App Router, Route Handlers, build/runtime | high across major 16 | upgrade patch line only |
| `pg` | 8.16.3 -> 8.22.0 | 8.22.0 | 8.22.0 | direct production | PostgreSQL connection driver | low patch/minor risk | upgrade |
| `react` | 19.2.7 -> 19.2.8 | 19.2.8 | 19.2.8 | direct production | UI runtime | low patch risk | upgrade with React DOM |
| `react-dom` | 19.2.7 -> 19.2.8 | 19.2.8 | 19.2.8 | direct production | browser/server rendering | low patch risk | upgrade with React |
| `@types/node` | 22.20.0 -> 22.20.1 | 22.20.1 | 26.1.2 | direct development | Node type declarations | high across Node major | pin Node 22 type line |
| `@types/pg` | 8.15.5 -> 8.20.3 | 8.20.3 | 8.20.3 | direct development | PostgreSQL types | low | upgrade |
| `@types/react` | 19.2.17 -> 19.2.18 | 19.2.18 | 19.2.18 | direct development | React types | low | upgrade with React |
| `@types/react-dom` | 19.2.3 -> 19.2.4 | 19.2.4 | 19.2.4 | direct development | React DOM types | low | upgrade with React DOM |
| `autoprefixer` | 10.5.2 -> 10.5.4 | 10.5.4 | 10.5.4 | direct development | CSS compatibility build step | low | upgrade |
| `postcss` | 8.5.15 -> 8.5.25 | 8.5.25 | 8.5.25 | direct development | CSS processing | medium because of source-map advisories | upgrade and override transitive copy |
| `prisma` | 7.8.0 -> 7.9.1 | 7.9.1 | 7.9.1 | direct development | schema, migration, and generator CLI | medium when separated from client | upgrade together |
| `tailwindcss` | 3.4.19 -> 3.4.19 | 3.4.19 | 4.3.3 | direct development | utility CSS generation | high across Tailwind 4 | pin 3.x |
| `typescript` | 5.9.3 -> 5.9.3 | 5.9.3 | 7.0.2 | direct development | strict type checking and build types | high across compiler major | pin 5.9.x |

Transitive packages were inventoried from `package-lock.json` and `npm ls --all`. Audit-relevant transitive packages and their final versions are recorded below: `@prisma/dev` 0.24.17, `valibot` 1.4.2, `fast-uri` 3.1.5, `sharp` 0.35.3, and the Prisma engine/config packages at 7.9.1. The two optional Sharp WASM entries retained by npm on Windows are not direct dependencies and are not committed artifacts.

## Security Audit

The baseline audit reported 9 vulnerability records: 4 high, 5 moderate, 0 low, and 0 critical. The final audit reports 0 across all severities in both the full and production-only trees.

| Package / severity | Advisory and affected range | Dependency chain | Exploitability and OIP use | Remediation |
| --- | --- | --- | --- | --- |
| `@hono/node-server` / moderate | GHSA-92pp-h63x-v22m `<1.19.13`; GHSA-frvp-7c67-39w9 `<2.0.5` | `prisma` -> `@prisma/dev` -> Hono tooling | Development-time Prisma tooling only; OIP does not use Hono static serving | removed from the final Prisma tool tree by 7.9.1 |
| `@prisma/dev` / moderate | `<=0.24.16`, via Hono and Valibot | `prisma` CLI | Local/development tooling; not application request handling | 0.24.17 through Prisma 7.9.1 |
| `fast-uri` / high | GHSA-v2hh-gcrm-f6hx and GHSA-7p8r-x3mc-p8w7; 3.0.0 through 3.1.4 | `prisma` -> `@prisma/dev` -> streams-local -> AJV -> fast-uri | Development-time schema tooling; no OIP runtime URL authorization path uses this package | 3.1.5 through Prisma 7.9.1 |
| `hono` / moderate | GHSA-8j4g-w8fx-2239 `<4.12.34` | `prisma` -> `@prisma/dev` -> Hono | Development-only Prisma tooling; no OIP Hono runtime | removed from final tree |
| `next` / high and moderate | GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x, GHSA-p9j2-gv94-2wf4, plus cache, payload, SVG, invalid-UTF-8, and internal-endpoint advisories in the npm report; affected Next 13-15 ranges before the patched 15.5 line | direct production dependency; also reached `postcss` and `sharp` | Network-reachable framework risk, relevant to App Router, Server Actions, rewrites, and image handling. OIP has App Router and Route Handlers, but no Server Actions or middleware file | Next 15.5.22 plus patched transitive overrides; Next 16 was not adopted because it is a major routing/cache/proxy upgrade |
| `postcss` / high and moderate | GHSA-qx2v-qp2m-jg93 `<8.5.10`; GHSA-6g55-p6wh-862q `<=8.5.11`; GHSA-r28c-9q8g-f849 `<=8.5.17`; GHSA-fxqj-rqcc-2cmp `<=8.5.22` | direct dev dependency and Next's nested copy | Build-time CSS/source-map processing; not an OIP request handler, but arbitrary file disclosure and XSS risks justify remediation | 8.5.25 direct and globally overridden for Next |
| `prisma` / moderate | `6.20.0-dev.1` through `7.9.0-dev.31`, via `@prisma/dev` | direct development dependency | Migration/generator tooling, not runtime query execution | 7.9.1 with matching client/adapter |
| `sharp` / high | GHSA-f88m-g3jw-g9cj, `<0.35.0`; includes CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | Next optional image dependency | OIP does not use untrusted SVG/image optimization paths in its API surface, but the production dependency is installed and was remediated | 0.35.3 override |
| `valibot` / moderate | GHSA-5qjj-4xww-7phc `<=1.4.1` | `prisma` -> `@prisma/dev` -> Valibot | Development-only Prisma tooling; no OIP runtime validation path imports it | 1.4.2 through Prisma 7.9.1 |

The npm audit output did not attach CVE identifiers to the Next, PostCSS, Prisma, Hono, fast-uri, or Valibot GHSA records; those are reported by GHSA identifier above. The Sharp record supplied the CVE list shown above.

## Framework Review

### Next.js

Next was upgraded from 15.5.19 to 15.5.22, staying on the 15.x maintenance line. The official Next.js version-15 guidance was reviewed, and the version-16 guidance was reviewed before declining the major upgrade. OIP uses the App Router and Node.js Route Handlers. There is no `middleware.ts`, `proxy.ts`, `use server`, or `experimental.serverActions` usage in the application. Route handlers explicitly use the Node.js runtime where needed. No routing, server-action, middleware, edge, or source changes were required.

### React

React and React DOM moved together from 19.2.7 to 19.2.8. Strict mode remains enabled. No changes were required for hydration, Suspense, Server Components, Client Components, or concurrent behavior. The browser smoke test hydrated the dashboard successfully with no console errors.

### TypeScript

TypeScript remains 5.9.3 with `strict: true`, `moduleResolution: bundler`, `module: esnext`, `target: ES2017`, `isolatedModules: true`, and `noEmit: true`. Node and React declaration packages were updated within their existing major lines. Type checking passes.

### Prisma

`prisma`, `@prisma/client`, and `@prisma/adapter-pg` moved together from 7.8.0 to 7.9.1. Prisma Client was regenerated. The schema validates, all 17 migrations are present, and `prisma migrate status` reports the database is up to date. No schema, migration, connection-pooling, transaction, prepared-statement, or generated-client source changes were made.

### Node Runtime

The verification runtime is Node.js v24.14.1, an LTS release line. Prisma 7 and Sharp 0.35.3 both support the runtime. The project does not declare a conflicting `engines` field. Worker probes, API routes, database probes, and the production build all run on this runtime.

### AI Stack

No AI packages were added, removed, or upgraded. The LM Studio / Claude provider abstraction, fetch layer, JSON parsing, AbortSignal, timeout behavior, and deterministic fallback were covered by BUG-010 and the TODO-038/TODO-041 regression paths.

### Worker Stack

No worker or telemetry code changed. Durable jobs, leases, heartbeats, retries, cancellation, connector intake, reflection, pattern discovery, and operations reporting passed their existing probes after the dependency update.

### Build Toolchain

PostCSS moved to 8.5.25, Autoprefixer to 10.5.4, and Tailwind remained on 3.4.19. The existing `postcss.config.mjs` and Tailwind configuration remain unchanged. TypeScript and the production Next build pass. The existing Tailwind ESM/CJS warning remains non-fatal and is unrelated to this upgrade.

## Upgrade Plan

- Upgrade immediately: Next 15.5.22, PostCSS 8.5.25, Sharp 0.35.3 override, Prisma 7.9.1, Valibot/fast-uri/Prisma tool transitive updates.
- Upgrade together: `prisma`, `@prisma/client`, and `@prisma/adapter-pg`; `react` and `react-dom`; the React and Node type packages.
- Pin the existing major lines: Next 15, Tailwind 3, TypeScript 5, Node 22 type declarations, and dotenv 16.
- Leave unchanged: dotenv 16.6.1; no security or compatibility reason justified a major upgrade.
- Remove: no direct package removal was safe or necessary.
- Replace: none.

## Implemented Upgrades

Only `package.json` and `package-lock.json` changed. The changes are:

- upgraded direct compatible versions listed in Dependency Inventory;
- added an npm `postcss` override to force Next's nested copy to the patched 8.5.25 release;
- added an npm `sharp` override at 0.35.3 to remove the libvips vulnerability;
- regenerated and reified the lockfile with `npm ci`.

No application source, Prisma schema, migration, worker, connector, memory, trust, or reflection files changed.

## Removed Dependencies

No direct dependency was removed. The vulnerable Hono development subtree and obsolete vulnerable transitive versions were eliminated by the Prisma 7.9.1 tree. npm retained two optional Sharp WASM package entries in the Windows install tree; they are not direct dependencies, are not vulnerabilities, and are not committed.

## Breaking Change Review

No major framework upgrade was accepted. The selected changes are patch or compatible minor updates, except for the explicitly scoped transitive Sharp override required to reach the fixed 0.35 line. No APIs, business behavior, configuration, environment variables, migration behavior, or source imports required changes. Prisma client and CLI versions remain aligned.

## Regression Results

Passed:

- TypeScript `tsc --noEmit`.
- Prisma generate, validate, and migrate status.
- Production `next build`.
- `npm audit` and `npm audit --omit=dev` with zero findings.
- TODO-018.
- TODO-039, 040, 041, 043, 044, 045, 046, 047, 048, 049, 050, 051, 052, 053, 055, 056.
- TODO-058, 058B, 058C, 058D, 058E, and 058F.
- TODO-060, 061, 062A, 062B, 062C, and 062D.
- TODO-064, 065, 067, 068, 069, and 070.
- TODO-072 through TODO-076, including recovery, cancellation, parity, concurrency, dashboard, and connector tenancy cases.
- BUG-008, BUG-009, and BUG-010.
- Authentication, membership authorization, active organization, organization switching, actor propagation, database writes, persistence boundary, and server persistence probes.

TODO-063 has no corresponding script or probe in this repository, so it was not fabricated or marked as passed. The legacy `test-organization` probe remains an environmental fixture limitation: its fixed organization migration import currently returns `conflict` instead of `imported`. This did not affect the dependency or framework checks, and mature-data snapshots remain unchanged.

## Performance Parity

TODO-062C reported 100/100 category, canonical, memory, lesson, and language parity between bulk and single-ticket processing. TODO-064 completed 1,000-row, 500-row, 250-row, 100-row, 50-row, 25-row, 10-row, and single-ticket performance measurements with 100% success and no timeouts. TODO-072 through TODO-076 worker and connector throughput/recovery probes passed. No meaningful performance regression was observed.

## Security Verification

Authentication, session cookies, authorization boundaries, active-organization switching, actor propagation, API route protection, persistence authority, connector credential isolation, connector webhook HMAC validation, and worker API behavior passed their existing tests. The upgraded tree has zero npm audit findings. No Server Actions or middleware are present, so the corresponding Next attack surfaces are not enabled by OIP source configuration.

## Browser Compatibility

The available Chromium-based in-app browser loaded `http://localhost:3000/`, hydrated the authenticated dashboard, rendered navigation and dashboard content, and recorded no browser console errors. Separate Firefox, Safari, and external Chrome/Edge runs were not available in this environment. The production build and route-handler checks passed; no browser-specific source changes were introduced.

## Data Safety

No destructive migration, reset, reseed, manual SQL write, or mature-data migration was performed. The only tracked changes are dependency manifests, lockfile, and this report.

The mature snapshot checks remained stable:

| Entity | Before baseline | After verification | Result |
| --- | ---: | ---: | --- |
| developer-demo knowledge items | 47 | 47 | unchanged |
| developer-demo candidates | 1,805 | 1,805 | unchanged |
| developer-demo validations | 1,804 | 1,804 | unchanged |
| developer-demo memory changes | 1,804 | 1,804 | unchanged |
| developer-demo tickets | 5,120 | 5,120 | unchanged |
| developer-demo trust evidence | 4,500 | 4,500 | unchanged |
| developer-demo patterns | 50 | 50 | unchanged |
| persisted multilingual lessons | 181 | 181 | unchanged |
| mature connector installations/events/mappings | 0 / 0 / 0 | 0 / 0 / 0 | unchanged |
| TODO-043 HERO provenance | OIP-20230104-0001 | OIP-20230104-0001 | intact |

Disposable probe organizations were cleaned by their existing harnesses. The fixed `test-oip-regression` fixture retains the pre-existing migration-import conflict row noted above; it is not mature Organizational Memory.

## Remaining Security Findings

`npm audit` and `npm audit --omit=dev` report zero vulnerabilities: 0 critical, 0 high, 0 moderate, 0 low, and 0 informational.

Non-vulnerability follow-ups are:

- evaluate Next 16 in a separately planned framework-upgrade TODO after reviewing proxy, cache, and routing changes;
- replace the local development connector-key fallback with a production secret manager before private beta;
- add independent Firefox/Safari/Edge browser automation when those runners are available;
- repair or isolate the fixed migration-import fixture used by the legacy `test-organization` probe;
- remove the pre-existing Tailwind ESM/CJS warning in a separate build-tooling cleanup.

## Maintenance Policy

- Run full and production-only `npm audit` monthly and on every security release.
- Review `npm outdated` monthly, but upgrade only within an approved compatibility window.
- Review Next and React security releases immediately; evaluate major framework upgrades separately from patch remediation.
- Keep Prisma CLI, client, adapter, and generated client on the same release line.
- Use exact lockfile installs in CI (`npm ci`) and review every lockfile diff for unexpected direct or transitive packages.
- Keep Tailwind, TypeScript, Node type declarations, and dotenv pinned to their current major lines until a dedicated modernization task exists.
- Adopt Renovate or Dependabot with grouped PR rules for Prisma, React, and Next patch releases, plus required build/probe gates.
- Maintain a security response policy: triage critical/high findings within one business day, patch exploitable production paths first, and document accepted risk for dev-only chains.

## TODO-077 Status

Complete with limitations. Security posture improved from 4 high / 5 moderate findings to zero audit findings, with behavioral parity preserved across the executed matrix.

## Commit

Dependency upgrade and this report are committed as the TODO-077 remediation change; the final handoff records the resulting commit hash.
