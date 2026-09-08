import type { KnowledgeItem, KnowledgeMatch } from "@/types";

/**
 * Rebind retrieval matches to the current organization-scoped Memory
 * collection before rendering them. Match scores and retrieval evidence stay
 * attached to the historical selection; only the displayed Memory snapshot is
 * refreshed by stable KnowledgeItem identity. Retrieval normalisation may
 * expose canonicalProblemId as `item.id`, so both durable identities are
 * indexed before rebinding.
 */
export function projectCurrentKnowledgeMatches(
  matches: KnowledgeMatch[],
  currentItems: KnowledgeItem[]
): KnowledgeMatch[] {
  if (matches.length === 0 || currentItems.length === 0) return matches;
  const currentByIdentity = new Map<string, KnowledgeItem>();
  for (const item of currentItems) {
    currentByIdentity.set(item.id, item);
    if (item.canonicalProblemId) currentByIdentity.set(item.canonicalProblemId, item);
  }
  return matches.map((match) => {
    const current =
      currentByIdentity.get(match.item.id) ??
      (match.item.canonicalProblemId ? currentByIdentity.get(match.item.canonicalProblemId) : undefined);
    return current ? { ...match, item: current } : match;
  });
}
