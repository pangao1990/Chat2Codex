import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { UsageLedger } from "../src/usage/ledger";

const roots: string[] = [];

function ledgerPath(): string {
  const root = mkdtempSync(join(tmpdir(), "chat2codex-usage-"));
  roots.push(root);
  return join(root, "runtime", "usage-summary.json");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("privacy-safe Web usage ledger", () => {
  test("aggregates model-specific API-equivalent savings without content", () => {
    const path = ledgerPath();
    const ledger = new UsageLedger(path);
    ledger.record("gpt-5.6-sol", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      estimated: true,
    }, new Date(2026, 8, 3, 10));
    const summary = ledger.record("gpt-5.6-luna", {
      inputTokens: 500_000,
      outputTokens: 500_000,
      totalTokens: 1_000_000,
      estimated: true,
    }, new Date(2026, 8, 3, 11));

    expect(summary.today).toEqual({
      turns: 2,
      inputTokens: 1_500_000,
      outputTokens: 1_500_000,
      totalTokens: 3_000_000,
      estimatedSavingsUsd: 24.7,
    });
    expect(summary.lifetime).toEqual(summary.today);
    expect(summary.pricing.source).toBe("https://developers.openai.com/api/docs/pricing");
    const stored = readFileSync(path, "utf8");
    expect(stored).not.toContain("prompt");
    expect(stored).not.toContain("response");
    if (process.platform !== "win32") expect(statSync(path).mode & 0o077).toBe(0);
  });

  test("keeps a seven-day view, counts unpriced models, and resets safely", () => {
    const path = ledgerPath();
    const ledger = new UsageLedger(path);
    ledger.record("gpt-5.6-sol", { inputTokens: 1_000, outputTokens: 100 }, new Date(2026, 7, 20, 12));
    ledger.record("gpt-5.6-sol", { inputTokens: 2_000, outputTokens: 200 }, new Date(2026, 8, 1, 12));
    ledger.record("unknown", { inputTokens: 9_000, outputTokens: 9_000 }, new Date(2026, 8, 3, 12));
    const summary = ledger.summary(new Date(2026, 8, 3, 12));

    expect(summary.lifetime.turns).toBe(3);
    expect(summary.last7Days.turns).toBe(2);
    expect(summary.today.turns).toBe(1);
    expect(summary.today.unpricedTurns).toBe(1);
    expect(ledger.reset(new Date(2026, 8, 3, 12)).lifetime.totalTokens).toBe(0);
  });

  test("corrupt usage remains unavailable and cannot be overwritten by recording", () => {
    const path = ledgerPath();
    new UsageLedger(path).reset();
    writeFileSync(path, "not-json");
    const ledger = new UsageLedger(path);
    expect(ledger.summary().storageError).toContain("unreadable");
    expect(() => ledger.record("gpt-5.6-sol", {inputTokens: 100, outputTokens: 10})).toThrow("unreadable");
    expect(readFileSync(path, "utf8")).toBe("not-json");
    ledger.reset();
    expect(ledger.summary().storageError).toBeUndefined();
    const directory = dirname(path);
    expect(readdirSync(directory).some(name => name.includes(".corrupt-"))).toBe(true);
  });

  test("object prototype names cannot be recorded as priced models", () => {
    const ledger = new UsageLedger(ledgerPath());
    for (const model of ["constructor", "__proto__", "toString"]) {
      expect(ledger.record(model, { inputTokens: 100, outputTokens: 20 }).lifetime.turns).toBe(0);
    }
  });

  test("failed writes preserve the last committed totals for recording and reset", () => {
    const path = ledgerPath();
    const ledger = new UsageLedger(path);
    ledger.record("gpt-5.6-sol", { inputTokens: 100, outputTokens: 20 });
    const before = ledger.summary().lifetime;
    rmSync(path);
    mkdirSync(path);
    expect(() => ledger.record("gpt-5.6-sol", { inputTokens: 100, outputTokens: 20 })).toThrow();
    expect(ledger.summary().lifetime).toEqual(before);
    expect(() => ledger.reset()).toThrow();
    expect(ledger.summary().lifetime).toEqual(before);
    rmSync(path, { recursive: true });
    ledger.record("gpt-5.6-sol", { inputTokens: 100, outputTokens: 20 });
    expect(new UsageLedger(path).summary().lifetime.turns).toBe(2);
  });

  test("overflow cannot corrupt the persisted ledger", () => {
    const path = ledgerPath();
    const ledger = new UsageLedger(path);
    ledger.record("gpt-5.6-sol", { inputTokens: 100, outputTokens: 20 });
    const before = readFileSync(path, "utf8");
    expect(() => ledger.record("gpt-5.6-sol", { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 20 })).toThrow();
    expect(readFileSync(path, "utf8")).toBe(before);
  });
});
