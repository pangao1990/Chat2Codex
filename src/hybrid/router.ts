import { CircuitBreaker } from "./circuit-breaker";
import type { FailureEvidence } from "./failure-classifier";
import { classifyFailure } from "./failure-classifier";
import { decideFallback, type FallbackDecision } from "./fallback";
import type { HybridRoutingConfig, Provider } from "./config";
import { validateHybridRoutingConfig } from "./config";
import type { TurnStateStore } from "./turn-state";

export interface RouteContext {
  turnId: string;
  now?: number;
}

export interface RouteDecision {
  provider: Provider | "none";
  model?: string;
  reason: "primary" | "codex_only" | "circuit_open" | "fallback_disabled";
}

export class HybridRouter {
  readonly config: HybridRoutingConfig;

  constructor(
    config: HybridRoutingConfig,
    private readonly turns: TurnStateStore,
    private readonly circuitBreaker = new CircuitBreaker(config.circuitBreaker),
  ) {
    this.config = validateHybridRoutingConfig(config);
  }

  routeTurn(context: RouteContext): RouteDecision {
    if (this.config.mode === "codex-only") {
      return { provider: "codex-native", model: this.config.fallback.model, reason: "codex_only" };
    }
    const circuit = this.circuitBreaker.acquire(this.config.primaryModel, context.now);
    if (!circuit.allowed) {
      return this.config.fallback.enabled
        ? { provider: "codex-native", model: this.config.fallback.model, reason: "circuit_open" }
        : { provider: "none", reason: "fallback_disabled" };
    }
    return { provider: "chatgpt-web", model: this.config.primaryModel, reason: "primary" };
  }

  recordSuccess(): void {
    this.circuitBreaker.recordSuccess(this.config.primaryModel);
  }

  recordFailure(context: RouteContext, evidence: FailureEvidence | Error | unknown, resetAt?: number): FallbackDecision {
    const reason = classifyFailure(evidence);
    const fallback = decideFallback({
      config: this.config,
      reason,
      hasCompletedSideEffects: this.turns.hasCompletedSideEffects(context.turnId),
    });
    if (fallback.provider === "codex-native") {
      this.circuitBreaker.recordFailure(this.config.primaryModel, reason, context.now, resetAt);
      if (fallback.continuationRequired) this.turns.markFallbackPending(context.turnId);
    }
    return fallback;
  }
}
