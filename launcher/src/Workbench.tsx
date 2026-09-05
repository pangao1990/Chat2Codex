import { useEffect, useRef, useState } from "react";
import type { AnalysisMode, Language, TaskPreview, TaskSettings, TaskSnapshot } from "./types";
import { Icon } from "./icons";
import "./workbench.css";

const zh = {
  title: "从想法，到验证完成", subtitle: "GPT中定良谋，Codex下展妙手。", strategy: "分析策略", auto: "自动选择", chatgpt: "ChatGPT 规划", codex: "Codex 独立",
  autoHint: "根据任务与交接开销选择分析方式；初期基于规则，不承诺节省比例。", chatgptHint: "规划与复盘交给 ChatGPT 网页，Codex 实施并测试。网页不可用时暂停。", codexHint: "分析、实施与测试均由 Codex 完成，不向 ChatGPT 网页发送任务。",
  scope: "同时设为新任务默认值；其他任务不受影响。", pending: "下一阶段生效", newTask: "新任务", project: "项目目录", browse: "选择目录", request: "本次需要完成什么？", placeholder: "描述目标、修改范围和验收条件。可粘贴必要的背景资料。", preview: "预览发送内容", start: "开始任务", history: "任务记录", empty: "任务开始后，方案、执行记录与验证结果会显示在这里。", search: "搜索任务", all: "全部状态",
  connection: "连接与执行设置", key: "OpenAI 执行 API Key", keyHint: "系统加密保存，用于 Codex 模型推理；与旧桥接模式的 Tunnel Key 不同。", keySaved: "执行密钥已保存", saveKey: "保存密钥", removeKey: "移除密钥", removeKeyConfirm: "移除本地加密保存的执行密钥？", login: "登录 ChatGPT 网页", ready: "已登录", offline: "未登录", apiMissing: "请先配置执行 API Key", model: "Codex 执行模型", executable: "Codex 可执行文件", effort: "网页分析强度", rounds: "最大执行轮数", tokens: "Codex Token 上限", minutes: "运行时间上限（分钟）", save: "保存设置", saved: "已保存", retry: "重试",
  limits: "上限包含已经发生的用量，恢复任务不会清零。Token 通知存在延迟，可能包含超出阈值的在途用量。", privacy: "任务需求、计划与执行记录仅保存在本机，可按任务删除。网页规划会收到预览内容及后续必要的执行摘要；密钥不进入提示词。", costs: "可选：每百万 Token 单价（美元）", input: "输入", cached: "缓存输入", output: "输出", priceHint: "留空表示价格未知。单价由你填写，并在任务创建时固定；估算不代替官方账单。", unknown: "未知", usage: "Codex 用量", webUsage: "网页用量估算", estimate: "API 费用估算", elapsed: "运行时间", stage: "当前阶段", reason: "选择原因", plan: "方案与验收条件", result: "执行结果", commands: "命令与退出码", changes: "当前工作区变更", baseline: "开始前的变更", events: "任务时间线", pause: "阶段结束后暂停", stop: "停止", resume: "继续任务", feedback: "补充要求 / 对遗留问题的决定", accept: "确认验收", acceptConfirm: "确认已经审阅实际变更，并接受当前结果？这不会被记为自动测试通过。", remove: "删除本地记录", deleteConfirm: "删除此任务的本地记录与隔离执行历史？项目文件保持不变。", export: "导出任务报告", exportHint: "报告包含需求、项目名称和命令输出，分享前请检查。", approval: "Codex 请求操作权限", allow: "允许本次", deny: "拒绝", previewTitle: "将发送的上下文", previewHint: "只自动收集目录名称与 Git 概况，不上传整个仓库。执行后将按需补充摘要和命令证据。", noTests: "尚无可核对的自动测试证据，需要人工验收。", filter: "筛选状态", clearSelection: "返回新任务", inspect: "请检查已产生的修改，再决定是否继续。",
};
const en: typeof zh = {
  title: "From an idea to a verified result", subtitle: "Use ChatGPT as the brain, Codex as the hands.", strategy: "Analysis strategy", auto: "Automatic", chatgpt: "ChatGPT plans", codex: "Codex independent",
  autoHint: "Selects a route using task scope and handoff overhead. Starts with rules; savings are not guaranteed.", chatgptHint: "ChatGPT Web plans and reviews. Codex implements and tests. Pauses if Web is unavailable.", codexHint: "Codex analyzes, implements and tests. No task is sent to ChatGPT Web.",
  scope: "Also saved as the default for new tasks; other tasks are unchanged.", pending: "Applies next phase", newTask: "New task", project: "Project directory", browse: "Choose folder", request: "What should be completed?", placeholder: "Describe the outcome, scope and acceptance criteria. Paste relevant context if needed.", preview: "Preview context", start: "Start task", history: "Task history", empty: "Plans, execution evidence and verification results will appear here.", search: "Search tasks", all: "All statuses",
  connection: "Connections & execution", key: "OpenAI execution API key", keyHint: "Encrypted by the OS. Pays for Codex inference; separate from the legacy bridge's Tunnel key.", keySaved: "Execution key saved", saveKey: "Save key", removeKey: "Remove key", removeKeyConfirm: "Remove the locally encrypted execution key?", login: "Sign in to ChatGPT Web", ready: "Signed in", offline: "Signed out", apiMissing: "Configure an execution API key first", model: "Codex execution model", executable: "Codex executable", effort: "Web reasoning effort", rounds: "Maximum execution rounds", tokens: "Codex token limit", minutes: "Runtime limit (minutes)", save: "Save settings", saved: "Saved", retry: "Retry",
  limits: "Limits include prior usage; resuming does not reset them. Delayed token events can allow in-flight usage beyond the threshold.", privacy: "Requests, plans and execution records stay on this device and can be deleted per task. Web planning receives the preview and necessary result summaries; keys are excluded from prompts.", costs: "Optional: USD per million tokens", input: "Input", cached: "Cached input", output: "Output", priceHint: "Leave blank for unknown pricing. Your rates are captured when a task starts. Estimates do not replace official billing.", unknown: "Unknown", usage: "Codex tokens", webUsage: "Estimated Web tokens", estimate: "Estimated API cost", elapsed: "Runtime", stage: "Current stage", reason: "Route reason", plan: "Plan & acceptance criteria", result: "Execution result", commands: "Commands & exit codes", changes: "Current working-tree changes", baseline: "Changes before start", events: "Task timeline", pause: "Pause after phase", stop: "Stop", resume: "Resume task", feedback: "Additional requirements / decisions", accept: "Accept result", acceptConfirm: "Have you reviewed the actual changes and accepted this result? This is recorded as human acceptance, not a test pass.", remove: "Delete local history", deleteConfirm: "Delete this task's local records and isolated executor history? Project files are preserved.", export: "Export task report", exportHint: "The report includes requests, project names and command output. Review before sharing.", approval: "Codex requests permission", allow: "Allow once", deny: "Decline", previewTitle: "Context to be sent", previewHint: "Only directory names and Git metadata are collected automatically. Necessary summaries and command evidence are added after execution.", noTests: "No matching automated test evidence yet; human acceptance is required.", filter: "Filter status", clearSelection: "Back to new task", inspect: "Inspect existing changes before deciding to resume.",
};
const statuses: Record<string, [string, string]> = { queued: ["排队中", "Queued"], planning: ["ChatGPT 规划中", "Planning"], executing: ["Codex 执行中", "Executing"], reviewing: ["ChatGPT 复盘中", "Reviewing"], approval: ["等待授权", "Permission required"], paused: ["已暂停", "Paused"], waiting: ["等待你的决定", "Waiting for you"], interrupted: ["意外中断", "Interrupted"], stopping: ["正在停止", "Stopping"], stopped: ["已停止", "Stopped"], budget: ["达到预算上限", "Budget reached"], completed: ["已完成", "Completed"], review_required: ["等待人工验收", "Review required"] };
const reasons: Record<string, [string, string]> = { locked_codex: ["已锁定 Codex 独立分析", "Codex independent is locked"], locked_chatgpt: ["已锁定 ChatGPT 规划", "ChatGPT planning is locked"], web_required: ["需要先登录 ChatGPT 网页", "ChatGPT Web sign-in required"], web_unavailable: ["网页不可用，直接使用 Codex", "Web unavailable; using Codex"], handoff_large: ["交接上下文较大，保留 Codex 上下文", "Large handoff; retain Codex context"], reconsider: ["连续执行没有进展，需要重新分析", "No progress; reconsider the approach"], continue_execution: ["沿用已有执行上下文", "Continue with existing execution context"], planning_benefit: ["涉及方案权衡或较广修改范围", "Planning or broad changes benefit from review"], direct_task: ["任务可直接执行，减少交接开销", "Direct execution avoids handoff overhead"], review_plan: ["由原规划器核对阶段结果", "Planner reviews the phase result"] };
const activeStatuses = ["planning", "executing", "reviewing", "approval", "stopping"];
function readDraft(): {cwd: string; prompt: string; selected: string | null; feedback: string} {
  try {
    const d = JSON.parse(sessionStorage.getItem("chat2codex-task-draft") || "{}");
    return {cwd: typeof d.cwd === "string" ? d.cwd : "", prompt: typeof d.prompt === "string" ? d.prompt.slice(0, 30000) : "", selected: typeof d.selected === "string" ? d.selected : null, feedback: typeof d.feedback === "string" ? d.feedback.slice(0, 16000) : ""};
  } catch { return {cwd: "", prompt: "", selected: null, feedback: ""}; }
}

export function Workbench({ language, onLogin }: { language: Language; onLogin: () => void }) {
  const c = language === "zh-CN" ? zh : en; const langIndex = language === "zh-CN" ? 0 : 1;
  const api = window.codexWebLauncher!;
  const [snapshot, commitSnapshot] = useState<TaskSnapshot | null>(null);
  const setSnapshot = (next: TaskSnapshot) => commitSnapshot(previous => previous && previous.revision > next.revision ? previous : next);
  const [config, setConfig] = useState<TaskSettings | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const draft = useRef(readDraft());
  const [cwd, setCwd] = useState(draft.current.cwd); const [prompt, setPrompt] = useState(draft.current.prompt); const [key, setKey] = useState("");
  const [selected, setSelected] = useState<string | null>(draft.current.selected); const [feedback, setFeedback] = useState(draft.current.feedback);
  const [preview, setPreview] = useState<TaskPreview | null>(null); const [query, setQuery] = useState(""); const [filter, setFilter] = useState("");
  const alive = useRef(true); const pending = useRef(false);
  useEffect(() => { try { sessionStorage.setItem("chat2codex-task-draft", JSON.stringify({cwd, prompt, selected, feedback})); } catch {} }, [cwd, prompt, selected, feedback]);
  const refresh = async () => { try { const next = await api.tasks(); if (alive.current) { setSnapshot(next); setConfig(prev => prev || next.settings); } } catch (e) { if (alive.current) setError(String(e)); } };
  useEffect(() => {
    alive.current = true; void refresh();
    const off = api.onTasksChanged(next => { setSnapshot(next); });
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => { alive.current = false; off(); clearInterval(timer); };
  }, []);
  const run = async (fn: () => Promise<void>) => {
    if (pending.current) return; pending.current = true; setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const task = snapshot?.tasks.find(t => t.id === selected);
  const mode = task?.mode ?? snapshot?.settings.mode ?? "auto";
  const changeMode = (next: AnalysisMode) => void run(async () => {
    if (task) await api.taskMode(task.id, next);
    const state = await api.taskSettings({ mode: next }); setSnapshot(state); setConfig(prev => prev ? { ...prev, mode: next } : state.settings); setPreview(null);
  });
  const taskAction = (action: string) => void run(async () => {
    if (!task) return;
    if (action === "delete" && !window.confirm(c.deleteConfirm)) return;
    if (action === "accept" && !window.confirm(c.acceptConfirm)) return;
    setSnapshot(await api.taskAction(task.id, action, feedback)); if (action === "delete") setSelected(null);
  });
  const status = (value: string) => statuses[value]?.[langIndex] || value;
  const reason = (value: string) => reasons[value]?.[langIndex] || value;
  const button = (text: string, action: () => void, primary = false, disabled = false) => <button type="button" disabled={busy || disabled} className={primary ? "button-primary" : "button-secondary"} onClick={action}>{text}</button>;
  const numberField = (label: string, field: "maxRounds" | "maxTokens" | "maxMinutes" | "inputPrice" | "cachedPrice" | "outputPrice", optional = false) => <label>{label}<input type="number" min={0} step={optional ? "any" : 1} value={config?.[field] ?? ""} onChange={e => setConfig(config ? { ...config, [field]: e.target.value === "" && optional ? null : Number(e.target.value) } : null)} /></label>;
  return <div className="content-surface"><div className="content-scroll workbench-scroll">
    <header className="wb-header"><span>Chat2Codex</span><h1>{c.title}</h1><p>{c.subtitle}</p></header>
    <section className="wb-strategy" aria-label={c.strategy}>
      <div className="wb-row"><strong>{c.strategy}</strong><small>{task ? task.title : c.newTask}</small></div>
      <div className="wb-modes" role="radiogroup" aria-label={c.strategy}>
        {(["auto", "chatgpt", "codex"] as const).map((item, index, values) => <button key={item} type="button" role="radio" aria-checked={mode === item} tabIndex={mode === item ? 0 : -1} disabled={busy || !snapshot || !!snapshot.loadError} onClick={() => changeMode(item)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3; (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); changeMode(values[next]); } }}><Icon name={item === "auto" ? "activity" : item === "chatgpt" ? "browser" : "setup"} />{c[item]}{mode === item && <Icon name="check" />}</button>)}
      </div>
      <p>{c[`${mode}Hint`]}</p><small>{c.scope}{task && mode !== task.effectiveMode ? ` · ${c.pending}` : ""}</small>
    </section>
    {error && <div className="wb-alert" role="alert">{error} {button(c.retry, () => void refresh())}</div>}
    {notice && <p role="status">{notice}</p>}
    {snapshot?.loadError && <p className="wb-alert" role="alert">{snapshot.loadError}</p>}
    {!snapshot ? <p role="status">{language === "zh-CN" ? "正在读取任务…" : "Loading tasks…"}</p> : <>
      <div className="wb-status-row"><span><i data-ready={snapshot.keyConfigured} />{snapshot.keyConfigured ? c.keySaved : c.apiMissing}</span><span><i data-ready={snapshot.webReady} />ChatGPT Web · {snapshot.webReady ? c.ready : c.offline}</span>{mode !== "codex" && !snapshot.webReady && button(c.login, onLogin)}</div>
      {!task ? <section className="wb-card wb-composer">
        <label>{c.project}<div className="wb-input-row"><input aria-label={c.project} value={cwd} placeholder="/path/to/project" onChange={e => { setCwd(e.target.value); setPreview(null); }} />{button(c.browse, () => void run(async () => { const chosen = await api.taskFolder(); if (chosen) { setCwd(chosen); setPreview(null); } }))}</div></label>
        <label>{c.request}<textarea aria-label={c.request} rows={5} maxLength={30000} value={prompt} placeholder={c.placeholder} onChange={e => { setPrompt(e.target.value); setPreview(null); }} /></label>
        <div className="wb-row"><small>{prompt.length.toLocaleString()} / 30,000</small><div className="wb-actions">{button(c.preview, () => void run(async () => setPreview(await api.taskPreview({ cwd, prompt }))), false, !cwd || !prompt.trim())}{button(c.start, () => void run(async () => { const next = await api.taskStart({ cwd, prompt }); setSnapshot(next); setSelected(next.tasks[0].id); setPreview(null); }), true, !snapshot.keyConfigured || !cwd || !prompt.trim() || !!snapshot.loadError || (mode === "chatgpt" && !snapshot.webReady))}</div></div>
        {preview && <details open className="wb-details"><summary>{c.previewTitle}</summary><p>{c.previewHint}</p><p>{c.reason}: {reason(preview.route.reason)}</p><pre>{JSON.stringify({ request: preview.prompt, context: preview.context }, null, 2)}</pre></details>}
        <small>{c.privacy}</small>
      </section> : <section className="wb-card wb-task">
        <div className="wb-row"><h2>{task.title}</h2>{button(c.clearSelection, () => { setSelected(null); setFeedback(""); })}</div>
        <p className="wb-path">{task.cwd}</p><div className="wb-row"><strong className="wb-task-status" data-status={task.status}>{status(task.status)}</strong><span>{task.round} / {task.config.maxRounds}</span></div>
        {task.decision && <p>{c.reason}: {reason(task.decision.reason)}</p>}
        {task.error && <p className="wb-alert" role="alert">{task.error}<br />{c.inspect}</p>}
        <div className="wb-metrics"><div><small>{c.usage}</small><strong>{task.usageAvailable === false ? c.unknown : task.usage.totalTokens.toLocaleString()}</strong><small>{c.cached} {task.usage.cachedInputTokens.toLocaleString()}</small></div><div><small>{c.webUsage}</small><strong>{(task.webUsage.inputTokens + task.webUsage.outputTokens).toLocaleString()}</strong>{!!task.webUsage.unknownTurns && <small>{language === "zh-CN" ? "含用量未知的未完成回合" : "Includes unfinished turns with unknown usage"}</small>}</div><div><small>{c.estimate}</small><strong>{task.estimatedCost === null ? c.unknown : `$${task.estimatedCost.toFixed(4)}`}</strong></div><div><small>{c.elapsed}</small><strong>{Math.round(task.elapsedMs / 1000)}s</strong></div></div>
        <div className="wb-actions">{(activeStatuses.includes(task.status) || task.status === "queued") && <>{button(task.pauseRequested ? status("paused") + "…" : c.pause, () => taskAction("pause"), false, !!task.pauseRequested)}{button(c.stop, () => taskAction("stop"), false, task.status === "stopping")}</>}
          {!activeStatuses.includes(task.status) && !["queued", "completed"].includes(task.status) && button(c.resume, () => taskAction("resume"), true)}
          {task.status === "review_required" && button(c.accept, () => taskAction("accept"))}
          {button(c.export, () => void run(async () => { if (await api.taskExport(task.id)) setNotice(c.exportHint); }))}
          {!activeStatuses.includes(task.status) && task.status !== "queued" && button(c.remove, () => taskAction("delete"))}
        </div>
        {task.approvals.map(a => <div className="wb-approval" key={a.id}><strong>{c.approval}</strong><pre>{a.detail}</pre><div className="wb-actions">{button(c.allow, () => void run(async () => setSnapshot(await api.taskApproval(task.id, a.id, "accept"))), true)}{button(c.deny, () => void run(async () => setSnapshot(await api.taskApproval(task.id, a.id, "decline"))))}</div></div>)}
        {!activeStatuses.includes(task.status) && task.status !== "completed" && <label>{c.feedback}<textarea aria-label={c.feedback} rows={2} maxLength={16000} value={feedback} onChange={e => setFeedback(e.target.value)} /></label>}
        {task.status === "review_required" && <p>{c.noTests}</p>}
        {task.plan && <details className="wb-details" open><summary>{c.plan}</summary><p>{task.plan.summary}</p><pre>{task.plan.instruction}</pre><ul>{task.plan.acceptance.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
        {task.result && <details className="wb-details" open><summary>{c.result}</summary><p>{task.result.summary}</p><p>{task.result.nextInstruction}</p></details>}
        <details className="wb-details"><summary>{c.changes}</summary><pre>{task.context.changes || "—"}\n{task.context.diffStat}</pre><strong>{c.baseline}</strong><pre>{task.baseline.changes || "—"}</pre></details>
        <details className="wb-details"><summary>{c.commands} ({task.commands.length})</summary>{task.commands.map((cmd, i) => <div key={`${cmd.id}-${i}`}><strong>{cmd.exitCode ?? "?"} · {cmd.command}</strong><pre>{cmd.output}</pre></div>)}</details>
        <details className="wb-details" open><summary>{c.events}</summary><ol className="wb-timeline">{task.events.slice(-15).map((e, i) => <li key={i}><time>{new Date(e.at).toLocaleTimeString(language)}</time><span>{e.detail}</span></li>)}</ol></details>
      </section>}
      <details className="wb-card wb-connections" open={!snapshot.keyConfigured || undefined}>
        <summary>{c.connection}</summary><p>{c.keyHint}</p><label>{c.key}<div className="wb-input-row"><input aria-label={c.key} type="password" autoComplete="off" spellCheck={false} value={key} placeholder={snapshot.keyConfigured ? "••••••••" : "sk-…"} onChange={e => setKey(e.target.value)} />{button(c.saveKey, () => void run(async () => { setSnapshot(await api.taskKey(key)); setKey(""); setNotice(c.saved); }), false, !key.trim())}</div></label>
        {snapshot.keyConfigured && button(language === "zh-CN" ? "检查执行连接（不调用模型）" : "Check execution connection (no inference)", () => void run(async () => { const checked = await api.taskCheck(); setNotice(`${c.saved} · ${checked.model}`); }))}
        {snapshot.keyConfigured && button(c.removeKey, () => void run(async () => { if (window.confirm(c.removeKeyConfirm)) setSnapshot(await api.taskKeyRemove()); }))}
        {config && <><div className="wb-settings-grid"><label>{c.executable}<input value={config.executable} onChange={e => setConfig({ ...config, executable: e.target.value })} /></label><label>{c.model}<input value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })} /></label><label>{c.effort}<select value={config.webEffort} onChange={e => setConfig({ ...config, webEffort: e.target.value })}>{["low", "medium", "high", "xhigh", "max"].map(e => <option key={e}>{e}</option>)}</select></label>{numberField(c.rounds, "maxRounds")}{numberField(c.tokens, "maxTokens")}{numberField(c.minutes, "maxMinutes")}</div><p>{c.limits}</p><details className="wb-details"><summary>{c.costs}</summary><div className="wb-settings-grid">{numberField(c.input, "inputPrice", true)}{numberField(c.cached, "cachedPrice", true)}{numberField(c.output, "outputPrice", true)}</div><p>{c.priceHint}</p></details>{button(c.save, () => void run(async () => { const next = await api.taskSettings({ ...config, mode }); setSnapshot(next); setConfig(next.settings); setNotice(c.saved); }))}</>}
      </details>
      <section className="wb-history"><div className="wb-row"><h2>{c.history}</h2><span>{snapshot.tasks.length}</span></div><div className="wb-input-row"><input aria-label={c.search} placeholder={c.search} value={query} onChange={e => setQuery(e.target.value)} /><select aria-label={c.filter} value={filter} onChange={e => setFilter(e.target.value)}><option value="">{c.all}</option>{Object.keys(statuses).map(s => <option key={s} value={s}>{status(s)}</option>)}</select></div>
        {snapshot.tasks.length === 0 && <p className="wb-empty">{c.empty}</p>}
        {snapshot.tasks.filter(t => (!filter || t.status === filter) && `${t.title} ${t.cwd}`.toLowerCase().includes(query.toLowerCase())).map(t => <button className="wb-history-row" key={t.id} onClick={() => { setSelected(t.id); setFeedback(""); setError(""); }}><span><strong>{t.title}</strong><small>{t.cwd}</small></span><span><small>{c[t.mode]}</small><strong>{status(t.status)}</strong></span></button>)}
      </section>
    </>}
  </div></div>;
}
