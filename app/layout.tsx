import type { Metadata } from "next";
import "./globals.css";
import "@/components/landing/landing.css";
import "@/components/landing/zendesk-landing.css";
import "@/components/landing/zendesk-landing-overrides.css";
import { headers } from "next/headers";
import {
  PUBLIC_BRAND_NAME,
  PUBLIC_SITE_DESCRIPTION,
  PUBLIC_SITE_TITLE,
  PUBLIC_SITE_URL,
} from "@/lib/publicBrand";

// TODO-055: static metadata is the pre-hydration fallback only. The browser tab
// continues to follow the active organization through useOrganizationDocumentTitle
// in app/page.tsx, including its organization-specific title after login.
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const appOrigin = new URL(protocol + "://" + host);

  return {
    metadataBase: appOrigin,
    title: PUBLIC_SITE_TITLE,
    description: PUBLIC_SITE_DESCRIPTION,
    applicationName: PUBLIC_BRAND_NAME,
    alternates: {
      canonical: PUBLIC_SITE_URL,
    },
    openGraph: {
      title: PUBLIC_SITE_TITLE,
      description: PUBLIC_SITE_DESCRIPTION,
      type: "website",
      siteName: PUBLIC_BRAND_NAME,
      url: PUBLIC_SITE_URL,
    },
    twitter: {
      card: "summary",
      title: PUBLIC_SITE_TITLE,
      description: PUBLIC_SITE_DESCRIPTION,
    },
  };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  // RSS-1.2S4: reading request headers marks this shell request-dependent so
  // the security middleware's per-request CSP nonce (carried on the
  // `content-security-policy` request header) is applied to Next.js's inline
  // bootstrap scripts by the renderer.
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
