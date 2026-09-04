import { ZendeskLandingPage } from "../../../components/landing/LandingPageZendesk";

function optionalAppLoginHref(rawValue: string | undefined): string | null {
  const value = rawValue?.trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_OIP_APP_ORIGIN must be an absolute HTTPS origin.");
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
    throw new Error(
      "NEXT_PUBLIC_OIP_APP_ORIGIN must be a public absolute HTTPS origin without credentials, path, query, or fragment.",
    );
  }

  return new URL("/?auth=login", parsed.origin).toString();
}

export default function LandingPage() {
  const signInHref = optionalAppLoginHref(process.env.NEXT_PUBLIC_OIP_APP_ORIGIN);
  return <ZendeskLandingPage signInHref={signInHref} />;
}
