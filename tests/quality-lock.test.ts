import { describe, expect, test } from "bun:test";
import { enforceQualityLock } from "../src/hybrid";

describe("quality lock", () => {
  test("keeps the exact requested ChatGPT quality when available", () => {
    expect(enforceQualityLock({
      requested: "extra-high",
      available: ["instant", "medium", "high", "extra-high"],
      qualityLock: true,
      allowQualityDowngrade: false,
      fallbackAvailable: true,
    })).toMatchObject({ provider: "chatgpt-web", selected: "extra-high", reason: "exact_quality" });
  });

  test("moves to Native Codex instead of silently degrading", () => {
    expect(enforceQualityLock({
      requested: "extra-high",
      available: ["instant", "medium", "high"],
      qualityLock: true,
      allowQualityDowngrade: false,
      fallbackAvailable: true,
    })).toEqual({
      allowed: true,
      provider: "codex-native",
      requested: "extra-high",
      reason: "native_fallback",
    });
  });

  test("only degrades after explicit opt-in", () => {
    expect(enforceQualityLock({
      requested: "extra-high",
      available: ["instant", "medium", "high"],
      qualityLock: true,
      allowQualityDowngrade: true,
      fallbackAvailable: true,
    })).toMatchObject({ provider: "chatgpt-web", selected: "high", reason: "quality_downgrade_allowed" });
  });
});
