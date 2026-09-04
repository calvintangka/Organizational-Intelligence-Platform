import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "../../../components/landing/zendesk-landing.css";
import "../../../components/landing/zendesk-landing-overrides.css";

const title = "OIP — Organizational Intelligence Platform";
const description = "Turn resolved work into reusable, trusted Organizational Memory. OIP starts with customer support.";

function optionalHttpsOrigin(rawValue: string | undefined, variableName: string): URL | null {
  const value = rawValue?.trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be an absolute HTTPS origin.`);
  }

  const hasRootPathOnly = parsed.pathname === "/";
  const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !hasRootPathOnly ||
    parsed.search ||
    parsed.hash ||
    isLocalHost
  ) {
    throw new Error(`${variableName} must be a public absolute HTTPS origin without credentials, path, query, or fragment.`);
  }

  return new URL(parsed.origin);
}

const siteOrigin = optionalHttpsOrigin(process.env.NEXT_PUBLIC_OIP_SITE_ORIGIN, "NEXT_PUBLIC_OIP_SITE_ORIGIN");

export const metadata: Metadata = {
  title,
  description,
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title,
    description,
    type: "website",
    ...(siteOrigin ? { url: siteOrigin } : {}),
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
  ...(siteOrigin
    ? {
        metadataBase: siteOrigin,
        alternates: { canonical: "/" },
      }
    : {}),
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
