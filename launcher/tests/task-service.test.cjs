const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { TaskService } = require("../electron/task-service.cjs");
const P = require("../electron/task-policy.cjs");
const { executorArgs, executorEnvironment } = require("../electron/codex-executor.cjs");

const complete = { status: "complete", summary: "Implemented and tested", nextInstruction: "", acceptanceMet: true, tests: [{ command: "npm test", exitCode: 0 }] };
async function until(predicate) { const deadline = Date.now() + 5000; while (!predicate()) { if (Date.now() > deadline) throw new Error("Test condition timed out"); await new Promise(resolve => setTimeout(resolve, 5)); } }
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-task-test-"));
  const project = path.join(root, "project"); fs.mkdirSync(project);
  const counts = { executor: 0, planner: 0, prompts: [], closes: 0 };
  const factory = opts => ({
    async initialize() {},
    async run(input) {
      counts.executor++; counts.prompts.push(input.prompt); input.onThread(input.threadId || "test-thread");
      if (options.run) return options.run({ opts, input, counts, service });
      opts.onEvent({ type: "event", method: "thread/tokenUsage/updated", params: { threadId: "test-thread", tokenUsage: { total: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, reasoningOutputTokens: 10, totalTokens: 130 } } } });
      if (options.commands !== false) opts.onEvent({ type: "event", method: "item/completed", params: { item: { id: "cmd", type: "commandExecution", command: "npm test", exitCode: 0, aggregatedOutput: "All tests pass" } } });
      opts.onEvent({ type: "event", method: "item/completed", params: { item: { type: "agentMessage", text: JSON.stringify(options.result || complete) } } });
      return { status: "completed" };
    },
    approve() {}, async close() { counts.closes++; if (options.close) await options.close(); },
  });
  const dependencies = { home: path.join(root, "home"), safeStorage: { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() },
    browserReady: () => options.webReady !== false, executorFactory: factory,
    runPlanner: async (prompt, signal) => {
      counts.planner++;
      if (options.plan) return options.plan({ prompt, signal, counts, service });
      return { text: JSON.stringify(counts.planner % 2 === 1 ? { decision: "execute", summary: "Plan", instruction: "Implement and test", acceptance: ["Tests pass"] } : { decision: "complete", summary: "Reviewed", instruction: "", acceptance: [] }), inputTokens: 50, outputTokens: 20 };
    },
  };
  const service = new TaskService(dependencies);
  service.setKey("sk-test_fixture_not_a_real_credential");
  const start = async mode => { service.configure({ mode }); return (await service.start({ cwd: project, prompt: "Fix the login loading state and test" })).tasks[0].id; };
  const settle = async () => { while (service.active.size) await Promise.all([...service.active.values()].map(c => c.promise)); };
  return { service, root, project, counts, start, settle, dependencies, async cleanup() { await service.shutdown(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test("three routing modes honor hard locks and conservative handoff rules", () => {
  assert.deepEqual(P.route({ mode: "codex", prompt: "architecture", webReady: true }), { provider: "codex", reason: "locked_codex" });
  assert.equal(P.route({ mode: "chatgpt", prompt: "typo", webReady: false }).provider, "chatgpt");
  assert.equal(P.route({ mode: "auto", prompt: "typo", webReady: true }).provider, "codex");
  assert.equal(P.route({ mode: "auto", prompt: "compare architecture", webReady: true }).provider, "chatgpt");
  assert.equal(P.route({ mode: "auto", prompt: "compare architecture", webReady: true, contextChars: 50000 }).provider, "codex");
  assert.equal(P.route({ mode: "auto", prompt: "fix", webReady: true, stalled: true }).provider, "chatgpt");
});
test("invalid settings and plan contracts fail before execution", () => {
  for (const value of [{ mode: "other" }, { maxTokens: NaN }, { maxRounds: 0 }, { model: "model\nsecret" }, { inputPrice: -1 }]) assert.throws(() => P.settings(value));
  for (const value of ["not json", '{"decision":"execute"}', '{"decision":"execute","summary":"ok","instruction":"","acceptance":[]}']) assert.throws(() => P.parsePlan(value));
  assert.equal(P.parsePlan('```json\n{"decision":"ask","summary":"Question","instruction":"","acceptance":[]}\n```').decision, "ask");
});
test("Codex independent finishes without any web call or web login", async () => {
  const f = fixture({ webReady: false });
  try { await f.start("codex"); await f.settle(); assert.equal(f.counts.planner, 0); assert.equal(f.counts.executor, 1); assert.equal(f.service.snapshot().tasks[0].status, "completed"); assert.equal(f.service.snapshot().tasks[0].usage.totalTokens, 130); }
  finally { await f.cleanup(); }
});
test("locked Web planning runs plan, execution and evidence-based review", async () => {
  const f = fixture();
  try { await f.start("chatgpt"); await f.settle(); const t = f.service.snapshot().tasks[0]; assert.equal(t.status, "completed"); assert.equal(f.counts.planner, 2); assert.equal(f.counts.executor, 1); assert.equal(t.webUsage.inputTokens, 100); assert.match(f.counts.prompts[0], /Implement and test/); }
  finally { await f.cleanup(); }
});
test("locked Web never falls back on a lost session", async () => {
  const f = fixture({ webReady: false });
  try { await f.start("chatgpt"); await f.settle(); assert.equal(f.counts.executor, 0); assert.equal(f.service.snapshot().tasks[0].status, "interrupted"); }
  finally { await f.cleanup(); }
});
test("malformed planner output preserves evidence and never executes", async () => {
  const f = fixture({ plan: async () => ({ text: "unfinished response", inputTokens: 5, outputTokens: 2 }) });
  try { await f.start("chatgpt"); await f.settle(); assert.equal(f.counts.executor, 0); assert.equal(f.service.snapshot().tasks[0].webUsage.inputTokens, 5); }
  finally { await f.cleanup(); }
});
test("self-reported test success without command receipts requires review", async () => {
  const f = fixture({ commands: false });
  try { const id = await f.start("codex"); await f.settle(); assert.equal(f.service.task(id).status, "review_required"); assert.throws(() => f.service.action(id, "resume"), /acceptance/); f.service.action(id, "accept"); assert.equal(f.service.task(id).status, "completed"); }
  finally { await f.cleanup(); }
});
test("a failing latest test receipt overrides an earlier success", () => {
  assert.equal(P.verified(complete, [{ command: "npm test", exitCode: 0 }, { command: "npm test", exitCode: 1 }]), false);
  assert.equal(P.verified(complete, [{ command: "npm test", exitCode: 1 }, { command: "npm test", exitCode: 0 }]), true);
});
test("completed tasks cannot be made replayable by a stop action", async () => {
  const f = fixture();
  try {
    const id = await f.start("codex"); await f.settle();
    assert.throws(() => f.service.action(id, "stop"), /running or queued/);
    assert.equal(f.service.task(id).status, "completed");
  } finally { await f.cleanup(); }
});
test("failed process cleanup holds the queue instead of granting new workspace ownership", async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const f = fixture({ run: async () => { await held; return { status: "completed" }; }, close: async () => { throw new Error("test process still alive"); } });
  try {
    await f.start("codex"); await until(() => f.counts.executor === 1);
    const other = path.join(f.root, "other"); fs.mkdirSync(other);
    await f.service.start({ cwd: other, prompt: "second task" });
    release(); await until(() => !!f.service.loadError);
    assert.match(f.service.loadError, /cleanup failed/); assert.equal(f.counts.executor, 1);
    assert.equal(f.service.snapshot().tasks[0].status, "queued");
  } finally { release(); await f.cleanup(); }
});
test("switch and pause during planning apply at the next boundary", async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const f = fixture({ plan: async () => { await wait; return { text: JSON.stringify({ decision: "execute", summary: "plan", instruction: "test", acceptance: [] }) }; } });
  try { const id = await f.start("chatgpt"); await until(() => f.counts.planner === 1); f.service.setMode(id, "codex"); f.service.action(id, "pause"); release(); await f.settle(); assert.equal(f.counts.executor, 0); assert.equal(f.service.task(id).phase, "execute"); assert.equal(f.service.task(id).status, "paused"); f.service.action(id, "resume"); await f.settle(); assert.equal(f.counts.planner, 1); assert.equal(f.service.task(id).status, "completed"); assert.match(f.counts.prompts[0], /"plan":null/); }
  finally { release(); await f.cleanup(); }
});
test("queue prevents simultaneous ownership of parent and child project paths", async () => {
  let release; const wait = new Promise(r => { release = r; });
  const f = fixture({ plan: async () => { await wait; throw new Error("test stop"); } });
  try { await f.start("chatgpt"); await assert.rejects(() => f.service.start({ cwd: f.project, prompt: "second" }), /owns/); await assert.rejects(() => f.service.start({ cwd: f.root, prompt: "parent" }), /owns/); }
  finally { release(); await f.settle(); await f.cleanup(); }
});
test("workspace overlap checks include filesystem roots without confusing sibling prefixes", () => {
  const root = path.parse(process.cwd()).root;
  assert.equal(P.overlaps(root, path.join(root, "project")), true);
  assert.equal(P.overlaps(path.join(root, "project"), path.join(root, "project", "child")), true);
  assert.equal(P.overlaps(path.join(root, "project"), path.join(root, "project-other")), false);
});
test("persistent history restores hard mode locks and never automatically replays", async () => {
  const f = fixture();
  try { const id = await f.start("codex"); await f.settle(); const data = JSON.parse(fs.readFileSync(f.service.file)); data.tasks[0].status = "executing"; data.tasks[0].phase = "execute"; fs.writeFileSync(f.service.file, JSON.stringify(data)); const restored = new TaskService(f.dependencies); assert.equal(restored.task(id).status, "interrupted"); assert.equal(restored.task(id).recovery, true); assert.equal(restored.task(id).mode, "codex"); assert.equal(restored.active.size, 0); assert.equal(restored.task(id).threadId, "test-thread"); }
  finally { await f.cleanup(); }
});
test("corrupt task history is preserved and blocks scheduling", async () => {
  const f = fixture();
  try { fs.writeFileSync(f.service.file, "broken"); const restored = new TaskService(f.dependencies); assert.ok(restored.snapshot().loadError); await assert.rejects(() => restored.start({ cwd: f.project, prompt: "fix" }), /history/); assert.equal(fs.readFileSync(f.service.file, "utf8"), "broken"); }
  finally { await f.cleanup(); }
});
test("round budget stops continuation and is preserved across resume", async () => {
  const f = fixture({ result: { ...complete, status: "continue", nextInstruction: "More work" } });
  try { f.service.configure({ maxRounds: 1 }); const id = await f.start("codex"); await f.settle(); assert.equal(f.counts.executor, 1); assert.equal(f.service.task(id).status, "budget"); f.service.action(id, "resume"); await f.settle(); assert.equal(f.counts.executor, 1); }
  finally { await f.cleanup(); }
});
test("an in-flight token limit is recorded as budget exhaustion and blocks another turn", async () => {
  const f = fixture({ run: async ({ opts }) => {
    opts.onEvent({ type: "event", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { totalTokens: 1100 } } } });
    throw new Error("executor stopped");
  } });
  try {
    f.service.configure({ maxTokens: 1000 });
    const id = await f.start("codex"); await f.settle();
    assert.equal(f.service.task(id).status, "budget");
    assert.match(f.service.task(id).error, /Token budget/);
    f.service.action(id, "resume"); await f.settle();
    assert.equal(f.counts.executor, 1);
  } finally { await f.cleanup(); }
});
test("unknown price stays unknown; cache and reasoning tokens are not double-counted", () => {
  const usage = { inputTokens: 1000000, cachedInputTokens: 200000, outputTokens: 100000, reasoningOutputTokens: 50000, totalTokens: 1100000 };
  assert.equal(P.cost(usage, P.DEFAULT_SETTINGS), null);
  assert.equal(P.cost(usage, { inputPrice: 2, cachedPrice: 1, outputPrice: 4 }), 2.2);
});
test("executor uses isolated official API routing and excludes credentials from shell environment", () => {
  const args = executorArgs().join(" "); assert.match(args, /https:\/\/api.openai.com\/v1/); assert.match(args, /shell_environment_policy.exclude/); assert.doesNotMatch(args, /sk-/);
  const env = executorEnvironment("/isolated", "test-only-key"); assert.equal(env.CODEX_HOME, "/isolated"); assert.equal(env.CHAT2CODEX_EXECUTOR_API_KEY, "test-only-key"); assert.equal(env.OPENAI_BASE_URL, undefined); assert.equal(env.OPENAI_API_KEY, undefined);
});
test("key is not included in snapshots, task prompts or exports", async () => {
  const f = fixture();
  try { await f.start("codex"); await f.settle(); assert.doesNotMatch(JSON.stringify(f.service.snapshot()), /sk-test_fixture/); assert.doesNotMatch(fs.readFileSync(f.service.file, "utf8"), /sk-test_fixture/); assert.equal(P.redact("api_key=privatevalue"), "api_key=[redacted]"); }
  finally { await f.cleanup(); }
});
test("credential changes advance snapshot revisions to reject stale UI responses", async () => {
  const f = fixture();
  try {
    const before = f.service.snapshot();
    const removed = f.service.removeKey();
    assert.equal(removed.keyConfigured, false); assert.ok(removed.revision > before.revision);
    const saved = f.service.setKey("sk-test_fixture_not_a_real_credential");
    assert.equal(saved.keyConfigured, true); assert.ok(saved.revision > removed.revision);
  } finally { await f.cleanup(); }
});
test("stop during Web planning settles, preserves unknown usage and never executes", async () => {
  const f = fixture({ plan: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })) });
  try {
    const id = await f.start("chatgpt"); await until(() => f.counts.planner === 1);
    f.service.action(id, "stop"); await f.settle();
    assert.equal(f.service.task(id).status, "stopped"); assert.equal(f.counts.executor, 0);
    assert.equal(f.service.task(id).webUsage.unknownTurns, 1);
  } finally { await f.cleanup(); }
});
test("malformed task records cannot crash a snapshot or silently erase history", async () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.service.file, JSON.stringify({version: 1, settings: P.DEFAULT_SETTINGS, tasks: [{id: "a".repeat(36), mode: "auto", cwd: f.project, events: [], commands: []}]}));
    const original = fs.readFileSync(f.service.file, "utf8");
    const restored = new TaskService(f.dependencies);
    assert.ok(restored.snapshot().loadError); assert.equal(restored.snapshot().tasks.length, 0);
    assert.equal(fs.readFileSync(f.service.file, "utf8"), original);
  } finally { await f.cleanup(); }
});
test("malformed nested persisted fields are rejected before reaching React", async () => {
  const f = fixture();
  try {
    await f.start("codex"); await f.settle();
    const valid = JSON.parse(fs.readFileSync(f.service.file));
    for (const mutate of [t => { t.context.changes = {}; }, t => { t.approvals = [null]; }, t => { t.usageOffset = {totalTokens: -1}; }, t => { t.activeSince = "yesterday"; }]) {
      const changed = structuredClone(valid); mutate(changed.tasks[0]);
      const original = JSON.stringify(changed); fs.writeFileSync(f.service.file, original);
      const restored = new TaskService(f.dependencies);
      assert.ok(restored.snapshot().loadError); assert.equal(fs.readFileSync(f.service.file, "utf8"), original);
    }
  } finally { await f.cleanup(); }
});
test("a recovered fresh thread adds usage to the old budget instead of resetting it", async () => {
  const f = fixture({run: async ({opts, input, counts}) => {
    if (counts.executor > 1) { input.onHistoryMissing(); input.onThread("recovered-thread"); }
    opts.onEvent({type: "event", method: "thread/tokenUsage/updated", params: {tokenUsage: {total: {inputTokens:100, cachedInputTokens:20, outputTokens:30, reasoningOutputTokens:10, totalTokens:130}}}});
    opts.onEvent({type: "event", method: "item/completed", params: {item:{id:"test",type:"commandExecution",command:"npm test",exitCode:0,aggregatedOutput:"pass"}}});
    opts.onEvent({type: "event", method: "item/completed", params: {item:{type:"agentMessage",text:JSON.stringify(complete)}}});
    return {status:"completed"};
  }});
  try {
    const id = await f.start("codex"); await f.settle();
    const t = f.service.task(id); t.status = "interrupted"; t.phase = "execute"; t.recovery = true;
    f.service.action(id,"resume"); await f.settle();
    assert.equal(f.service.task(id).usage.totalTokens,260); assert.equal(f.service.task(id).round,2);
    assert.match(f.counts.prompts[1],/Do not blindly replay/);
  } finally { await f.cleanup(); }
});
