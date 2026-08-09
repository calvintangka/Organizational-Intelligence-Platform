import type { Metadata } from "next";
import "./globals.css";
import { APP_TITLE } from "@/lib/documentTitle";
import { headers } from "next/headers";

// TODO-055: the static metadata title is the pre-hydration fallback only. The
// browser tab follows the active organization at runtime (useOrganizationDocumentTitle
// in app/page.tsx), so this must NOT name a specific organization — otherwise a
// refresh inside one organization briefly shows another organization's name.
export const metadata: Metadata = {
  title: APP_TITLE,
  description: "The organization gets smarter with every resolved ticket."
};

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
