export type Provider = "chatgpt-web" | "codex-native";

export type RoutingMode = "chatgpt-first" | "codex-only";

export type QualityTier = "instant" | "medium" | "high" | "extra-high" | "pro";

export type FailureReason =
  | "rate_limit"
  | "quota_exhausted"
  | "model_unavailable"
  | "browser_unavailable"
  | "auth_required"
  | "invalid_request"
  | "safety_refusal"
  | "user_cancelled"
  | "workspace_permission_denied"
  | "codex_sandbox_denied"
  | "unknown";

export interface HybridRoutingConfig {
  mode: RoutingMode;
  primaryProvider: "chatgpt-web";
  primaryModel: string;
  requestedQuality: QualityTier;
  qualityLock: boolean;
  allowQualityDowngrade: boolean;
  fallback: {
    enabled: boolean;
    provider: "codex-native";
    model: string;
  };
  circuitBreaker: {
    rateLimitCooldownMs: number;
    quotaCooldownMs: number;
    transientCooldownMs: number;
  };
}

export const DEFAULT_HYBRID_ROUTING_CONFIG: HybridRoutingConfig = {
  mode: "chatgpt-first",
  primaryProvider: "chatgpt-web",
  primaryModel: "chatgpt-web/extra-high",
  requestedQuality: "extra-high",
  qualityLock: true,
  allowQualityDowngrade: false,
  fallback: {
    enabled: true,
    provider: "codex-native",
    model: "gpt-5.6-sol",
  },
  circuitBreaker: {
    rateLimitCooldownMs: 120_000,
    quotaCooldownMs: 15 * 60_000,
    transientCooldownMs: 30_000,
  },
};

export function validateHybridRoutingConfig(config: HybridRoutingConfig): HybridRoutingConfig {
  if (config.mode !== "chatgpt-first" && config.mode !== "codex-only") {
    throw new Error(`Unsupported routing mode: ${String(config.mode)}`);
  }
  if (!config.primaryModel.trim()) throw new Error("Primary model is required");
  if (config.fallback.enabled && !config.fallback.model.trim()) {
    throw new Error("Native fallback model is required when fallback is enabled");
  }
  for (const [name, value] of Object.entries(config.circuitBreaker)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  }
  return structuredClone(config);
}
