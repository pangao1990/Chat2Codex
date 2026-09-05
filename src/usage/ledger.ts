import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFile, getConfigDir } from "../config";
import type { CodexUsage } from "../types";

export const USAGE_PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing";
export const USAGE_PRICING_AS_OF = "2026-09-03";
export const USAGE_PRICING_BASIS = "standard-short-context" as const;
export const USAGE_HISTORY_DAYS = 90;

const PRICES_PER_MILLION = Object.freeze({
  "gpt-5.6-sol": Object.freeze({ input: 4, output: 20 }),
  "gpt-5.6-luna": Object.freeze({ input: 0.2, output: 1.2 }),
});

export type UsagePricingModel = keyof typeof PRICES_PER_MILLION;

export interface UsageTotals {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedSavingsUsd: number;
  unpricedTurns?: number;
}

export interface UsageDay extends UsageTotals {
  date: string;
}

export interface UsageSummary {
  version: 1;
  generatedAt: string;
  estimated: true;
  storageError?: string;
  pricing: {
    currency: "USD";
    basis: typeof USAGE_PRICING_BASIS;
    asOf: typeof USAGE_PRICING_AS_OF;
    source: typeof USAGE_PRICING_SOURCE;
    pricesPerMillionTokens: typeof PRICES_PER_MILLION;
  };
  today: UsageTotals;
  last7Days: UsageTotals;
  lifetime: UsageTotals;
  days: UsageDay[];
}

interface StoredUsage {
  version: 1;
  days: UsageDay[];
  lifetime: UsageTotals;
}

const EMPTY_TOTALS: UsageTotals = Object.freeze({
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedSavingsUsd: 0,
});

function emptyTotals(): UsageTotals {
  return { ...EMPTY_TOTALS };
}

function localDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeTotals(value: unknown): UsageTotals | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const totals = value as Partial<UsageTotals>;
  if (!Number.isSafeInteger(totals.turns) || totals.turns! < 0) return null;
  for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (!Number.isSafeInteger(totals[key]) || totals[key]! < 0) return null;
  }
  if (!finiteNonNegative(totals.estimatedSavingsUsd)) return null;
  return {
    turns: totals.turns!,
    inputTokens: totals.inputTokens!,
    outputTokens: totals.outputTokens!,
    totalTokens: totals.totalTokens!,
    estimatedSavingsUsd: totals.estimatedSavingsUsd!,
    ...(Number.isSafeInteger(totals.unpricedTurns) && totals.unpricedTurns! > 0 ? { unpricedTurns: totals.unpricedTurns } : {}),
  };
}

function readStored(path: string): StoredUsage {
  if (!existsSync(path)) return { version: 1, days: [], lifetime: emptyTotals() };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredUsage>;
    const lifetime = normalizeTotals(parsed.lifetime);
    if (parsed.version !== 1 || !Array.isArray(parsed.days) || !lifetime) throw new Error("invalid usage ledger");
    const days = parsed.days.flatMap((candidate): UsageDay[] => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const date = (candidate as Partial<UsageDay>).date;
      const totals = normalizeTotals(candidate);
      return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && totals
        ? [{ date, ...totals }]
        : [];
    });
    return { version: 1, days, lifetime };
  } catch {
    throw new Error("Usage history is unreadable. The original file is preserved; restore it or explicitly reset the estimates.");
  }
}

function addTotals(left: UsageTotals, right: UsageTotals): UsageTotals {
  return {
    turns: left.turns + right.turns,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    estimatedSavingsUsd: Number((left.estimatedSavingsUsd + right.estimatedSavingsUsd).toFixed(9)),
    ...((left.unpricedTurns || right.unpricedTurns) ? { unpricedTurns: (left.unpricedTurns || 0) + (right.unpricedTurns || 0) } : {}),
  };
}

function usageCost(model: UsagePricingModel, inputTokens: number, outputTokens: number): number {
  const price = PRICES_PER_MILLION[model];
  return Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(9));
}

function recentDateSet(now: Date, count: number): Set<string> {
  const dates = new Set<string>();
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    dates.add(localDate(date));
  }
  return dates;
}

export class UsageLedger {
  readonly path: string;
  private stored: StoredUsage;
  private storageError?: string;

  constructor(path = join(getConfigDir(), "runtime", "usage-summary.json")) {
    this.path = path;
    try { this.stored = readStored(path); }
    catch (error) { this.storageError = (error as Error).message; this.stored = { version: 1, days: [], lifetime: emptyTotals() }; }
  }

  record(model: string, usage: CodexUsage | undefined, now = new Date()): UsageSummary {
    if (this.storageError) throw new Error(this.storageError);
    if (!usage || typeof model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/.test(model) || ["constructor", "__proto__", "toString"].includes(model)) return this.summary(now);
    const priced = Object.hasOwn(PRICES_PER_MILLION, model);
    const inputTokens = Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 ? usage.inputTokens : 0;
    const outputTokens = Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0 ? usage.outputTokens : 0;
    const totalTokens = Number.isSafeInteger(usage.totalTokens) && usage.totalTokens! >= inputTokens + outputTokens
      ? usage.totalTokens!
      : inputTokens + outputTokens;
    const increment: UsageTotals = {
      turns: 1,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedSavingsUsd: priced ? usageCost(model as UsagePricingModel, inputTokens, outputTokens) : 0,
      ...(!priced ? { unpricedTurns: 1 } : {}),
    };
    const next = structuredClone(this.stored);
    const date = localDate(now);
    const day = next.days.find(candidate => candidate.date === date);
    if (day) Object.assign(day, { date, ...addTotals(day, increment) });
    else next.days.push({ date, ...increment });
    next.days.sort((left, right) => left.date.localeCompare(right.date));
    next.days = next.days.slice(-USAGE_HISTORY_DAYS);
    next.lifetime = addTotals(next.lifetime, increment);
    if (!normalizeTotals(next.lifetime) || next.days.some(day => !normalizeTotals(day))) {
      throw new Error("Usage totals exceed the supported numeric range");
    }
    this.write(next);
    return this.summary(now);
  }

  reset(now = new Date()): UsageSummary {
    if (this.storageError && existsSync(this.path)) copyFileSync(this.path, `${this.path}.corrupt-${Date.now()}`);
    this.write({ version: 1, days: [], lifetime: emptyTotals() });
    this.storageError = undefined;
    return this.summary(now);
  }

  summary(now = new Date()): UsageSummary {
    const todayDate = localDate(now);
    const recent = recentDateSet(now, 7);
    const todayRecord = this.stored.days.find(day => day.date === todayDate);
    const today = todayRecord ? normalizeTotals(todayRecord)! : emptyTotals();
    const last7Days = this.stored.days
      .filter(day => recent.has(day.date))
      .reduce(addTotals, emptyTotals());
    return {
      version: 1,
      generatedAt: now.toISOString(),
      estimated: true,
      ...(this.storageError ? { storageError: this.storageError } : {}),
      pricing: {
        currency: "USD",
        basis: USAGE_PRICING_BASIS,
        asOf: USAGE_PRICING_AS_OF,
        source: USAGE_PRICING_SOURCE,
        pricesPerMillionTokens: PRICES_PER_MILLION,
      },
      today,
      last7Days,
      lifetime: { ...this.stored.lifetime },
      days: this.stored.days.map(day => ({ ...day })),
    };
  }

  private write(next: StoredUsage): void {
    atomicWriteFile(this.path, `${JSON.stringify(next, null, 2)}\n`);
    this.stored = next;
  }
}
