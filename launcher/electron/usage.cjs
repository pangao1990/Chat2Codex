const fs = require("node:fs");
const path = require("node:path");
const { writePrivateFileAtomic } = require("./atomic-file.cjs");

const USAGE_PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing";
const USAGE_PRICING_AS_OF = "2026-09-03";
const USAGE_PRICING_BASIS = "standard-short-context";
const USAGE_HISTORY_DAYS = 90;
const PRICES_PER_MILLION = Object.freeze({
  "gpt-5.6-sol": Object.freeze({ input: 4, output: 20 }),
  "gpt-5.6-luna": Object.freeze({ input: 0.2, output: 1.2 }),
});
const EMPTY_TOTALS = Object.freeze({
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedSavingsUsd: 0,
});

function emptyTotals() {
  return { ...EMPTY_TOTALS };
}

function localDate(now) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTotals(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Number.isSafeInteger(value.turns) || value.turns < 0) return null;
  for (const key of ["inputTokens", "outputTokens", "totalTokens"]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return null;
  }
  if (typeof value.estimatedSavingsUsd !== "number"
    || !Number.isFinite(value.estimatedSavingsUsd)
    || value.estimatedSavingsUsd < 0) return null;
  return {
    turns: value.turns,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
    estimatedSavingsUsd: value.estimatedSavingsUsd,
    ...(Number.isSafeInteger(value.unpricedTurns) && value.unpricedTurns > 0 ? { unpricedTurns: value.unpricedTurns } : {}),
  };
}

function readStored(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const lifetime = normalizeTotals(parsed?.lifetime);
    if (parsed?.version !== 1 || !Array.isArray(parsed.days) || !lifetime) throw new Error("invalid ledger");
    const days = parsed.days.flatMap(candidate => {
      const totals = normalizeTotals(candidate);
      return totals && typeof candidate?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.date)
        ? [{ date: candidate.date, ...totals }]
        : [];
    }).sort((left, right) => left.date.localeCompare(right.date)).slice(-USAGE_HISTORY_DAYS);
    return { version: 1, days, lifetime };
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, days: [], lifetime: emptyTotals() };
    throw new Error("Usage history is unreadable. Original file preserved; restore it or reset estimates explicitly.");
  }
}

function addTotals(left, right) {
  return {
    turns: left.turns + right.turns,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    estimatedSavingsUsd: Number((left.estimatedSavingsUsd + right.estimatedSavingsUsd).toFixed(9)),
    ...((left.unpricedTurns || right.unpricedTurns) ? { unpricedTurns: (left.unpricedTurns || 0) + (right.unpricedTurns || 0) } : {}),
  };
}

function usageSummary(filePath, now = new Date()) {
  const stored = readStored(filePath);
  const todayDate = localDate(now);
  const recent = new Set();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    recent.add(localDate(date));
  }
  const todayRecord = stored.days.find(day => day.date === todayDate);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    estimated: true,
    pricing: {
      currency: "USD",
      basis: USAGE_PRICING_BASIS,
      asOf: USAGE_PRICING_AS_OF,
      source: USAGE_PRICING_SOURCE,
      pricesPerMillionTokens: PRICES_PER_MILLION,
    },
    today: todayRecord ? normalizeTotals(todayRecord) : emptyTotals(),
    last7Days: stored.days.filter(day => recent.has(day.date)).reduce(addTotals, emptyTotals()),
    lifetime: { ...stored.lifetime },
    days: stored.days.map(day => ({ ...day })),
  };
}

function resetUsage(filePath, now = new Date()) {
  try { readStored(filePath); } catch { if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.corrupt-${Date.now()}`); }
  writePrivateFileAtomic(filePath, `${JSON.stringify({ version: 1, days: [], lifetime: emptyTotals() }, null, 2)}\n`);
  return usageSummary(filePath, now);
}

async function resetRuntimeUsage(supervisor, filePath) {
  const config = supervisor?.readConfig();
  if (!config) return resetUsage(filePath);
  // The daemon owns an in-memory ledger. Overwriting its file after a failed
  // control request would report success, then resurrect the old totals.
  const result = await supervisor.control(config, "usage/reset");
  if (result?.usage_summary?.version !== 1 || !normalizeTotals(result.usage_summary.lifetime)) {
    throw new Error("The runtime did not confirm the usage reset. Restart the runtime and retry.");
  }
  return result.usage_summary;
}

function exportUsageSummary(summary, destinationPath) {
  const destination = path.resolve(destinationPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.writeFileSync(destination, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(destination, 0o600);
  return destination;
}

module.exports = {
  USAGE_PRICING_AS_OF,
  USAGE_PRICING_BASIS,
  USAGE_PRICING_SOURCE,
  exportUsageSummary,
  resetUsage,
  resetRuntimeUsage,
  usageSummary,
};
