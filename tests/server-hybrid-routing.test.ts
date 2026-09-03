import { expect, test } from "bun:test";
import type { ProviderAdapter } from "../src/adapters/base";
import { defaultConfig } from "../src/config";
import { createHybridResponseHandler } from "../src/server";

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
