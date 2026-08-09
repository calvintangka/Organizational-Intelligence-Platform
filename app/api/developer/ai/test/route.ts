import { NextResponse } from "next/server";
import { AuthorizationError, requireAuthenticatedUser, requireCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { providerDiagnosticsSnapshot, runProviderHealthCheck } from "@/lib/server/developerAiDiagnostics";
import { enforceRateLimit, rateLimitResponse, requestIdentity } from "@/lib/server/rateLimit";
import type { DiagnosticsTestTarget } from "@/types/aiDiagnostics";
import type { AuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGETS = new Set<DiagnosticsTestTarget>(["deepseek", "openai-compatible", "lmstudio", "deterministic", "chain"]);

async function requireDeveloperDiagnosticsAccess(request: Request): Promise<{ user: AuthenticatedUser; organizationId: string }> {
  const user = await requireAuthenticatedUser();
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { activeOrganizationId: true } });
  if (!record?.activeOrganizationId) throw new AuthorizationError("FORBIDDEN", "An active organization is required.", 403);
  await requireCapability(record.activeOrganizationId, "operations.read", { request, resource: "developer_ai_diagnostics" });
  return { user, organizationId: record.activeOrganizationId };
}

export async function POST(request: Request) {
  try {
    const { user, organizationId } = await requireDeveloperDiagnosticsAccess(request);
    const { requestId, correlationId } = requestIdentity(request);
    const decision = await enforceRateLimit("diagnostics.user", [{ type: "user", value: user.id }], {
      route: "/api/developer/ai/test",
      organizationId,
      actorUserId: user.id,
      requestId,
      correlationId
    });
    if (!decision.allowed) return rateLimitResponse(decision);
    let body: { provider?: DiagnosticsTestTarget } = {};
    try { body = await request.json() as { provider?: DiagnosticsTestTarget }; } catch { /* default to chain below */ }
    const target = body.provider ?? "chain";
    if (!TARGETS.has(target)) return NextResponse.json({ error: { message: "Unknown diagnostics provider." } }, { status: 400 });
    const result = await runProviderHealthCheck(target);
    return NextResponse.json({ data: { result, snapshot: providerDiagnosticsSnapshot() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 503;
    return NextResponse.json({ error: { message: error instanceof AuthorizationError ? error.message : "Diagnostics test is temporarily unavailable." } }, { status });
  }
}
