const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resetUsage, resetRuntimeUsage, usageSummary } = require("../electron/usage.cjs");

test("corrupt usage never appears as zero; explicit reset keeps a recovery copy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-usage-corrupt-"));
  const file = path.join(root, "usage.json");
  try {
    fs.writeFileSync(file, "broken");
    assert.throws(() => usageSummary(file), /unreadable/);
    assert.equal(fs.readFileSync(file, "utf8"), "broken");
    resetUsage(file);
    assert.equal(usageSummary(file).lifetime.turns, 0);
    const backup = fs.readdirSync(root).find(name => name.includes(".corrupt-"));
    assert.equal(fs.readFileSync(path.join(root, backup), "utf8"), "broken");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("launcher reads the privacy-safe runtime usage ledger and can reset it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-launcher-usage-"));
  const file = path.join(root, "runtime", "usage-summary.json");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      days: [{
        date: "2026-09-03",
        turns: 2,
        inputTokens: 400,
        outputTokens: 100,
        totalTokens: 500,
        estimatedSavingsUsd: 0.0036,
      }],
      lifetime: {
        turns: 2,
        inputTokens: 400,
        outputTokens: 100,
        totalTokens: 500,
        estimatedSavingsUsd: 0.0036,
      },
    }));
    const summary = usageSummary(file, new Date(2026, 8, 3, 12));
    assert.equal(summary.today.totalTokens, 500);
    assert.equal(summary.pricing.basis, "standard-short-context");
    assert.equal(resetUsage(file, new Date(2026, 8, 3, 12)).lifetime.totalTokens, 0);
    if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o077, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a failed live reset never overwrites the daemon's persisted ledger", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-reset-failure-"));
  const file = path.join(root, "usage.json");
  try {
    fs.writeFileSync(file, "existing ledger");
    for (const control of [
      async () => { throw new Error("HTTP 503"); },
      async () => ({ status: "ok" }),
    ]) {
      await assert.rejects(resetRuntimeUsage({ readConfig: () => ({ port: 1234 }), control }, file));
      assert.equal(fs.readFileSync(file, "utf8"), "existing ledger");
    }
    const expected = usageSummary(path.join(root, "absent.json"));
    const actual = await resetRuntimeUsage({
      readConfig: () => ({ port: 1234 }),
      control: async (_config, action) => { assert.equal(action, "usage/reset"); return { usage_summary: expected }; },
    }, file);
    assert.deepEqual(actual, expected);
    assert.equal(fs.readFileSync(file, "utf8"), "existing ledger");
    assert.equal((await resetRuntimeUsage({ readConfig: () => null }, file)).lifetime.turns, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
