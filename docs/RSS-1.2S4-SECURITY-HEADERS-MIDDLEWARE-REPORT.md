# RSS-1.2S4 — Security Headers & Middleware Report

**Audit date:** 2026-08-06
**Audit type:** Remediation + independent verification of RSS-1.2S0 High Finding #2
**Final verdict:** **HTTP_HARDENING_COMPLETE**
**Release recommendation:** **READY TO RESUME RELEASE STABILIZATION**

## 1. Executive Summary

RSS-1.2S0 confirmed that OIP responses carried no explicit HTTP security policy: no CSP, no HSTS, no `X-Frame-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no `X-Content-Type-Options`, and no middleware. RSS-1.2S4 introduces a single centralized Next.js middleware that applies a complete browser-security header policy to every HTML and API response while leaving static assets and the application's behavior untouched.

The production Content-Security-Policy is **nonce-based**: a fresh per-request nonce is generated in the middleware, embedded in the policy, and carried on the request headers so Next.js applies it to its own inline bootstrap scripts — verified to result in every inline `<script>` carrying the nonce and **zero** inline scripts without one, with `script-src` free of `unsafe-inline`. HSTS is applied in production only (never over local development HTTP). Development gets a deliberately more permissive policy for hot-module reload and local tooling, and it never ships in production.

The RSS-1.2S4 probe (read-only) verified the header policy on HTML, API, developer-diagnostics, connector-webhook, and static-asset responses, verified the nonce consistency, and ran the negative (browser-blocking) assertions. The full regression suite passes and the database is untouched.

## 2. Root Cause

The application had no middleware and `next.config.ts` declared only `reactStrictMode`. Browsers therefore applied defaults: no clickjacking protection, no MIME-sniffing protection, no referrer trimming, no feature-policy denial, and no script-source control. RSS-1.2S0 observed all eight requested headers absent on both `/` and `/api/auth/me`.

## 3. Security Header Matrix

| Header | Value | Purpose | Development | Production |
| --- | --- | --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-<n>'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; media-src 'self'; worker-src 'self' blob:; frame-src 'self'` | XSS / injection / clickjacking / data-exfiltration control | Permissive: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `connect-src 'self' ws: wss: http://localhost:*` | Nonce-based, no `unsafe-inline` for scripts |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforce HTTPS | Absent (never over local HTTP) | Present |
| `X-Frame-Options` | `DENY` | Clickjacking (with `frame-ancestors 'none'`) | Present | Present |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing | Present | Present |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage | Present | Present |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), xr-spatial-tracking=(), screen-wake-lock=(), speaker-selection=(), clipboard-read=(), fullscreen=(), clipboard-write=(self)` | Browser feature abuse | Present | Present |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-origin window isolation | Present | Present |
| `Cross-Origin-Resource-Policy` | `same-origin` | Prevent cross-origin resource loading | Present | Present |
| `X-Permitted-Cross-Domain-Policies` | `none` | Legacy cross-domain policy | Present | Present |
| `Cache-Control` | `no-store` (API only) | Sensitive response caching | API only | API only |

## 4. CSP Design

- **`default-src 'self'`** — everything defaults to same-origin.
- **`script-src 'self' 'nonce-<n>'`** — only same-origin scripts and scripts carrying the per-request nonce execute. Verified: every inline bootstrap script carries the nonce; `inline scripts without nonce = 0`; no `unsafe-inline`, no `unsafe-eval` in production.
- **`style-src 'self' 'unsafe-inline'`** — Next.js emits inline `<style>` for initial CSS and CSS-in-JS; inline styles are far less dangerous than inline scripts and are required for hydration. This is the one documented `unsafe-inline` exception.
- **`img-src 'self' data: blob:` / `font-src 'self' data:`** — application images/fonts plus data/blob URIs the app uses.
- **`connect-src 'self'`** — all AI provider traffic flows through the same-origin AI proxy (`/api/ai/*`), so the browser only ever connects to the application origin. No provider origin (DeepSeek, Anthropic, LM Studio) is needed in the browser CSP; this is documented.
- **`frame-ancestors 'none'` + `X-Frame-Options: DENY`** — the application cannot be embedded by arbitrary sites.
- **`base-uri 'self'`, `object-src 'none'`, `form-action 'self'`** — base-URI injection, object embedding, and cross-origin form submission are blocked.
- **`worker-src 'self' blob:` / `media-src 'self'` / `frame-src 'self'`** — conservative bounds for workers/media/frames.
- **Development** differs only where required: `script-src 'self' 'unsafe-inline' 'unsafe-eval'` for hot-module reload and `connect-src 'self' ws: wss: http://localhost:*` for the HMR websocket and local tooling. The dev policy never ships in production.

The nonce flows through Next.js's documented mechanism: the middleware sets `content-security-policy` on both the response header (what the browser enforces) and the request header (which Next.js's renderer reads to extract the nonce and apply to its inline scripts). The root layout reads request headers so the shell render is request-dependent and receives the per-request nonce.

## 5. Middleware Architecture

`middleware.ts` (project root) is the single source of the header policy; no route duplicates it.

- **Matcher** excludes `_next/static`, `_next/image`, favicon, and static file extensions so long-lived asset caching and CDN behavior are untouched (verified: static assets are served with no CSP and no middleware cache override).
- Every other response (HTML pages, all `/api/*` routes, developer diagnostics, connector webhooks) receives the full header set.
- API responses additionally receive `Cache-Control: no-store`.
- HSTS is applied only when `NODE_ENV !== 'development'`.
- The `x-nonce` request header is also set so server components can read it if needed.

## 6. Cookie Review

`lib/auth.ts` already sets the session cookie as `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, with a 30-day `Max-Age`. The middleware does not weaken any of this; it only adds response headers. No change was required to cookie settings, and the authentication probes confirm login/logout behavior is unaffected.

## 7. CORS Review

OIP is a same-origin application; no CORS response headers are needed or added. The middleware adds **no** `Access-Control-Allow-Origin`, so authenticated APIs cannot be consumed cross-origin. Connector webhooks and AI proxies are consumed server-side / same-origin; the webhook endpoint is signature-verified and does not require browser CORS. Verified: no `Access-Control-Allow-Origin` on HTML, API, or any checked response.

## 8. Cache Review

- All `/api/*` responses receive `Cache-Control: no-store` (authentication, tickets, AI, developer diagnostics, connectors), matching and reinforcing Next.js's own no-store marking for dynamic route handlers. Verified on `/api/auth/me` and `/api/developer/ai/providers`.
- Static assets are excluded from the middleware, preserving Next.js's immutable/long-lived asset caching.
- HTML pages keep Next.js's default dynamic no-store behavior.

## 9. Browser Security Tests

All verified by `node scripts/rss-1.2s4-security-headers-middleware.cjs` against a production `next start` instance:

| Response type | CSP | HSTS | XFO | Referrer | Permissions | Cache |
| --- | --- | --- | --- | --- | --- | --- |
| HTML (`/`) | `default-src 'self'` + nonce script-src | `max-age=31536000; includeSubDomains` | `DENY` | `strict-origin-when-cross-origin` | deny-all (clipboard-write self) | Next.js default |
| API (`/api/auth/me`) | present | present | present | present | present | `no-store` |
| Developer diagnostics (`/api/developer/ai/providers`) | present | present | present | present | present | `no-store` |
| Connector webhook (`/api/connectors/webhook/*`) | present | present | present | present | present | `no-store` |
| Static asset (`/_next/static/*.js`) | absent (excluded) | absent | absent | absent | absent | preserved |

Additional verified invariants: the production CSP is nonce-based with **no** `unsafe-inline`/`unsafe-eval` in `script-src`; every inline `<script>` carries the CSP nonce (`with nonce=13, without nonce=0`); the script nonces match the response-policy nonce exactly.

## 10. Negative Tests

| Attempt | Expected browser blocking | Verified |
| --- | --- | --- |
| iframe embedding | blocked (`X-Frame-Options: DENY` + `frame-ancestors 'none'`) | PASS |
| inline script injection | blocked (no inline script without the per-request nonce; `script-src` has no `unsafe-inline`) | PASS |
| object/embed/applet embedding | blocked (`object-src 'none'`) | PASS |
| MIME sniffing | blocked (`nosniff`) | PASS |
| camera/microphone/geolocation | blocked (`Permissions-Policy` `=()`) | PASS |
| cross-origin reads | blocked (no `Access-Control-Allow-Origin`) | PASS |
| referrer leakage | limited (`strict-origin-when-cross-origin`) | PASS |

## 11. Regression Results

| Regression | Result | Evidence |
| --- | --- | --- |
| TypeScript (`npx.cmd tsc --noEmit`) | PASS | Exit 0 |
| Prisma validation | PASS | Schema valid |
| Production build (`npm run build`) | PASS | Middleware compiled, exit 0 |
| RSS-1.2S0 security verification | PASS | Exit 0, data safety restored |
| RSS-1.2S1 AI authorization probe | PASS | Exit 0 |
| RSS-1.2S2 rate-limiting probe | PASS | Exit 0 |
| RSS-1.2S3 write-contract probe | PASS | Exit 0 |
| RSS-1.2S4 security-headers probe (new) | PASS | All header/negative checks above |
| TODO-078 RBAC | PASS | Exit 0 |
| TODO-082A provider routing / TODO-082C diagnostics | PASS | Exit 0 |
| TODO-046 / TODO-080 / TODO-083 | PASS | Exit 0 |
| OIP Benchmark v1 | PASS | 1000/1000, 100% overall, 100% critical security |
| Authentication / membership probes | PASS | Exit 0 (cookies unaffected) |
| Ticket application service, governed action, bulk parity, reflection parity, connector probes | PASS | Exit 0 |
| Developer diagnostics | PASS | Reachable, `no-store` |

## 12. Performance Impact

Middleware work is per-request nonce generation (`crypto.randomUUID`) plus setting ~10 response headers and two request headers — microseconds, no I/O, no network. Static assets are excluded entirely. The RSS-1.2S4 probe and all other probes observed no measurable latency impact; the added overhead is negligible and consistent across HTML and API.

## 13. Data Integrity

This task is purely HTTP hardening: `middleware.ts` (new), `app/layout.tsx` (the `headers()` call), `package.json` (probe registration), and the new probe. No database schema, no migration, and no business logic changed. The RSS-1.2S4 probe is read-only and asserts global counts and the mature Developer Demo digest are identical before and after. Final DB state is at the baseline with zero leftover probe fixtures.

## 14. Remaining Limitations

- **`style-src 'unsafe-inline'`** is required for Next.js inline styles (documented exception); styles are far less dangerous than scripts and the script policy is nonce-based.
- **Development CSP** is permissive for HMR (inline + eval); this is dev-only and never ships.
- **HSTS `preload`** is intentionally not set (the task requires justification; a preload submission is an operator decision once the production domain is finalized).
- **Browser enforcement** is verified structurally (header values, nonce consistency, no unprotected inline scripts) and through the documented browser-blocking behavior; an automated headless-browser test would add further confidence but is not present in the repository.
- The `x-nonce` mechanism depends on the root layout reading request headers (`await headers()`), which is documented in the layout.

## 15. Recommendation

Approve RSS-1.2S4. With RSS-1.2S1 (authorization), RSS-1.2S2 (abuse controls), RSS-1.2S3 (server-owned ticket writes), and RSS-1.2S4 (HTTP hardening) complete, the RSS-1.2S0 Critical findings (#1, #2, #3) and the security-headers High finding (#2) are resolved. Resume release stabilization; the remaining open items are the other High/Medium findings (metrics mutation authorization, role-normalization fail-closed migration, aggregate deadline, connector secret auditing, Claude readiness).

## 16. Release Status

All RSS-1.2S4 success criteria are satisfied:

- CSP implemented. **Verified**
- HSTS configured (production-only). **Verified**
- X-Frame-Options configured. **Verified**
- Referrer-Policy configured. **Verified**
- Permissions-Policy configured. **Verified**
- X-Content-Type-Options configured. **Verified**
- Sensitive responses protected (`Cache-Control: no-store` on API). **Verified**
- Middleware centralized. **Verified**
- Authentication unaffected. **Verified**
- AI providers unaffected. **Verified**
- Connectors unaffected. **Verified**
- Developer diagnostics unaffected. **Verified**
- OIP Benchmark remains 100%. **Verified**
- Mature Organizational Memory unchanged. **Verified**
- RSS-1.2S0 High Finding #2 independently verified as resolved. **Verified**

**HTTP_HARDENING_COMPLETE**
