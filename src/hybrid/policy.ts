import type { FailureReason } from "./config";
import { allowsAutomaticFallback } from "./failure-classifier";

export const ROUTING_POLICY = Object.freeze({
  primary: "chatgpt-web",
  fallback: "codex-native",
  neverDowngradeWhenQualityLocked: true,
  switchMidStream: false,
});

export function fallbackPolicy(reason: FailureReason): "automatic" | "blocked" {
  return allowsAutomaticFallback(reason) ? "automatic" : "blocked";
}
