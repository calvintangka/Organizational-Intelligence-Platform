import type { Metadata } from "next";
import "./globals.css";
import "@/components/landing/landing.css";
import { APP_TITLE } from "@/lib/documentTitle";
import { headers } from "next/headers";

// TODO-055: the static metadata title is the pre-hydration fallback only. The
// browser tab follows the active organization at runtime (useOrganizationDocumentTitle
// in app/page.tsx), so this must NOT name a specific organization — otherwise a
// refresh inside one organization briefly shows another organization's name.
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;
  const title = `${APP_TITLE} — Organizational Intelligence Platform`;
  const description = "Turn resolved work into reusable, trusted Organizational Memory. OIP starts with customer support.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1792, height: 1024, alt: "OIP — Stop starting from zero." }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage]
    }
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
