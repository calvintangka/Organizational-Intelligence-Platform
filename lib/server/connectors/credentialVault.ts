import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ConnectorCredentialMaterial } from "@/lib/application/connectors/types";

function encryptionKey(): Buffer {
  const configured = process.env.OIP_CONNECTOR_CREDENTIAL_KEY;
  if (configured) return createHash("sha256").update(configured).digest();
  if (process.env.NODE_ENV === "production") throw new Error("OIP_CONNECTOR_CREDENTIAL_KEY must be configured in production.");
  return createHash("sha256").update(process.env.OIP_CONNECTOR_DEV_SECRET_KEY ?? "oip-development-only-connector-key").digest();
}

export function encryptCredential(material: ConnectorCredentialMaterial): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(material), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptCredential(value: string): ConnectorCredentialMaterial {
  const [version, ivValue, tagValue, ciphertext] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertext) throw new Error("Connector credential material is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const material = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as ConnectorCredentialMaterial;
  if (!material.signingSecret || typeof material.signingSecret !== "string") throw new Error("Connector credential material is invalid.");
  return material;
}
