import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maesa Tech",
  description: "The organization gets smarter with every resolved ticket."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
