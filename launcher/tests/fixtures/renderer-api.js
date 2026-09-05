// Browser-only IPC fixture. Never imported by the application or Electron preload.
(() => {
  const listeners = new Map();
  const controls = { failSnapshot: false, failUsage: false, failStep: false, usageDelay: 0, completedUsage: 0, calls: [] };
  const state = {
    version: 1, language: "zh-CN", theme: "light", onboardingComplete: true,
    githubOpened: false, autoStart: true, keepRunningOnClose: true,
    showBrowserDuringTurns: true, taskNotifications: true, experimentalBiggerContext: false,
    biggerContextRecommendationDismissed: true, sidebarOpen: true, sidebarWidth: 252,
    browserSmokePassed: false, browserSmokeVersion: null, coreSetupComplete: false,
    codexCatalogVerified: false, mcpSetupComplete: false, mcpRuntimeInstalled: false,
    codexRestartRequired: false, mcpGuideStep: 0, sessionRefreshReminderAt: null,
  };
  const browser = {
    status: "signed-out", authenticated: false, visible: false, surfaceActive: false,
    message: "", url: "", title: "", loading: false, canGoBack: false, canGoForward: false,
    zoomFactor: 1, activeTabId: "home", maxTabs: 5, tabs: [],
  };
  const snapshot = {
    profile: "production", profilePaths: { coreHome: "/demo", codexHome: "/demo", userData: "/demo" },
    state, browser, connectorName: "Codex Native2", mcpCredentialsConfigured: false,
    logs: [
      { at: "2026-09-05T06:42:00Z", level: "info", event: "launcher.ready", detail: {} },
      { at: "2026-09-05T06:43:00Z", level: "warning", event: "runtime.connection_retry", detail: { attempt: 2 } },
      { at: "2026-09-05T06:44:00Z", level: "error", event: "runtime.connection_failed", detail: { message: "Demo connection unavailable", retryable: true, attempts: 3, recovery: "Run diagnostics and retry" } },
    ],
    urls: { github: "https://github.com/pangao1990/Chat2Codex", pricing: "https://developers.openai.com/api/docs/pricing", connectors: "https://chatgpt.com/", tunnels: "https://platform.openai.com/", keys: "https://platform.openai.com/" },
    platform: "darwin", packaged: false, version: "1.0.0", smokePassed: false,
    operation: null, update: { status: "disabled" },
  };
  const totals = { turns: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedSavingsUsd: 0 };
  let usage = { version: 1, estimated: true, generatedAt: new Date().toISOString(), pricing: { asOf: "2026-09-03", currency: "USD", basis: "standard-short-context", source: snapshot.urls.pricing, pricesPerMillionTokens: {} }, today: totals, last7Days: totals, lifetime: totals, days: [] };
  const emit = (name, value) => { for (const listener of listeners.get(name) ?? []) listener(structuredClone(value)); };
  const update = patch => { Object.assign(state, patch); emit("onStateChanged", state); return structuredClone(state); };
  const taskState = { version: 1, revision: 0, settings: {mode: "auto", executable: "codex", model: "gpt-5.6-sol", webEffort: "high", maxRounds: 4, maxTokens: 100000, maxMinutes: 45, inputPrice: null, cachedPrice: null, outputPrice: null}, tasks: [], keyConfigured: false, webReady: false, loadError: null };
  const taskUpdate = () => { taskState.revision++; taskState.webReady = browser.authenticated; emit("onTasksChanged", taskState); return structuredClone(taskState); };
  const taskPreview = ({cwd, prompt}) => ({cwd, prompt, context: {project: "demo", entries: ["src/", "tests/", "package.json"], revision: "abc123", changes: "", diffStat: ""}, route: {provider: "codex", reason: "direct_task"}});
  const api = {
    tasks: async () => { taskState.webReady = browser.authenticated; return structuredClone(taskState); },
    taskSettings: async patch => { Object.assign(taskState.settings, patch); return taskUpdate(); },
    taskKey: async () => { taskState.keyConfigured = true; return taskUpdate(); },
    taskKeyRemove: async () => { taskState.keyConfigured = false; return taskUpdate(); },
    taskCheck: async () => ({ok: true, model: taskState.settings.model}),
    taskFolder: async () => "/demo/project",
    taskPreview: async input => taskPreview(input),
    taskStart: async input => { const info = taskPreview(input); taskState.tasks.unshift({id: "demo-task", title: input.prompt, prompt: input.prompt, cwd: input.cwd, mode: taskState.settings.mode, effectiveMode: taskState.settings.mode, config: {...taskState.settings}, status: "executing", phase: "execute", round: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), plan: null, result: null, decision: info.route, context: info.context, baseline: info.context, events: [{at: new Date().toISOString(),kind: "execute",detail: "Execution round 1"}], commands: [], approvals: [], usage: {inputTokens: 1200,cachedInputTokens: 0,outputTokens: 200,reasoningOutputTokens: 100,totalTokens: 1400},webUsage: {inputTokens: 0,outputTokens: 0},estimatedCost: null,elapsedMs: 2000}); return taskUpdate(); },
    taskMode: async (id, mode) => { taskState.tasks.find(t=>t.id===id).mode=mode; return taskUpdate(); },
    taskAction: async (id, action) => { const t = taskState.tasks.find(t=>t.id===id); if(action==="delete") taskState.tasks=taskState.tasks.filter(t=>t.id!==id); else t.status=({pause:"paused",resume:"executing",stop:"stopped",accept:"completed"})[action]; return taskUpdate(); },
    taskApproval: async () => taskUpdate(), taskExport: async () => "/demo/report.json",
    snapshot: async () => {
      if (controls.failSnapshot) throw new Error("Demo startup failure");
      return structuredClone(snapshot);
    },
    setLanguage: async language => update({ language }),
    setTheme: async theme => update({ theme }),
    completeOnboarding: async language => update({ language, onboardingComplete: true }),
    openSocial: async () => update({ githubOpened: true }),
    setPreference: async (key, value) => update({ [key]: value }),
    setAutostart: async autoStart => ({ state: update({ autoStart }), supported: true, enabled: autoStart }),
    setSidebarState: async ({ open, width }) => update({ sidebarOpen: open, sidebarWidth: width }),
    setBiggerContext: async experimentalBiggerContext => update({ experimentalBiggerContext }),
    dismissBiggerContextRecommendation: async () => update({ biggerContextRecommendationDismissed: true }),
    openLogin: async () => { Object.assign(browser, { authenticated: true, status: "ready" }); emit("onBrowserState", browser); return browser; },
    smokeTest: async () => { snapshot.smokePassed = true; update({ browserSmokePassed: true, browserSmokeVersion: snapshot.version }); return { ok: true, effort: "high", response: "OK" }; },
    setupCore: async () => { update({ coreSetupComplete: true, codexCatalogVerified: true }); return { ok: true, stdout: "", restartRequired: false }; },
    setupMcp: async input => { controls.calls.push({ method: "setupMcp", input }); snapshot.mcpCredentialsConfigured = true; update({ mcpRuntimeInstalled: true, mcpGuideStep: 2 }); return { ok: true, stdout: "" }; },
    setMcpStep: async mcpGuideStep => { if (controls.failStep) throw new Error("Demo state write failure"); return update({ mcpGuideStep }); },
    verifyMcp: async () => { update({ mcpSetupComplete: true }); return { ok: true, checks: [{ id: "connector", status: "ok", message: "Connector is ready" }] }; },
    doctor: async () => ({ ok: false, checks: [{ id: "connection", status: "error", message: "Demo connection unavailable", detail: "Confirm the local service is running, then retry diagnostics." }] }),
    usageSummary: async () => {
      const result = structuredClone({ ...usage, generatedAt: new Date().toISOString() });
      if (controls.usageDelay) await new Promise(resolve => setTimeout(resolve, controls.usageDelay));
      controls.completedUsage += 1;
      if (controls.failUsage) throw new Error("Demo usage read failure");
      return result;
    },
    resetUsage: async () => { usage = { ...usage, today: totals, last7Days: totals, lifetime: totals, days: [] }; return { cancelled: false, summary: structuredClone(usage) }; },
    exportLogs: async () => "/demo/diagnostics.json", exportUsage: async () => "/demo/usage.json",
    windowState: async () => ({ maximized: false, fullScreen: false }), windowControl: () => {},
    setBrowserBounds: async () => true, setBrowserSurfaceActive: async () => browser,
    openExternal: async () => true, copyText: async () => true,
  };
  for (const name of ["onTasksChanged", "onStateChanged", "onBrowserState", "onOperation", "onLog", "onUpdateState", "onNavigate", "onWindowStateChanged"]) {
    api[name] = listener => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
      return () => listeners.get(name).delete(listener);
    };
  }
  window.__launcherTest = { taskState, controls, state, snapshot, update, emit, setUsage: value => { usage = value; } };
  window.codexWebLauncher = api;
})();
