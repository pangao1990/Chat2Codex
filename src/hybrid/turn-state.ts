import { createHash, randomUUID } from "node:crypto";

export type ToolCallStatus = "pending" | "completed" | "failed";

export interface ToolLedgerEntry {
  callId: string;
  toolName: string;
  argsHash: string;
  status: ToolCallStatus;
  sideEffect: boolean;
  toolResult?: unknown;
}

export interface TurnState {
  turnId: string;
  entries: ToolLedgerEntry[];
  fallbackPending: boolean;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function toolArgumentsHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export class TurnStateStore {
  private readonly turns = new Map<string, TurnState>();

  create(turnId: string = randomUUID()): TurnState {
    if (this.turns.has(turnId)) throw new Error(`Turn already exists: ${turnId}`);
    const state = { turnId, entries: [], fallbackPending: false } satisfies TurnState;
    this.turns.set(turnId, state);
    return structuredClone(state);
  }

  get(turnId: string): TurnState | undefined {
    const state = this.turns.get(turnId);
    return state ? structuredClone(state) : undefined;
  }

  beginToolCall(turnId: string, input: {
    callId: string;
    toolName: string;
    arguments: unknown;
    sideEffect: boolean;
  }): ToolLedgerEntry {
    const state = this.require(turnId);
    if (state.entries.some(entry => entry.callId === input.callId)) throw new Error(`Duplicate tool call: ${input.callId}`);
    const entry: ToolLedgerEntry = {
      callId: input.callId,
      toolName: input.toolName,
      argsHash: toolArgumentsHash(input.arguments),
      status: "pending",
      sideEffect: input.sideEffect,
    };
    state.entries.push(entry);
    return structuredClone(entry);
  }

  completeToolCall(turnId: string, callId: string, toolResult: unknown): ToolLedgerEntry {
    const entry = this.requireEntry(turnId, callId);
    entry.status = "completed";
    entry.toolResult = structuredClone(toolResult);
    return structuredClone(entry);
  }

  failToolCall(turnId: string, callId: string, toolResult?: unknown): ToolLedgerEntry {
    const entry = this.requireEntry(turnId, callId);
    entry.status = "failed";
    if (toolResult !== undefined) entry.toolResult = structuredClone(toolResult);
    return structuredClone(entry);
  }

  hasCompletedSideEffects(turnId: string): boolean {
    return this.require(turnId).entries.some(entry => entry.sideEffect && entry.status === "completed");
  }

  shouldExecute(turnId: string, callId: string, toolName: string, args: unknown): boolean {
    const state = this.require(turnId);
    const hash = toolArgumentsHash(args);
    return !state.entries.some(entry => entry.callId === callId
      && entry.toolName === toolName
      && entry.argsHash === hash
      && entry.status === "completed");
  }

  markFallbackPending(turnId: string): TurnState {
    const state = this.require(turnId);
    state.fallbackPending = true;
    return structuredClone(state);
  }

  private require(turnId: string): TurnState {
    const state = this.turns.get(turnId);
    if (!state) throw new Error(`Unknown turn: ${turnId}`);
    return state;
  }

  private requireEntry(turnId: string, callId: string): ToolLedgerEntry {
    const entry = this.require(turnId).entries.find(candidate => candidate.callId === callId);
    if (!entry) throw new Error(`Unknown tool call: ${callId}`);
    return entry;
  }
}
