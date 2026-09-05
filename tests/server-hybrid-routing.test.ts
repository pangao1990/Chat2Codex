import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderAdapter } from "../src/adapters/base";
import { defaultConfig } from "../src/config";
import { createHybridResponseHandler } from "../src/server";
import { UsageLedger } from "../src/usage/ledger";

function webRequest(): Request {
  return new Request("http://127.0.0.1:17841/v1/responses", {
    method: "POST",
    headers: {
      authorization: "Bearer codex-session-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "chatgpt-web/high",
      stream: false,
      input: [{ role: "user", content: "hello" }],
    }),
  });
}

test("a ChatGPT failure opens the circuit and the next whole turn uses Native Codex", async () => {
  const config = defaultConfig("browser-only");
  let webTurns = 0;
  let nativeModel = "";
  const adapterFactory = (): ProviderAdapter => ({
    name: "chatgpt-web",
    async runTurn(_request, _context, emit) {
      webTurns += 1;
      emit({
        type: "error",
        status: 429,
        code: "rate_limit_exceeded",
        message: "ChatGPT rate limit reached",
      });
    },
  });
  const handler = createHybridResponseHandler(config, adapterFactory, {
    fetchNative: async request => {
      nativeModel = ((await request.json()) as { model: string }).model;
      return new Response("native response", { status: 200 });
    },
  });

  const failedWeb = await handler(webRequest());
  expect(failedWeb.status).toBe(200);
  expect(webTurns).toBe(1);

  const native = await handler(webRequest());
  expect(native.status).toBe(200);
  expect(native.headers.get("x-chat2codex-route")).toBe("codex-native;circuit-open");
  expect(await native.text()).toBe("native response");
  expect(nativeModel).toBe("gpt-5.6-sol");
  expect(webTurns).toBe(1);
});

test("codex-only mode sends the whole turn directly to Native Codex", async () => {
  const config = defaultConfig("browser-only");
  config.hybrid.mode = "codex-only";
  config.hybrid.fallback.enabled = false;
  let webTurns = 0;
  let nativeModel = "";
  const handler = createHybridResponseHandler(config, () => ({
    name: "chatgpt-web",
    async runTurn() {
      webTurns += 1;
    },
  }), {
    fetchNative: async request => {
      nativeModel = ((await request.json()) as { model: string }).model;
      return new Response("native only", { status: 200 });
    },
  });

  const response = await handler(webRequest());
  expect(response.status).toBe(200);
  expect(response.headers.get("x-chat2codex-route")).toBe("codex-native;codex-only");
  expect(await response.text()).toBe("native only");
  expect(nativeModel).toBe("gpt-5.6-sol");
  expect(webTurns).toBe(0);
});

test("completed Web turns are recorded while native turns are not", async () => {
  const root = mkdtempSync(join(tmpdir(), "chat2codex-web-usage-"));
  try {
    const ledger = new UsageLedger(join(root, "usage.json"));
    const config = defaultConfig("browser-only");
    const handler = createHybridResponseHandler(config, () => ({
      name: "chatgpt-web",
      async runTurn(_request, _context, emit) {
        emit({ type: "text_delta", text: "done" });
        emit({
          type: "done",
          usage: { inputTokens: 1_000, outputTokens: 200, totalTokens: 1_200, estimated: true },
        });
      },
    }), { usageLedger: ledger });

    const response = await handler(webRequest());
    expect(response.status).toBe(200);
    expect((await response.json() as { status: string }).status).toBe("completed");
    expect(ledger.summary().lifetime).toEqual({
      turns: 1,
      inputTokens: 1_000,
      outputTokens: 200,
      totalTokens: 1_200,
      estimatedSavingsUsd: 0.008,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("usage persistence failure preserves completed responses and circuit health", async () => {
  const root = mkdtempSync(join(tmpdir(), "chat2codex-usage-failure-"));
  try {
    const ledger = new UsageLedger(join(root, "usage.json"));
    ledger.record = () => { throw new Error("disk unavailable"); };
    let nativeTurns = 0;
    const handler = createHybridResponseHandler(defaultConfig("browser-only"), () => ({
      name: "chatgpt-web",
      async runTurn(_request, _context, emit) {
        emit({ type: "text_delta", text: "Task completed" });
        emit({ type: "done", usage: { inputTokens: 100, outputTokens: 20 } });
      },
    }), {
      usageLedger: ledger,
      fetchNative: async () => { nativeTurns += 1; return new Response("unexpected fallback"); },
    });
    for (let turn = 0; turn < 2; turn++) {
      const response = await handler(webRequest());
      const body = await response.json() as { status: string };
      expect(body.status).toBe("completed");
      expect(JSON.stringify(body)).toContain("Task completed");
    }
    expect(nativeTurns).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
