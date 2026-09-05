const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { DETACH_OWNED_CHILD, stopOwnedProcessTree } = require("./process-tree.cjs");
const { version: APP_VERSION } = require("../package.json");
const { RESULT_SCHEMA } = require("./task-policy.cjs");

function resolveExecutable(value, platform = process.platform) {
  if (platform !== "win32") {
    if (value !== "codex") return value;
    const home = os.homedir();
    const dirs = [...(process.env.PATH || "").split(path.delimiter), "/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local/bin"), path.join(home, "Library/pnpm"), path.join(home, ".local/share/pnpm")];
    const candidates = [...dirs.map(dir => path.join(dir, "codex")), "/Applications/Codex.app/Contents/Resources/codex", "/Applications/ChatGPT.app/Contents/Resources/codex"];
    return candidates.find(candidate => { try { fs.accessSync(candidate, fs.constants.X_OK); return fs.statSync(candidate).isFile(); } catch { return false; } }) || value;
  }
  if (value !== "codex" && value !== "codex.exe") {
    if (value.toLowerCase().endsWith(".exe") && fs.existsSync(value)) return value;
    throw new Error("Choose an existing native codex.exe executable");
  }
  const dirs = path.isAbsolute(value) ? [path.dirname(value)] : (process.env.PATH || process.env.Path || "").split(path.delimiter);
  const arch = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  const packageArch = process.arch === "arm64" ? "win32-arm64" : "win32-x64";
  const candidates = [value, ...dirs.flatMap(dir => [path.join(dir, "codex.exe"), path.join(dir, "node_modules", "@openai", "codex", "vendor", arch, "codex", "codex.exe"), path.join(dir, "node_modules", "@openai", `codex-${packageArch}`, "vendor", arch, "codex", "codex.exe")])];
  const found = candidates.find(candidate => candidate.toLowerCase().endsWith(".exe") && fs.existsSync(candidate));
  if (!found) throw new Error("Choose the native codex.exe executable; Windows .cmd wrappers are not executed through a shell");
  return found;
}

function executorArgs() {
  // Command-line overrides outrank project configuration. This worker must never use the Web bridge.
  const overrides = {
    model_provider: '"chat2codex_api"',
    'model_providers.chat2codex_api': '{name="OpenAI API",base_url="https://api.openai.com/v1",env_key="CHAT2CODEX_EXECUTOR_API_KEY",wire_api="responses",requires_openai_auth=false}',
    openai_base_url: '"https://api.openai.com/v1"',
    approval_policy: '"on-request"', approvals_reviewer: '"user"', sandbox_mode: '"workspace-write"',
    'shell_environment_policy.inherit': '"core"',
    'shell_environment_policy.exclude': '["*KEY*","*TOKEN*","*SECRET*","CODEX_HOME"]',
    mcp_servers: '{}',
  };
  return ["app-server", "--listen", "stdio://", ...Object.entries(overrides).flatMap(([k, v]) => ["-c", `${k}=${v}`])];
}
function executorEnvironment(home, apiKey) {
  const env = {};
  for (const key of ["PATH", "Path", "HOME", "USERPROFILE", "SystemRoot", "SYSTEMROOT", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "SHELL", "PATHEXT"]) if (process.env[key]) env[key] = process.env[key];
  return { ...env, CODEX_HOME: home, CHAT2CODEX_EXECUTOR_API_KEY: apiKey };
}
class CodexExecutor {
  constructor({ executable, home, cwd, apiKey, onEvent = () => {}, spawnProcess = spawn }) {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    this.requests = new Map(); this.sequence = 0; this.onEvent = onEvent; this.threadId = null; this.turn = null; this.closed = false;
    this.cwd = cwd;
    this.child = spawnProcess(resolveExecutable(executable), executorArgs(), { cwd, env: executorEnvironment(home, apiKey), stdio: ["pipe", "pipe", "pipe"], detached: DETACH_OWNED_CHILD, windowsHide: true });
    this.child.stdin.on("error", e => this.fail(e));
    this.child.on("error", e => this.fail(e));
    this.child.on("exit", () => this.fail(new Error("Codex process exited; inspect changes before resuming")));
    // Do not log raw stderr: SDK diagnostics can contain credential-bearing requests.
    this.child.stderr.on("data", () => {});
    let bytes = 0;
    this.child.stdout.on("data", chunk => { for (const byte of chunk) { bytes = byte === 10 ? 0 : bytes + 1; if (bytes > 16 * 1024 * 1024) { this.fail(new Error("Codex protocol line exceeded limit")); void this.close().catch(() => {}); break; } } });
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.lines.on("line", line => { try { this.message(JSON.parse(line)); } catch (e) { this.fail(e); } });
  }
  send(message) { if (this.closed) throw new Error("Codex connection is closed"); this.child.stdin.write(JSON.stringify(message) + "\n"); }
  request(method, params, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.requests.delete(id); reject(new Error(`Codex ${method} timed out; state may be uncertain`)); }, timeout);
      this.requests.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (e) { clearTimeout(timer); this.requests.delete(id); reject(e); }
    });
  }
  message(msg) {
    if (msg.id !== undefined && !msg.method) {
      const pending = this.requests.get(msg.id); if (!pending) return;
      clearTimeout(pending.timer); this.requests.delete(msg.id);
      msg.error ? pending.reject(new Error(msg.error.message || "Codex request failed")) : pending.resolve(msg.result); return;
    }
    if (msg.id !== undefined && msg.method) {
      if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(msg.method)) this.deliver({ type: "approval", id: msg.id, method: msg.method, params: msg.params });
      else this.send({ id: msg.id, error: { code: -32601, message: "Unsupported interactive request; report the blocker to the user" } });
      return;
    }
    this.deliver({ type: "event", method: msg.method, params: msg.params });
    if (msg.method === "turn/completed" && this.turn && msg.params?.threadId === this.threadId) {
      const turn = msg.params.turn;
      if (!this.turn.id) { if (this.turn.early.size < 8) this.turn.early.set(turn.id, turn); return; }
      if (this.turn.id !== turn.id) return;
      const pending = this.turn; this.turn = null; pending.resolve(turn);
    }
  }
  deliver(event) {
    if (event.params?.threadId && this.threadId && event.params.threadId !== this.threadId) return;
    if (event.method?.startsWith("item/") && event.params?.turnId) {
      if (this.turn && !this.turn.id) {
        if (this.turn.events.length >= 1000) throw new Error("Too many events before turn/start acknowledgement");
        this.turn.events.push(event); return;
      }
      if (event.params.turnId !== (this.turn?.id || this.lastTurnId)) return;
    }
    this.onEvent(event);
  }
  async initialize() {
    const result = await this.request("initialize", { clientInfo: { name: "chat2codex", version: APP_VERSION }, capabilities: { experimentalApi: false } });
    this.send({ method: "initialized", params: {} });
    const effective = await this.request("config/read", { cwd: this.cwd, includeLayers: false });
    const provider = effective.config?.model_providers?.chat2codex_api;
    if (!provider || provider.base_url !== "https://api.openai.com/v1" || provider.env_key !== "CHAT2CODEX_EXECUTOR_API_KEY" || effective.config.model_provider !== "chat2codex_api") throw new Error("Executor route isolation could not be verified");
    if (Object.values(effective.config.mcp_servers || {}).some(server => server.enabled !== false)) throw new Error("Project MCP servers must be disabled in the isolated executor configuration");
    return result;
  }
  async run({ threadId, cwd, model, prompt, onThread, recoverMissingHistory = false, onHistoryMissing = () => {} }) {
    const common = { cwd, model, modelProvider: "chat2codex_api", approvalPolicy: "on-request", sandbox: "workspace-write" };
    let result;
    try { result = await this.request(threadId ? "thread/resume" : "thread/start", { ...common, ...(threadId ? { threadId } : {}) }); }
    catch (error) {
      if (!threadId || !recoverMissingHistory || !/no rollout found for thread id/i.test(error.message)) throw error;
      onHistoryMissing();
      result = await this.request("thread/start", common);
    }
    this.threadId = result.thread.id; onThread(this.threadId);
    let resolveTurn, rejectTurn;
    const completion = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
    completion.catch(() => {});
    // Install before turn/start: completion can arrive before the request response.
    this.turn = { resolve: resolveTurn, reject: rejectTurn, id: null, early: new Map(), events: [] };
    try {
      const started = await this.request("turn/start", { threadId: this.threadId, input: [{ type: "text", text: prompt }], outputSchema: RESULT_SCHEMA });
      if (this.turn) {
        this.turn.id = started.turn.id;
        this.lastTurnId = started.turn.id;
        for (const event of this.turn.events.splice(0)) this.deliver(event);
        const early = this.turn.early.get(started.turn.id);
        if (early) { const pending = this.turn; this.turn = null; pending.resolve(early); }
      }
    } catch (error) { this.turn = null; resolveTurn({ status: "failed" }); throw error; }
    return completion;
  }
  approve(id, decision) { if (!["accept", "decline", "cancel"].includes(decision)) throw new Error("Invalid approval"); this.send({ id, result: { decision } }); }
  fail(error) {
    for (const p of this.requests.values()) { clearTimeout(p.timer); p.reject(error); } this.requests.clear();
    if (this.turn) { const p = this.turn; this.turn = null; p.reject(error); }
  }
  close() {
    if (!this.closingPromise) this.closingPromise = this.closeOnce();
    return this.closingPromise;
  }
  async closeOnce() {
    if (this.closed) return;
    if (this.turn?.id) await this.request("turn/interrupt", { threadId: this.threadId, turnId: this.turn.id }, 1500).catch(() => {});
    this.closed = true; this.lines.close(); this.fail(new Error("Codex execution stopped; existing file changes are preserved"));
    await stopOwnedProcessTree(this.child);
  }
}
module.exports = { CodexExecutor, executorArgs, executorEnvironment, resolveExecutable };
