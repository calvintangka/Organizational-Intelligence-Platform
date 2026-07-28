"use client";

import { useEffect } from "react";

/** Product name shown alone whenever no organization is active. */
export const APP_TITLE = "OIP";

/**
 * TODO-055: the browser tab title for an active organization.
 *
 * Returns "<Organization Name> | OIP", or the bare product name when no
 * organization is available — loading, signed out, or an organization whose
 * name is missing or blank. No environment names or internal ids.
 */
export function organizationDocumentTitle(organizationName: string | null | undefined): string {
  const name = typeof organizationName === "string" ? organizationName.trim() : "";
  return name.length > 0 ? `${name} | ${APP_TITLE}` : APP_TITLE;
}

/**
 * Keep the browser tab in sync with the active organization.
 *
 * Pass null while loading, signed out, or before hydration has resolved the
 * authoritative organization, so the tab falls back to the product name instead
 * of briefly showing a seed organization's name. The effect depends on the
 * computed title and re-checks document.title, so an unchanged organization
 * performs no DOM write.
 */
export function useOrganizationDocumentTitle(organizationName: string | null | undefined): void {
  const title = organizationDocumentTitle(organizationName);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.title === title) return;
    document.title = title;
  }, [title]);
}
