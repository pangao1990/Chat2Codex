import type { FailureReason, HybridRoutingConfig, Provider } from "./config";
import { allowsAutomaticFallback } from "./failure-classifier";

export interface FallbackDecision {
  provider: Provider | "none";
  model?: string;
  automatic: boolean;
  continuationRequired: boolean;
  reason: FailureReason | "fallback_disabled";
}

export function decideFallback({
  config,
  reason,
  hasCompletedSideEffects,
}: {
  config: HybridRoutingConfig;
  reason: FailureReason;
  hasCompletedSideEffects: boolean;
}): FallbackDecision {
  if (!config.fallback.enabled) {
    return { provider: "none", automatic: false, continuationRequired: false, reason: "fallback_disabled" };
  }
  if (!allowsAutomaticFallback(reason)) {
    return { provider: "none", automatic: false, continuationRequired: false, reason };
  }
  return {
    provider: "codex-native",
    model: config.fallback.model,
    automatic: !hasCompletedSideEffects,
    continuationRequired: hasCompletedSideEffects,
    reason,
  };
}
