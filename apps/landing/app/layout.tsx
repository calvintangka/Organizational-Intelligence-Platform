import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "../../../components/landing/zendesk-landing.css";
import "../../../components/landing/zendesk-landing-overrides.css";
import {
  PUBLIC_BRAND_NAME,
  PUBLIC_SITE_DESCRIPTION,
  PUBLIC_SITE_TITLE,
  PUBLIC_SITE_URL,
} from "../../../lib/publicBrand";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  title: PUBLIC_SITE_TITLE,
  description: PUBLIC_SITE_DESCRIPTION,
  applicationName: PUBLIC_BRAND_NAME,
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/icon.svg",
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
  alternates: {
    canonical: PUBLIC_SITE_URL,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
