import "server-only";

import { NextResponse } from "next/server";
import { ConnectorError } from "@/lib/application/connectors/types";

export function connectorErrorResponse(error: unknown): NextResponse {
  if (error instanceof ConnectorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return NextResponse.json({ error: { code: "CONNECTOR_FAILURE", message: "Connector operation could not be completed." } }, { status: 500 });
}
