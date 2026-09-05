const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CodexExecutor } = require("../electron/codex-executor.cjs");

function fixture({ badRoute = false, fail = false, missingHistory = false, pendingTurn = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-rpc-"));
  const child = new EventEmitter(); Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill() { child.exitCode = 0; return true; } });
  const events = []; const requests = [];
  const emit = obj => child.stdout.write(JSON.stringify(obj) + "\n");
  let buffer = "";
  child.stdin.on("data", chunk => {
    buffer += chunk.toString();
    for (;;) {
      const split = buffer.indexOf("\n"); if (split < 0) break;
      const msg = JSON.parse(buffer.slice(0, split)); buffer = buffer.slice(split + 1); requests.push(msg);
      queueMicrotask(() => {
        if (msg.method === "initialize") emit({ id: msg.id, result: { userAgent: "test" } });
        if (msg.method === "config/read") emit({ id: msg.id, result: { config: { model_provider: "chat2codex_api", model_providers: { chat2codex_api: { base_url: badRoute ? "http://127.0.0.1:17841/v1" : "https://api.openai.com/v1", env_key: "CHAT2CODEX_EXECUTOR_API_KEY" } } } } });
        if (msg.method === "thread/resume" && missingHistory) emit({ id: msg.id, error: { message: "no rollout found for thread id old" } });
        else if (["thread/start", "thread/resume"].includes(msg.method)) emit({ id: msg.id, result: { thread: { id: "thread" } } });
        if (msg.method === "turn/start") {
          if (fail) { child.emit("exit", 1); return; }
          if (pendingTurn) { emit({ id: msg.id, result: { turn: { id: "turn" } } }); return; }
          // A completion notification can race ahead of the request response.
          emit({ method: "item/completed", params: { threadId: "thread", turnId: "turn", item: { type: "agentMessage", text: "中文完整输出" } } });
          emit({ method: "item/completed", params: { threadId: "thread", turnId: "stale-previous-turn", item: { type: "agentMessage", text: "stale output must not replace the current report" } } });
          emit({ method: "turn/completed", params: { threadId: "unrelated", turn: { id: "wrong", status: "failed" } } });
          emit({ method: "turn/completed", params: { threadId: "thread", turn: { id: "stale-previous-turn", status: "failed" } } });
          emit({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed" } } });
          emit({ id: msg.id, result: { turn: { id: "turn" } } });
        }
        if (msg.method === "turn/interrupt") emit({ id: msg.id, result: {} });
      });
    }
  });
  const client = new CodexExecutor({ home, cwd: home, executable: process.execPath, apiKey: "test-key", spawnProcess: () => child, onEvent: e => events.push(e) });
  return { home, client, child, events, requests, emit, async close() { await client.close(); fs.rmSync(home, { recursive: true, force: true }); } };
}
test("RPC handshake validates isolation and tolerates completion before start response", async () => {
  const f = fixture();
  try { await f.client.initialize(); const result = await f.client.run({ cwd: f.home, model: "test-model", prompt: "test", onThread() {} }); assert.equal(result.status, "completed"); assert.equal(result.id, "turn"); assert.equal(f.events.find(e => e.method === "item/completed").params.item.text, "中文完整输出"); }
  finally { await f.close(); }
});
test("late item events from an earlier turn cannot enter the current report", async () => {
  const f = fixture();
  try {
    await f.client.initialize();
    await f.client.run({ cwd: f.home, model: "test", prompt: "test", onThread() {} });
    assert.deepEqual(f.events.filter(e => e.method === "item/completed").map(e => e.params.item.text), ["中文完整输出"]);
    assert.equal(f.requests.find(r => r.method === "initialize").params.clientInfo.version, require("../package.json").version);
  } finally { await f.close(); }
});
test("concurrent stop and cleanup share one interrupt and settle the running turn", async () => {
  const f = fixture({ pendingTurn: true });
  try {
    await f.client.initialize();
    const running = f.client.run({ cwd: f.home, model: "test", prompt: "test", onThread() {} });
    const rejected = assert.rejects(running, /stopped/);
    while (!f.client.turn?.id) await new Promise(resolve => setImmediate(resolve));
    const first = f.client.close(); const second = f.client.close();
    assert.equal(first, second);
    await Promise.all([first, second, rejected]);
    assert.equal(f.requests.filter(r => r.method === "turn/interrupt").length, 1);
  } finally { await f.close(); }
});
test("effective project route cannot point the executor back to the bridge", async () => {
  const f = fixture({ badRoute: true }); try { await assert.rejects(f.client.initialize(), /isolation/); assert.equal(f.requests.some(r => r.method === "turn/start"), false); } finally { await f.close(); }
});
test("process exit during turn/start rejects promptly without an unhandled completion", async () => {
  const f = fixture({ fail: true }); try { await f.client.initialize(); await assert.rejects(f.client.run({ cwd: f.home, model: "test", prompt: "test", onThread() {} }), /exited/); } finally { await f.close(); }
});
test("approval requests require an explicit response; unknown interaction is rejected", async () => {
  const f = fixture();
  try {
    await f.client.initialize();
    f.emit({ id: 900, method: "item/commandExecution/requestApproval", params: { command: "npm test" } });
    assert.equal(f.events.at(-1).type, "approval"); assert.equal(f.requests.some(r => r.id === 900), false);
    f.client.approve(900, "decline"); assert.deepEqual(f.requests.at(-1), { id: 900, result: { decision: "decline" } });
    f.emit({ id: 901, method: "unsupported/interaction", params: {} }); assert.equal(f.requests.at(-1).error.code, -32601);
    assert.throws(() => f.client.approve(900, "allow-everything"), /Invalid/);
  } finally { await f.close(); }
});
test("missing rollout can start a recovery thread only after explicit recovery", async () => {
  const f = fixture({ missingHistory: true });
  try {
    await f.client.initialize();
    await assert.rejects(f.client.run({ threadId: "old", cwd: f.home, model: "test", prompt: "inspect", onThread() {} }), /no rollout/);
    assert.equal(f.requests.some(r => r.method === "thread/start"), false);
    let recovered = false;
    const result = await f.client.run({ threadId: "old", cwd: f.home, model: "test", prompt: "inspect", recoverMissingHistory: true, onThread() {}, onHistoryMissing() { recovered = true; } });
    assert.equal(result.status, "completed"); assert.equal(recovered, true);
  } finally { await f.close(); }
});
