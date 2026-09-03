import { describe, expect, test } from "bun:test";
import { toolArgumentsHash, TurnStateStore } from "../src/hybrid";

describe("turn tool ledger", () => {
  test("hashes equivalent tool arguments deterministically", () => {
    expect(toolArgumentsHash({ b: 2, a: 1 })).toBe(toolArgumentsHash({ a: 1, b: 2 }));
  });

  test("prevents replay of a completed call", () => {
    const turns = new TurnStateStore();
    turns.create("turn");
    turns.beginToolCall("turn", {
      callId: "call",
      toolName: "shell",
      arguments: { command: "git status" },
      sideEffect: false,
    });
    turns.completeToolCall("turn", "call", { exitCode: 0 });
    expect(turns.shouldExecute("turn", "call", "shell", { command: "git status" })).toBe(false);
    expect(turns.shouldExecute("turn", "new-call", "shell", { command: "git status" })).toBe(true);
  });
});
