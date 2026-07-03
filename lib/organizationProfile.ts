import { defaultOrganizationProfile, seedOrganizationProfiles } from "@/data/seedOrganizationProfiles";
import type { OrganizationProfile } from "@/types";

export const ORGANIZATION_PROFILE_KEY = "oip.organizationProfile.v1";
export const ORGANIZATION_LIST_KEY = "oip.organizationList.v1";

const DEFAULT_ACCENT = "#2563EB";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

/** Accept #RGB or #RRGGBB; fall back to the brand blue for anything invalid. */
export function normalizeAccentColor(value: string | undefined): string {
  if (typeof value !== "string") return DEFAULT_ACCENT;
  const hex = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return hex.toUpperCase();
  return DEFAULT_ACCENT;
}

function normalizeInitials(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().toUpperCase().slice(0, 3);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Initials shown in avatars: explicit override, else derived from the name. */
export function initialsFor(profile: Pick<OrganizationProfile, "name" | "logoInitials">): string {
  if (profile.logoInitials && profile.logoInitials.trim()) return profile.logoInitials.trim().toUpperCase().slice(0, 3);
  return profile.name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function upsertById(list: OrganizationProfile[], profile: OrganizationProfile): OrganizationProfile[] {
  const exists = list.some((item) => item.id === profile.id);
  return exists ? list.map((item) => (item.id === profile.id ? profile : item)) : [...list, profile];
}

export function normalizeOrganizationProfile(profile: OrganizationProfile): OrganizationProfile {
  const now = new Date().toISOString();
  const migratedProfile =
    profile.id === "profile-aether-labs" || profile.name === "Aether Labs"
      ? { ...profile, id: "profile-maesa-tech", name: "Maesa Tech" }
      : profile;

  return {
    ...defaultOrganizationProfile,
    ...migratedProfile,
    products: normalizeList(migratedProfile.products ?? []),
    services: normalizeList(migratedProfile.services ?? []),
    supportedDomains: normalizeList(migratedProfile.supportedDomains ?? []),
    businessVocabulary: normalizeList(migratedProfile.businessVocabulary ?? []),
    supportedIssueTypes: normalizeList(migratedProfile.supportedIssueTypes ?? []),
    outOfScopeTopics: normalizeList(migratedProfile.outOfScopeTopics ?? []),
    supportBoundaries: normalizeList(migratedProfile.supportBoundaries ?? []),
    escalationRules: normalizeList(migratedProfile.escalationRules ?? []),
    autoResolutionThreshold: Math.max(0, Math.min(100, Math.round(migratedProfile.autoResolutionThreshold ?? 80))),
    accentColor: normalizeAccentColor(migratedProfile.accentColor),
    logoInitials: normalizeInitials(migratedProfile.logoInitials),
    createdAt: migratedProfile.createdAt ?? now,
    updatedAt: now
  };
}

export function loadOrganizationProfile(): OrganizationProfile {
  if (!hasStorage()) return defaultOrganizationProfile;
  try {
    const raw = window.localStorage.getItem(ORGANIZATION_PROFILE_KEY);
    if (!raw) return defaultOrganizationProfile;
    return normalizeOrganizationProfile(JSON.parse(raw) as OrganizationProfile);
  } catch {
    return defaultOrganizationProfile;
  }
}

export function saveOrganizationProfile(profile: OrganizationProfile): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(ORGANIZATION_PROFILE_KEY, JSON.stringify(normalizeOrganizationProfile(profile)));
  } catch {
    /* ignore localStorage errors in the prototype */
  }
}

export function resetOrganizationProfile(): OrganizationProfile {
  if (hasStorage()) {
    try {
      window.localStorage.setItem(ORGANIZATION_PROFILE_KEY, JSON.stringify(defaultOrganizationProfile));
    } catch {
      /* ignore */
    }
  }
  return defaultOrganizationProfile;
}

export function findSeedOrganizationProfile(profileId: string): OrganizationProfile {
  return seedOrganizationProfiles.find((profile) => profile.id === profileId) ?? defaultOrganizationProfile;
}

/**
 * The org list is persisted under its own key (two-key model): the selected profile stays under
 * ORGANIZATION_PROFILE_KEY so the learning engine is unaffected, while the full switchable list
 * lives here. Seeds the built-in profiles on first run.
 */
export function loadOrganizationList(): OrganizationProfile[] {
  const seeded = seedOrganizationProfiles.map(normalizeOrganizationProfile);
  if (!hasStorage()) return seeded;
  try {
    const raw = window.localStorage.getItem(ORGANIZATION_LIST_KEY);
    if (!raw) return seeded;
    const parsed = JSON.parse(raw) as OrganizationProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seeded;
    return parsed.map(normalizeOrganizationProfile);
  } catch {
    return seeded;
  }
}

export function saveOrganizationList(list: OrganizationProfile[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(ORGANIZATION_LIST_KEY, JSON.stringify(list.map(normalizeOrganizationProfile)));
  } catch {
    /* ignore localStorage errors in the prototype */
  }
}

/** Merge the currently-selected profile into the list so edits to it stay reflected in the switcher. */
export function syncProfileIntoList(
  list: OrganizationProfile[],
  profile: OrganizationProfile
): OrganizationProfile[] {
  return upsertById(list, profile);
}

export function splitProfileField(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function profileKeywordBank(profile: OrganizationProfile): string[] {
  return [
    ...profile.products,
    ...profile.services,
    ...profile.supportedDomains,
    ...profile.businessVocabulary,
    ...profile.supportedIssueTypes
  ];
}
