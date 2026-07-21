import "server-only";

import { NextResponse } from "next/server";

import type { AuthenticatedUser } from "@/lib/auth";
import { requireOrganizationMembership } from "@/lib/server/authorization";
import { toSafePersistenceError, validateOrganizationId } from "@/lib/server/persistenceService";

/**
 * Resolved dynamic segments for an organization-scoped route. Every such route
 * carries `organizationId`; sub-resource routes extend this with their own
 * segments (for example `resource`).
 */
export interface OrganizationRouteParams {
  organizationId: string;
}

export interface OrganizationRouteContext<P extends OrganizationRouteParams> {
  params: Promise<P>;
}

export interface OrganizationRouteHandlerArgs<P extends OrganizationRouteParams> {
  request: Request;
  /** The validated organization id (identical to the path segment for valid ids). */
  organizationId: string;
  /** All resolved dynamic segments, including any beyond `organizationId`. */
  params: P;
  /** The authenticated, authorized member — the only trusted actor identity. */
  user: AuthenticatedUser;
}

type OrganizationRouteHandler<P extends OrganizationRouteParams> = (
  args: OrganizationRouteHandlerArgs<P>
) => Response | Promise<Response>;

/**
 * Shared infrastructure for organization-scoped API routes that persist through
 * the standard persistence service. The wrapper centralizes only the repeated
 * boundary that every such route shares: resolving `context.params`, validating
 * the organization id, enforcing membership authorization, and converting thrown
 * persistence/authorization errors into the standard `{ error: { code, message } }`
 * envelope with the correct status.
 *
 * The handler still owns everything route-specific: request parsing, payload
 * validation, the persistence operation, and the success response. A handler
 * that returns a `NextResponse` (for a 400/404/405/409 it detects itself) is
 * returned verbatim — only thrown errors reach the envelope converter, so
 * route-specific responses are never collapsed into a generic 500.
 *
 * Routes that use a different error converter (persistence-authority, migration
 * import) or a different auth shape (the collection endpoint) intentionally stay
 * explicit rather than being forced through this helper.
 */
export function withOrganizationRoute<P extends OrganizationRouteParams = OrganizationRouteParams>(
  handler: OrganizationRouteHandler<P>
): (request: Request, context: OrganizationRouteContext<P>) => Promise<Response> {
  return async (request, context) => {
    try {
      const params = await context.params;
      const organizationId = validateOrganizationId(params.organizationId);
      const { user } = await requireOrganizationMembership(organizationId);
      return await handler({ request, organizationId, params, user });
    } catch (error) {
      const safe = toSafePersistenceError(error);
      return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
    }
  };
}
