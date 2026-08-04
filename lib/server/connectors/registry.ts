import "server-only";

import { ConnectorError, type ConnectorAdapter, type ConnectorType, isConnectorType } from "@/lib/application/connectors/types";
import { genericSignedWebhookAdapter } from "@/lib/server/connectors/genericSignedWebhookAdapter";

const adapters = new Map<ConnectorType, ConnectorAdapter>([[genericSignedWebhookAdapter.type, genericSignedWebhookAdapter]]);

export function connectorAdapter(type: string): ConnectorAdapter {
  if (!isConnectorType(type) || !adapters.has(type)) throw new ConnectorError("UNKNOWN_CONNECTOR", "The requested connector type is not supported.", 400);
  return adapters.get(type)!;
}

export function supportedConnectors() {
  return [...adapters.values()].map((adapter) => ({ type: adapter.type, version: adapter.version, capabilities: [...adapter.capabilities] }));
}
