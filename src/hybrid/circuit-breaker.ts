import type { FailureReason, HybridRoutingConfig } from "./config";

export type CircuitState = "closed" | "open" | "half-open";

interface CircuitRecord {
  state: CircuitState;
  openedUntil: number;
  probeInFlight: boolean;
  reason?: FailureReason;
}

export interface CircuitSnapshot {
  state: CircuitState;
  openedUntil?: number;
  reason?: FailureReason;
}

export class CircuitBreaker {
  private readonly records = new Map<string, CircuitRecord>();

  constructor(private readonly cooldowns: HybridRoutingConfig["circuitBreaker"]) {}

  acquire(model: string, now = Date.now()): { allowed: boolean; state: CircuitState } {
    const record = this.records.get(model);
    if (!record) return { allowed: true, state: "closed" };
    if (record.state === "open" && now < record.openedUntil) return { allowed: false, state: "open" };
    if (record.state === "open") {
      record.state = "half-open";
      record.probeInFlight = true;
      return { allowed: true, state: "half-open" };
    }
    if (record.state === "half-open") {
      if (record.probeInFlight) return { allowed: false, state: "half-open" };
      record.probeInFlight = true;
    }
    return { allowed: true, state: record.state };
  }

  recordSuccess(model: string): void {
    this.records.delete(model);
  }

  recordFailure(model: string, reason: FailureReason, now = Date.now(), resetAt?: number): void {
    const cooldown = reason === "quota_exhausted"
      ? this.cooldowns.quotaCooldownMs
      : reason === "rate_limit"
        ? this.cooldowns.rateLimitCooldownMs
        : this.cooldowns.transientCooldownMs;
    this.records.set(model, {
      state: "open",
      openedUntil: Math.max(now + cooldown, resetAt ?? 0),
      probeInFlight: false,
      reason,
    });
  }

  snapshot(model: string, now = Date.now()): CircuitSnapshot {
    const record = this.records.get(model);
    if (!record) return { state: "closed" };
    if (record.state === "open" && now >= record.openedUntil) {
      return { state: "half-open", openedUntil: record.openedUntil, reason: record.reason };
    }
    return { state: record.state, openedUntil: record.openedUntil, reason: record.reason };
  }

  reset(model?: string): void {
    if (model) this.records.delete(model);
    else this.records.clear();
  }
}
