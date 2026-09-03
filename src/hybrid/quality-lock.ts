import type { Provider, QualityTier } from "./config";

const QUALITY_ORDER: readonly QualityTier[] = ["instant", "medium", "high", "extra-high", "pro"];

export interface QualityDecision {
  allowed: boolean;
  provider: Provider;
  requested: QualityTier;
  selected?: QualityTier;
  reason?: "quality_locked" | "quality_downgrade_allowed" | "exact_quality" | "native_fallback";
}

export function qualityAtLeast(candidate: QualityTier, requested: QualityTier): boolean {
  return QUALITY_ORDER.indexOf(candidate) >= QUALITY_ORDER.indexOf(requested);
}

export function enforceQualityLock({
  requested,
  available,
  qualityLock,
  allowQualityDowngrade,
  fallbackAvailable,
}: {
  requested: QualityTier;
  available: readonly QualityTier[];
  qualityLock: boolean;
  allowQualityDowngrade: boolean;
  fallbackAvailable: boolean;
}): QualityDecision {
  if (available.includes(requested)) {
    return { allowed: true, provider: "chatgpt-web", requested, selected: requested, reason: "exact_quality" };
  }
  if (qualityLock && !allowQualityDowngrade) {
    return fallbackAvailable
      ? { allowed: true, provider: "codex-native", requested, reason: "native_fallback" }
      : { allowed: false, provider: "chatgpt-web", requested, reason: "quality_locked" };
  }
  const lower = [...available]
    .filter(candidate => !qualityAtLeast(candidate, requested))
    .sort((left, right) => QUALITY_ORDER.indexOf(right) - QUALITY_ORDER.indexOf(left))[0];
  return lower
    ? { allowed: true, provider: "chatgpt-web", requested, selected: lower, reason: "quality_downgrade_allowed" }
    : fallbackAvailable
      ? { allowed: true, provider: "codex-native", requested, reason: "native_fallback" }
      : { allowed: false, provider: "chatgpt-web", requested, reason: "quality_locked" };
}
