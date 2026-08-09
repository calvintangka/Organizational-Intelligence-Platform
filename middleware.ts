import { NextRequest, NextResponse } from "next/server";

/**
 * RSS-1.2S4 — centralized HTTP security middleware.
 *
 * Every browser-facing response receives an explicit security policy instead of
 * relying on browser defaults. Static assets (`_next/static`, images, css, js,
 * fonts) are excluded so their long-lived cache headers and CDN behavior are
 * untouched. API responses additionally receive `Cache-Control: no-store`.
 *
 * The production CSP is nonce-based: a per-request nonce is generated here,
 * embedded in `Content-Security-Policy`, and carried to server components via
 * the `x-nonce` request header so Next.js applies it to its own inline
 * bootstrap scripts. The development policy is deliberately more permissive
 * (inline + eval for hot-module reload) and never ships in production.
 */

const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

function nonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function productionCsp(nonceValue: string): string {
  return [
    "default-src 'self'",
    // The nonce is applied to Next.js's own inline bootstrap scripts.
    `script-src 'self' 'nonce-${nonceValue}'`,
    // Next.js emits inline <style> for initial CSS; inline styles are far less
    // dangerous than inline scripts and are required for hydration.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // All provider traffic flows through the same-origin AI proxy, so the
    // browser only ever connects to the application origin.
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self'"
  ].join("; ");
}

function developmentCsp(): string {
  return [
    "default-src 'self'",
    // Development-only: Next.js hot-module reload uses inline scripts and eval.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Development-only: HMR websocket and any direct local provider access.
    "connect-src 'self' ws: wss: http://localhost:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self'"
  ].join("; ");
}

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "bluetooth=()",
  "serial=()",
  "midi=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "xr-spatial-tracking=()",
  "screen-wake-lock=()",
  "speaker-selection=()",
  "clipboard-read=()",
  "fullscreen=()",
  "clipboard-write=(self)"
].join(", ");

export function middleware(request: NextRequest) {
  const nonceValue = nonce();
  const csp = IS_DEVELOPMENT ? developmentCsp() : productionCsp(nonceValue);
  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  // Production-only HSTS. Never sent over local development HTTP.
  if (!IS_DEVELOPMENT) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // Sensitive API responses must never be cached. (Next.js also marks dynamic
  // route handlers no-store; this makes the guarantee explicit at the edge.)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store");
  }

  // Next.js reads the CSP from the REQUEST header to extract the nonce and
  // apply it to its own inline bootstrap scripts; the RESPONSE header is what
  // the browser enforces. Both must carry the same policy and nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonceValue);

  return NextResponse.next({ request: { headers: requestHeaders }, headers: response.headers });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|mjs|woff2?|ttf|eot|map)$).*)"
  ]
};
