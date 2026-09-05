const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const { writePrivateFileAtomic } = require("./atomic-file.cjs");
const { CodexExecutor } = require("./codex-executor.cjs");
const { DETACH_OWNED_CHILD, stopOwnedProcessTree } = require("./process-tree.cjs");
const P = require("./task-policy.cjs");

const ACTIVE = new Set(["planning", "executing", "reviewing", "approval", "stopping"]);
const EMPTY_USAGE = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
const validContext = value => value && ["project", "revision", "changes", "diffStat"].every(k => typeof value[k] === "string") && Array.isArray(value.entries) && value.entries.every(e => typeof e === "string");
function validStoredTask(t) {
  if (!t || typeof t !== "object" || !/^[a-f0-9-]{36}$/.test(t.id) || !P.MODES.includes(t.mode) || !P.MODES.includes(t.effectiveMode)
    || typeof t.cwd !== "string" || !path.isAbsolute(t.cwd) || typeof t.prompt !== "string" || typeof t.title !== "string"
    || !["plan", "execute", "review"].includes(t.phase) || ![...ACTIVE, "queued", "interrupted", "paused", "stopped", "budget", "waiting", "review_required", "completed"].includes(t.status)
    || !Number.isSafeInteger(t.round) || t.round < 0 || !Number.isFinite(t.elapsedMs) || t.elapsedMs < 0
    || !t.usage || Object.keys(EMPTY_USAGE).some(k => !Number.isSafeInteger(t.usage[k]) || t.usage[k] < 0)
    || !t.webUsage || ["inputTokens", "outputTokens"].some(k => !Number.isSafeInteger(t.webUsage[k]) || t.webUsage[k] < 0)
    || !validContext(t.baseline) || !validContext(t.context) || !Array.isArray(t.events) || !Array.isArray(t.commands) || !Array.isArray(t.approvals)
    || (t.usageOffset && Object.keys(EMPTY_USAGE).some(k => !Number.isSafeInteger(t.usageOffset[k]) || t.usageOffset[k] < 0))
    || (t.webUsage.unknownTurns !== undefined && (!Number.isSafeInteger(t.webUsage.unknownTurns) || t.webUsage.unknownTurns < 0))
    || (t.activeSince != null && (!Number.isSafeInteger(t.activeSince) || t.activeSince < 0))
    || ["createdAt", "updatedAt"].some(k => typeof t[k] !== "string" || !Number.isFinite(Date.parse(t[k])))
    || (t.decision && (!["codex", "chatgpt"].includes(t.decision.provider) || typeof t.decision.reason !== "string"))
    || t.approvals.some(a => !a || !["string", "number"].includes(typeof a.id) || typeof a.detail !== "string" || typeof a.method !== "string")
    || t.events.some(e => !e || typeof e.at !== "string" || typeof e.kind !== "string" || typeof e.detail !== "string")
    || t.commands.some(c => !c || typeof c.command !== "string" || typeof c.output !== "string" || (c.exitCode !== null && !Number.isInteger(c.exitCode)))) return false;
  try { P.settings(t.config); if (t.plan) P.parsePlan(JSON.stringify(t.plan)); if (t.result) parseResult(JSON.stringify(t.result)); } catch { return false; }
  return true;
}
function parseResult(text) {
  let r; try { r = JSON.parse(text); } catch { throw new Error("Codex did not return its structured report; inspect the recorded commands and changes"); }
  if (!r || !["complete", "continue", "blocked"].includes(r.status) || typeof r.summary !== "string" || typeof r.nextInstruction !== "string" || typeof r.acceptanceMet !== "boolean" || !Array.isArray(r.tests) || r.tests.some(t => typeof t.command !== "string" || !Number.isInteger(t.exitCode))) throw new Error("Invalid Codex execution report");
  return { status: r.status, acceptanceMet: r.acceptanceMet, summary: P.redact(r.summary).slice(0, 16000), nextInstruction: P.redact(r.nextInstruction).slice(0, 16000), tests: r.tests.slice(0, 50).map(t => ({command: P.redact(t.command).slice(0, 4000), exitCode: t.exitCode})) };
}
class TaskService {
  constructor({ home, safeStorage, plannerInvocation, browserReady, publish = () => {}, executorFactory = options => new CodexExecutor(options), runPlanner }) {
    this.home = home; this.file = path.join(home, "tasks.json"); this.keyFile = path.join(home, "api-key.enc");
    this.safeStorage = safeStorage; this.plannerInvocation = plannerInvocation; this.browserReady = browserReady;
    this.publish = publish; this.executorFactory = executorFactory; this.customPlanner = runPlanner; this.active = new Map(); this.shuttingDown = false;
    this.data = { version: 1, revision: 0, settings: { ...P.DEFAULT_SETTINGS }, tasks: [] }; this.loadError = null;
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || parsed.tasks.length > 200 || parsed.tasks.some(t => !validStoredTask(t))) throw new Error("Invalid task history");
        this.data = { ...parsed, settings: P.settings(parsed.settings) };
        for (const t of this.data.tasks) {
          t.config = P.settings(t.config);
          if (!(ACTIVE.has(t.status) || t.status === "queued")) continue;
          if (t.activeSince) t.elapsedMs += Math.max(0, Date.now() - t.activeSince);
          t.activeSince = null;
          t.status = "interrupted"; t.approvals = []; t.error = "Application stopped. Inspect existing changes before explicitly resuming.";
          if (t.phase === "execute") t.recovery = true;
        }
        this.save();
      }
    } catch { this.loadError = "Task history could not be read. Original file preserved; restore it from backup before starting new tasks."; }
  }
  snapshot() {
    return structuredClone({ ...this.data, keyConfigured: fs.existsSync(this.keyFile), webReady: this.browserReady(), loadError: this.loadError,
      tasks: this.data.tasks.map(t => ({ ...t, elapsedMs: t.elapsedMs + (t.activeSince ? Math.max(0, Date.now() - t.activeSince) : 0), estimatedCost: t.usageAvailable ? P.cost(t.usage, t.config) : null })) });
  }
  save() {
    if (this.loadError) throw new Error(this.loadError);
    this.data.revision = (this.data.revision || 0) + 1;
    try { writePrivateFileAtomic(this.file, JSON.stringify(this.data, null, 2) + "\n"); }
    catch (error) { this.loadError = "Task persistence failed. Original file preserved; scheduling stopped."; for (const c of this.active.values()) { c.controller.abort(); void c.executor?.close().catch(() => {}); } throw error; }
    this.publish(this.snapshot());
  }
  event(t, kind, detail) { t.updatedAt = new Date().toISOString(); t.events.push({ at: t.updatedAt, kind, detail: P.redact(detail).slice(0, 6000) }); t.events = t.events.slice(-200); this.save(); }
  configure(value) { this.data.settings = P.settings(value, this.data.settings); this.save(); return this.snapshot(); }
  setKey(value) {
    if (this.active.size) throw new Error("Stop active tasks before replacing the API key");
    if (typeof value !== "string" || !/^sk-[\w-]{12,}$/.test(value.trim())) throw new Error("Enter a valid OpenAI API key");
    if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.getSelectedStorageBackend?.() === "basic_text") throw new Error("OS credential encryption is unavailable; configure the system keyring first");
    writePrivateFileAtomic(this.keyFile, this.safeStorage.encryptString(value.trim())); this.data.revision = (this.data.revision || 0) + 1; this.publish(this.snapshot()); return this.snapshot();
  }
  removeKey() { if (this.active.size) throw new Error("Stop active tasks before removing the API key"); fs.rmSync(this.keyFile, { force: true }); this.data.revision = (this.data.revision || 0) + 1; this.publish(this.snapshot()); return this.snapshot(); }
  key() { if (!fs.existsSync(this.keyFile)) throw new Error("Configure the Codex execution API key first"); return this.safeStorage.decryptString(fs.readFileSync(this.keyFile)); }
  async check() {
    if (this.active.size) throw new Error("Wait for the active task before checking the execution connection");
    const apiKey = this.key();
    const response = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok) throw new Error(`OpenAI API connection failed (HTTP ${response.status}); check the execution key and project access`);
    const catalog = await response.json();
    if (!catalog.data?.some(m => m.id === this.data.settings.model)) throw new Error("The selected model was not found in this API account's model catalog");
    const probe = this.executorFactory({ executable: this.data.settings.executable, home: path.join(this.home, "connection-check"), cwd: this.home, apiKey });
    try { await probe.initialize(); } finally { await probe.close(); }
    return { ok: true, model: this.data.settings.model };
  }
  task(id) { const t = this.data.tasks.find(t => t.id === id); if (!t) throw new Error("Task not found"); return t; }
  async preview({ cwd, prompt }) {
    const real = P.directory(cwd);
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 30000) throw new Error("Task request must contain 1–30,000 characters");
    const info = await P.context(real);
    return { cwd: real, context: info, prompt: P.redact(prompt.trim()), route: P.route({ mode: this.data.settings.mode, prompt, webReady: this.browserReady(), contextChars: JSON.stringify(info).length }) };
  }
  async start(input) {
    if (this.shuttingDown || this.loadError) throw new Error(this.loadError || "Application is shutting down");
    this.key();
    const prepared = await this.preview(input);
    if (this.shuttingDown || this.loadError) throw new Error(this.loadError || "Application is shutting down");
    if (this.data.tasks.some(t => (ACTIVE.has(t.status) || t.status === "queued") && P.overlaps(t.cwd, prepared.cwd))) throw new Error("A task already owns this project or a parent directory");
    if (this.data.tasks.length >= 200) throw new Error("Task history is full. Delete finished tasks before starting another.");
    const config = { ...this.data.settings };
    const t = { id: randomUUID(), title: prepared.prompt.slice(0, 80), prompt: prepared.prompt, cwd: prepared.cwd, baseline: prepared.context, context: prepared.context,
      mode: config.mode, effectiveMode: config.mode, config, status: "queued", phase: "plan", round: 0, threadId: null, plan: null, result: null, decision: null,
      usage: { ...EMPTY_USAGE }, usageAvailable: false, webUsage: { inputTokens: 0, outputTokens: 0, unknownTurns: 0 }, events: [], commands: [], approvals: [], elapsedMs: 0, feedback: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.data.tasks.unshift(t); this.event(t, "queued", "Task queued. Context contains directory names and Git summary; source files are read by Codex as needed."); this.drain(); return this.snapshot();
  }
  setMode(id, mode) {
    if (!P.MODES.includes(mode)) throw new Error("Invalid analysis mode");
    const t = this.task(id); t.mode = mode; this.event(t, "strategy", ACTIVE.has(t.status) ? "Strategy saved; applies at the next phase boundary." : "Strategy saved."); return this.snapshot();
  }
  action(id, action, feedback = "") {
    const t = this.task(id); const active = this.active.get(id);
    if (action === "pause") {
      if (active) { t.pauseRequested = true; this.event(t, "pause_requested", "Will pause after the current phase."); }
      else if (t.status === "queued") { t.status = "paused"; this.event(t, "paused", "Paused before execution."); }
      else throw new Error("Task is not running");
    } else if (action === "stop") {
      if (!active && t.status !== "queued") throw new Error("Only a running or queued task can be stopped");
      if (active) { t.status = "stopping"; active.controller.abort(); void active.executor?.close().catch(() => {}); this.event(t, "stopping", "Stopping; existing changes will be preserved."); }
      else { t.status = "stopped"; this.event(t, "stopped", "Stopped; existing changes preserved."); }
    } else if (action === "resume") {
      if (active || t.status === "queued" || t.status === "completed") throw new Error("Task cannot be resumed in its current state");
      if (this.data.tasks.some(other => other.id !== id && (ACTIVE.has(other.status) || other.status === "queued") && P.overlaps(other.cwd, t.cwd))) throw new Error("Another task owns this project");
      if (typeof feedback !== "string" || feedback.length > 16000) throw new Error("Feedback exceeds limits");
      if (t.status === "review_required" && !feedback.trim()) throw new Error("Provide the remaining acceptance requirement before resuming, or accept the result");
      this.key(); t.feedback = P.redact(feedback); t.pauseRequested = false; t.error = null;
      if (t.status === "review_required") { t.phase = "plan"; t.plan = null; }
      // Resume continues the same saved budget; increasing limits is explicit in settings.
      for (const k of ["maxRounds", "maxTokens", "maxMinutes"]) t.config[k] = this.data.settings[k];
      t.status = "queued"; this.event(t, "resumed", "Explicit resume; saved thread and current working tree will be inspected."); this.drain();
    } else if (action === "accept") {
      if (active || t.status !== "review_required") throw new Error("Only a result awaiting review can be accepted");
      t.status = "completed"; this.event(t, "accepted", "User accepted the result; this is not an automated test pass.");
    } else if (action === "delete") {
      if (active || t.status === "queued") throw new Error("Stop the task before deleting its local history");
      fs.rmSync(path.join(this.home, "executors", id), { recursive: true, force: true });
      this.data.tasks = this.data.tasks.filter(v => v.id !== id); this.save();
    } else throw new Error("Unknown task action");
    return this.snapshot();
  }
  approve(id, requestId, decision) {
    const t = this.task(id); const active = this.active.get(id);
    if (!active?.executor || !t.approvals.some(a => a.id === requestId)) throw new Error("Approval has expired");
    active.executor.approve(requestId, decision); t.approvals = t.approvals.filter(a => a.id !== requestId);
    t.status = t.approvals.length ? "approval" : "executing"; this.event(t, "approval_decision", decision); return this.snapshot();
  }
  drain() {
    if (this.shuttingDown || this.active.size || this.loadError) return;
    const next = [...this.data.tasks].reverse().find(t => t.status === "queued"); if (!next) return;
    const control = { controller: new AbortController(), executor: null }; this.active.set(next.id, control);
    control.promise = this.run(next, control).catch(error => {
      next.status = control.budgetReason ? "budget" : control.controller.signal.aborted ? "stopped" : "interrupted"; next.error = control.budgetReason || P.redact(error.message);
      if (next.phase === "execute") next.recovery = true;
      this.event(next, next.status, next.error);
    }).finally(async () => {
      try { await control.executor?.close(); }
      catch (error) { this.loadError = `Executor cleanup failed. Scheduling stopped: ${P.redact(error.message)}`; this.publish(this.snapshot()); return; }
      next.approvals = []; this.active.delete(next.id); this.save(); this.drain();
    });
    // A storage failure must stop scheduling, not become an unhandled rejection or overwrite evidence.
    control.promise.catch(() => { this.loadError ||= "Task persistence failed. Scheduling stopped; inspect local task history."; this.publish(this.snapshot()); });
  }
  async planner(t, control) {
    if (!this.browserReady()) throw new Error("ChatGPT Web is unavailable. Sign in or choose Codex independent mode.");
    const prompt = P.plannerPrompt(t, t.context, t.phase === "review");
    if (prompt.length > 90000) throw new Error("Planner handoff exceeds context limit. Refine the task before resuming.");
    t.webUsage.unknownTurns = (t.webUsage.unknownTurns || 0) + 1; this.save();
    let result;
    if (this.customPlanner) result = await this.customPlanner(prompt, control.controller.signal);
    else result = await new Promise((resolve, reject) => {
      const call = this.plannerInvocation();
      const child = spawn(call.executable, call.args, { cwd: call.cwd, env: { ...process.env, ...call.env }, detached: DETACH_OWNED_CHILD, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = ""; let ended = false;
      let cleanup;
      const stop = () => { if (!cleanup) cleanup = stopOwnedProcessTree(child); return cleanup; };
      const abort = () => { void stop().catch(error => finish(error)); };
      const finish = (error, value) => {
        if (ended) return; ended = true; control.controller.signal.removeEventListener("abort", abort);
        void stop().then(() => error ? reject(error) : resolve(value), cleanupError => {
          this.loadError = `Planner cleanup failed. Scheduling stopped: ${P.redact(cleanupError.message)}`;
          reject(cleanupError);
        });
      };
      control.controller.signal.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > 300000) { abort(); finish(new Error("Planner response exceeds limit")); } });
      child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-3000); });
      child.on("error", e => finish(e)); child.stdin.on("error", e => finish(e));
      child.on("close", code => {
        if (control.controller.signal.aborted) return finish(new Error("Planner stopped"));
        const framed = stdout.split("\n").filter(l => l.startsWith("CHAT2CODEX_PLANNER_RESULT=")).at(-1);
        if (code !== 0 || !framed) return finish(new Error(P.redact(stderr) || "ChatGPT Web did not finish; inspect the browser before retrying"));
        try { finish(null, JSON.parse(framed.slice("CHAT2CODEX_PLANNER_RESULT=".length))); } catch { finish(new Error("Invalid planner transport result")); }
      });
      child.stdin.end(JSON.stringify({ prompt, effort: t.config.webEffort, descriptor: call.descriptor, traceId: `plan_${randomBytes(12).toString("hex")}` }));
      if (control.controller.signal.aborted) abort();
    });
    t.webUsage.inputTokens += result.inputTokens || 0; t.webUsage.outputTokens += result.outputTokens || 0;
    t.webUsage.unknownTurns--;
    this.save(); return P.parsePlan(result.text);
  }
  async run(t, control) {
    const started = Date.now(); const remaining = t.config.maxMinutes * 60000 - t.elapsedMs;
    if (remaining <= 0) { t.status = "budget"; this.event(t, "budget", "Time budget reached; increase limits explicitly before resuming."); return; }
    const timeout = setTimeout(() => { control.budgetReason = "Time budget reached; existing changes are preserved."; control.controller.abort(); void control.executor?.close().catch(() => {}); }, remaining);
    t.activeSince = started; this.save();
    try {
      while (!control.controller.signal.aborted) {
        if (t.pauseRequested) { t.status = "paused"; this.event(t, "paused", "Paused at phase boundary."); return; }
        if (t.usage.totalTokens >= t.config.maxTokens || (t.phase === "execute" && t.round >= t.config.maxRounds)) {
          t.status = "budget"; this.event(t, "budget", "Task budget reached. No further model request was started."); return;
        }
        t.context = await P.context(P.directory(t.cwd));
        if (control.controller.signal.aborted) break;
        if (t.pauseRequested) continue;
        t.effectiveMode = t.mode;
        if (t.phase === "plan" || t.phase === "review") {
          const review = t.phase === "review";
          t.decision = P.route({ mode: t.mode, prompt: t.prompt, round: review ? 0 : t.round, stalled: t.stalled, webReady: this.browserReady(), contextChars: JSON.stringify(t.context).length });
          // Keep a Web-planned phase's review with its planner unless the user explicitly locks Codex.
          if (review && t.mode === "auto" && t.plan && this.browserReady()) t.decision = { provider: "chatgpt", reason: "review_plan" };
          if (t.decision.provider === "chatgpt") {
            t.status = review ? "reviewing" : "planning"; this.event(t, "route", t.decision.reason);
            const plan = await this.planner(t, control);
            if (control.controller.signal.aborted) break;
            if (plan.decision === "ask") { t.plan = plan; t.status = "waiting"; this.event(t, "question", plan.summary); return; }
            if (plan.decision === "complete") {
              t.status = review && P.verified(t.result, t.commands.filter(c => c.round === t.round)) ? "completed" : "review_required";
              this.event(t, "result", plan.summary); return;
            }
            t.plan = plan;
          } else if (review && t.result?.status === "complete") {
            t.status = P.verified(t.result, t.commands.filter(c => c.round === t.round)) ? "completed" : "review_required";
            this.event(t, "result", t.result.summary); return;
          } else if (t.mode === "codex") t.plan = null;
          t.phase = "execute"; this.save(); continue;
        }
        t.status = "executing"; t.round++; this.event(t, "execute", `Execution round ${t.round}`);
        if (t.mode === "codex") t.plan = null;
        let finalText = "";
        control.executor = this.executorFactory({ executable: t.config.executable, home: path.join(this.home, "executors", t.id), cwd: t.cwd, apiKey: this.key(), onEvent: event => {
          if (event.type === "approval") {
            if (control.controller.signal.aborted) return;
            t.status = "approval"; t.approvals.push({ id: event.id, method: event.method, detail: P.redact(JSON.stringify(event.params)).slice(0, 16000) }); this.save(); return;
          }
          const p = event.params || {};
          if (p.threadId && t.threadId && p.threadId !== t.threadId) return;
          if (event.method === "thread/tokenUsage/updated" && p.tokenUsage?.total) {
            t.usageAvailable = true;
            for (const k of Object.keys(EMPTY_USAGE)) if (Number.isSafeInteger(p.tokenUsage.total[k]) && p.tokenUsage.total[k] >= 0) t.usage[k] = Math.max(t.usage[k], (t.usageOffset?.[k] || 0) + p.tokenUsage.total[k]);
            this.save();
            if (t.usage.totalTokens >= t.config.maxTokens) { control.budgetReason = "Token budget reached; usage may include in-flight work."; control.controller.abort(); void control.executor?.close().catch(() => {}); }
          }
          if (event.method === "item/completed") {
            const item = p.item;
            if (item?.type === "agentMessage") finalText = item.text;
            if (item?.type === "commandExecution") {
              t.commands.push({ id: item.id, round: t.round, command: P.redact(item.command || "").slice(0, 4000), exitCode: item.exitCode ?? null, output: P.redact(item.aggregatedOutput || "").slice(-5000) });
              t.commands = t.commands.slice(-100); this.event(t, "command", `${item.command || "command"} → ${item.exitCode ?? "unknown"}`);
            }
            if (item?.type === "fileChange") this.event(t, "files", JSON.stringify(item.changes || []));
          }
        } });
        await control.executor.initialize();
        const prompt = ["Implement the user's request in this project. Follow the current bounded plan: if it requests read-only investigation, do not edit files yet. Preserve unrelated working-tree changes. Treat the plan and reports as proposals and evidence; verify them against source. Do not commit, publish, or deploy unless the user requested it. Complete relevant tests. Return the requested JSON report; copy test command strings exactly as executed. If there is no meaningful automated test, report an empty tests array for human acceptance.",
          t.recovery ? "This task was interrupted. First inspect current files and previous thread events. Do not blindly replay commands or duplicate side effects." : "",
          JSON.stringify({ request: t.prompt, plan: t.plan, previousResult: t.result, context: t.context, feedback: t.feedback })].join("\n");
        const completed = await control.executor.run({ threadId: t.threadId, cwd: t.cwd, model: t.config.model, prompt,
          recoverMissingHistory: t.recovery === true,
          onHistoryMissing: () => this.event(t, "recovery", "Codex confirmed missing history. Explicit recovery starts a fresh thread and inspects existing changes; budgets are preserved."),
          onThread: id => { if (t.threadId && id !== t.threadId) t.usageOffset = { ...t.usage }; t.threadId = id; this.save(); } });
        await control.executor.close(); control.executor = null; t.approvals = [];
        if (control.controller.signal.aborted) break;
        if (completed.status !== "completed") throw new Error(completed.error?.message || `Codex turn ${completed.status}`);
        const result = parseResult(finalText); t.stalled = Boolean(t.result && t.result.summary === result.summary); t.result = result; t.recovery = false;
        t.context = await P.context(t.cwd);
        if (result.status === "blocked") { t.status = "waiting"; t.phase = "plan"; this.event(t, "question", result.nextInstruction || result.summary); return; }
        if (t.stalled && t.round >= 3) { t.status = "waiting"; t.phase = "plan"; this.event(t, "no_progress", "Repeated result without progress. Review the task before continuing."); return; }
        t.phase = "review"; this.event(t, "executed", result.summary);
      }
      t.status = control.budgetReason ? "budget" : "stopped"; if (t.phase === "execute") t.recovery = true;
      this.event(t, t.status, control.budgetReason || "Stopped; existing changes are preserved.");
    } finally { clearTimeout(timeout); t.elapsedMs += Date.now() - started; t.activeSince = null; this.save(); }
  }
  async shutdown() { this.shuttingDown = true; for (const c of this.active.values()) { c.controller.abort(); await c.executor?.close().catch(() => {}); } await Promise.allSettled([...this.active.values()].map(c => c.promise)); }
}
module.exports = { TaskService, parseResult };
