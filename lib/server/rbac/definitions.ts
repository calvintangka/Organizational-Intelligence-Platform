import "server-only";

export const ROLE_KEYS = ["owner", "administrator", "reviewer", "operator", "support_agent", "viewer"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const CAPABILITY_KEYS = [
  "organization.read", "organization.profile.update", "organization.delete", "organization.reset",
  "organization.members.read", "organization.members.manage", "organization.settings.manage", "organization.ownership.transfer", "organization.audit.read",
  "ticket.read", "ticket.submit", "ticket.review", "ticket.allocate", "ticket.bulk_prepare",
  "knowledge.read", "knowledge.promote", "knowledge.version.create", "knowledge.trust.update",
  "reflection.read", "reflection.generate", "reflection.approve",
  "worker.read", "worker.retry", "worker.cancel", "worker.pause",
  "connector.read", "connector.install", "connector.activate", "connector.pause", "connector.delete",
  "connector.rotate_credentials", "connector.inspect", "connector.retry",
  "operations.read", "metrics.read", "migration.import", "migration.verify",
  "persistence.authority.manage", "action.prepare", "action.approve", "action.execute",
  "ai.use"
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full organization authority, including ownership and security administration." },
  administrator: { label: "Administrator", description: "Manages organization configuration, members, connectors, workers, and operational controls." },
  reviewer: { label: "Reviewer", description: "Reviews tickets, reflections, and proposed organizational memory changes." },
  operator: { label: "Operator", description: "Operates connectors, workers, and operational monitoring without memory approval authority." },
  support_agent: { label: "Support Agent", description: "Works tickets and submits operational knowledge for review." },
  viewer: { label: "Viewer", description: "Read-only access to organization work and operational status." }
};

const readOnly: CapabilityKey[] = ["organization.read", "ticket.read", "knowledge.read", "reflection.read", "worker.read", "connector.read", "connector.inspect", "operations.read", "metrics.read"];

export const ROLE_CAPABILITIES: Record<RoleKey, CapabilityKey[]> = {
  owner: [...CAPABILITY_KEYS],
  administrator: CAPABILITY_KEYS.filter((key) => key !== "organization.ownership.transfer"),
  reviewer: ["organization.read", "ticket.read", "ticket.review", "knowledge.read", "knowledge.promote", "knowledge.version.create", "knowledge.trust.update", "reflection.read", "reflection.generate", "reflection.approve", "worker.read", "connector.read", "connector.inspect", "operations.read", "metrics.read", "action.prepare", "action.approve", "ai.use"],
  operator: ["organization.read", "ticket.read", "worker.read", "worker.retry", "worker.cancel", "worker.pause", "connector.read", "connector.inspect", "connector.activate", "connector.pause", "connector.retry", "operations.read", "metrics.read", "action.prepare", "ai.use"],
  support_agent: ["organization.read", "ticket.read", "ticket.submit", "ticket.review", "ticket.bulk_prepare", "knowledge.read", "reflection.read", "worker.read", "connector.read", "connector.inspect", "operations.read", "ai.use"],
  viewer: readOnly
};

export function normalizeRoleKey(value: string | null | undefined): RoleKey {
  switch ((value ?? "").trim().toLowerCase()) {
    case "owner": return "owner";
    case "admin":
    case "administrator":
    case "member": return "administrator";
    case "reviewer": return "reviewer";
    case "operator": return "operator";
    case "support_agent":
    case "support agent": return "support_agent";
    case "viewer": return "viewer";
    default: return "support_agent";
  }
}

export function isCapabilityKey(value: string): value is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(value);
}
