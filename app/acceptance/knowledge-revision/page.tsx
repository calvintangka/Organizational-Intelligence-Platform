import { notFound } from "next/navigation";
import KnowledgeRevisionHarness from "./KnowledgeRevisionHarness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RSS-2.8-FINAL acceptance-only surface. It is absent unless an operator
 * explicitly enables the harness for a controlled browser run.
 */
export default function KnowledgeRevisionAcceptancePage() {
  if (process.env.OIP_ENABLE_KNOWLEDGE_CONCURRENCY_HARNESS !== "1") notFound();
  return <KnowledgeRevisionHarness />;
}
