export type DiagnosticsProviderId = "deepseek" | "openai-compatible" | "lmstudio" | "claude" | "deterministic";
export type DiagnosticsTestTarget = DiagnosticsProviderId | "chain";
export type DiagnosticsResult = "success" | "failed";
export type DiagnosticsStatus = "healthy" | "configured" | "idle" | "available" | "failed" | "unavailable" | "disabled" | "not_configured";

export interface DiagnosticsAttempt {
  attempt: number;
  diagnosticId?: string;
  providerId?: DiagnosticsProviderId;
  provider: string;
  model?: string;
  status: "succeeded" | "failed" | "skipped";
  latencyMs: number;
  retries: number;
  httpStatus?: number;
  reason?: string;
  failureClass?: "authentication" | "quota" | "rate_limit" | "timeout" | "network" | "provider_unavailable" | "truncated_response" | "malformed_response" | "invalid_structured_output" | "unexpected_error";
  startTime?: string;
  finishTime?: string;
  timedOut?: boolean;
  fallbackPath?: string[];
  completionLength?: number;
  jsonParseStatus?: "not_attempted" | "valid" | "invalid";
  structuredOutputValid?: boolean;
  timestamp: string;
}

export interface ProviderHealthEntry {
  id: DiagnosticsProviderId;
  label: string;
  model?: string;
  configured: boolean;
  status: DiagnosticsStatus;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  latencyMs?: number;
  lastResult?: DiagnosticsResult;
  reason?: string;
}

export interface ProviderHealthCheck {
  id: string;
  diagnosticId?: string;
  target: DiagnosticsTestTarget;
  provider: string;
  model?: string;
  result: DiagnosticsResult;
  completionStatus: "succeeded" | "failed";
  latencyMs: number;
  retries: number;
  fallbackPath: string[];
  timestamp: string;
  attempts: DiagnosticsAttempt[];
  httpStatus?: number;
  reason?: string;
}

export interface ProviderDiagnosticsSnapshot {
  aiMode: string;
  currentProvider: string;
  currentModel?: string;
  fallbackOrder: string[];
  providers: ProviderHealthEntry[];
  latest?: ProviderHealthCheck;
  history: ProviderHealthCheck[];
}
