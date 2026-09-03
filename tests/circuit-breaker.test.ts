import { describe, expect, test } from "bun:test";
import { CircuitBreaker } from "../src/hybrid";

describe("per-model circuit breaker", () => {
  test("moves closed to open to half-open and closes after success", () => {
    const breaker = new CircuitBreaker({
      rateLimitCooldownMs: 120_000,
      quotaCooldownMs: 900_000,
      transientCooldownMs: 30_000,
    });
    expect(breaker.acquire("extra-high", 1_000)).toEqual({ allowed: true, state: "closed" });
    breaker.recordFailure("extra-high", "rate_limit", 1_000);
    expect(breaker.acquire("extra-high", 120_999)).toEqual({ allowed: false, state: "open" });
    expect(breaker.acquire("extra-high", 121_000)).toEqual({ allowed: true, state: "half-open" });
    expect(breaker.acquire("extra-high", 121_001)).toEqual({ allowed: false, state: "half-open" });
    breaker.recordSuccess("extra-high");
    expect(breaker.snapshot("extra-high")).toEqual({ state: "closed" });
  });

  test("honors an explicit allowance reset time", () => {
    const breaker = new CircuitBreaker({
      rateLimitCooldownMs: 1,
      quotaCooldownMs: 1,
      transientCooldownMs: 1,
    });
    breaker.recordFailure("pro", "quota_exhausted", 100, 10_000);
    expect(breaker.acquire("pro", 9_999).allowed).toBe(false);
    expect(breaker.acquire("pro", 10_000)).toEqual({ allowed: true, state: "half-open" });
  });
});
