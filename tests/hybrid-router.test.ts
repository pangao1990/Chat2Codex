import { describe, expect, test } from "bun:test";
import {
  DEFAULT_HYBRID_ROUTING_CONFIG,
  HybridRouter,
  TurnStateStore,
} from "../src/hybrid";

function fixture() {
  const turns = new TurnStateStore();
  turns.create("turn-1");
  const config = structuredClone(DEFAULT_HYBRID_ROUTING_CONFIG);
  const router = new HybridRouter(config, turns);
  return { config, router, turns };
}

describe("ChatGPT-first hybrid router", () => {
  test("uses ChatGPT Web as the primary provider", () => {
    const { router } = fixture();
    expect(router.routeTurn({ turnId: "turn-1", now: 1_000 })).toEqual({
      provider: "chatgpt-web",
      model: "chatgpt-web/extra-high",
      reason: "primary",
    });
  });

  test("opens the circuit after a quota failure and bypasses repeated ChatGPT attempts", () => {
    const { router } = fixture();
    expect(router.recordFailure(
      { turnId: "turn-1", now: 1_000 },
      { status: 429, message: "reasoning allowance exhausted" },
    )).toMatchObject({ provider: "codex-native", automatic: true, reason: "quota_exhausted" });
    expect(router.routeTurn({ turnId: "turn-1", now: 1_001 })).toEqual({
      provider: "codex-native",
      model: "gpt-5.6-sol",
      reason: "circuit_open",
    });
  });

  test("requires safe continuation after a completed side effect", () => {
    const { router, turns } = fixture();
    turns.beginToolCall("turn-1", {
      callId: "call-1",
      toolName: "apply_patch",
      arguments: { patch: "example" },
      sideEffect: true,
    });
    turns.completeToolCall("turn-1", "call-1", { ok: true });
    expect(router.recordFailure(
      { turnId: "turn-1", now: 2_000 },
      { status: 429, message: "rate limited" },
    )).toMatchObject({
      provider: "codex-native",
      automatic: false,
      continuationRequired: true,
    });
    expect(turns.get("turn-1")?.fallbackPending).toBe(true);
  });

  test("never falls back on safety refusal or user cancellation", () => {
    const { router } = fixture();
    expect(router.recordFailure(
      { turnId: "turn-1" },
      { message: "Safety policy refusal" },
    )).toMatchObject({ provider: "none", reason: "safety_refusal" });
    expect(router.recordFailure(
      { turnId: "turn-1" },
      { message: "User cancelled the turn" },
    )).toMatchObject({ provider: "none", reason: "user_cancelled" });
  });
});
