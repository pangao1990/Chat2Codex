export type Language = "zh-CN" | "en";
export type Theme = "light" | "dark";
export type LauncherProfile = "production" | "development";
export type Surface = "home" | "browser" | "setup" | "mcp" | "usage" | "activity" | "settings";

export interface LauncherState {
  version: 1;
  language: Language | null;
  theme: Theme;
  onboardingComplete: boolean;
  githubOpened: boolean;
  autoStart: boolean;
  keepRunningOnClose: boolean;
  showBrowserDuringTurns: boolean;
  taskNotifications: boolean;
  experimentalBiggerContext: boolean;
  biggerContextRecommendationDismissed: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  browserSmokePassed?: boolean;
  browserSmokeVersion?: string | null;
  coreSetupComplete?: boolean;
  codexCatalogVerified?: boolean;
  mcpSetupComplete?: boolean;
  mcpRuntimeInstalled?: boolean;
  codexRestartRequired?: boolean;
  mcpGuideStep: number;
  sessionRefreshReminderAt: string | null;
}

export interface BrowserState {
  status: "idle" | "loading" | "signed-out" | "ready" | "testing" | "running" | "error";
  message: string;
  url: string;
  title: string;
  authenticated: boolean;
  visible: boolean;
  surfaceActive: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  zoomFactor: number;
  activeTabId: string;
  maxTabs: number;
  tabs: BrowserTabState[];
}

export interface BrowserTabState {
  id: string;
  traceId: string | null;
  title: string;
  status: "idle" | "loading" | "signed-out" | "ready" | "testing" | "running" | "error" | "aborted";
  loading: boolean;
  active: boolean;
  closable: boolean;
}

export interface LogRecord {
  at: string;
  level: "debug" | "info" | "warning" | "error";
  event: string;
  detail: Record<string, unknown>;
}

export interface DoctorCheck {
  id: string;
  status: "ok" | "warning" | "error";
  message: string;
  detail?: string;
}

export interface DoctorReport {
  ok: boolean;
  mode?: "browser-only" | "full";
  checks: DoctorCheck[];
}

export interface OperationState {
  name: string;
  status: "running" | "completed" | "failed";
  message: string;
}

export type UpdateState =
  | { status: "disabled" | "idle" | "checking" | "up-to-date" }
  | { status: "available" | "downloading" | "installing"; version: string }
  | { status: "error"; message: string };

export interface LauncherSnapshot {
  profile: LauncherProfile;
  profilePaths: {
    coreHome: string;
    codexHome: string;
    userData: string;
  };
  state: LauncherState;
  browser: BrowserState | null;
  connectorName: string;
  mcpCredentialsConfigured: boolean;
  logs: LogRecord[];
  urls: {
    github: string;
    pricing: string;
    connectors: string;
    tunnels: string;
    keys: string;
  };
  platform: string;
  packaged: boolean;
  version: string;
  smokePassed: boolean;
  operation: OperationState | null;
  update: UpdateState;
}

export interface LauncherApi {
  tasks(): Promise<TaskSnapshot>;
  taskSettings(value: Partial<TaskSettings>): Promise<TaskSnapshot>;
  taskKey(value: string): Promise<TaskSnapshot>;
  taskKeyRemove(): Promise<TaskSnapshot>;
  taskCheck(): Promise<{ok: boolean; model: string}>;
  taskPreview(input: {cwd: string; prompt: string}): Promise<TaskPreview>;
  taskStart(input: {cwd: string; prompt: string}): Promise<TaskSnapshot>;
  taskMode(id: string, mode: AnalysisMode): Promise<TaskSnapshot>;
  taskAction(id: string, action: string, feedback?: string): Promise<TaskSnapshot>;
  taskApproval(id: string, requestId: number, decision: string): Promise<TaskSnapshot>;
  taskFolder(): Promise<string | null>;
  taskExport(id: string): Promise<string | null>;
  onTasksChanged(listener: (snapshot: TaskSnapshot) => void): () => void;
  snapshot(): Promise<LauncherSnapshot>;
  setLanguage(language: Language): Promise<LauncherState>;
  setTheme(theme: Theme): Promise<LauncherState>;
  openSocial(target: "github"): Promise<LauncherState>;
  completeOnboarding(language: Language): Promise<LauncherState>;
  openExternal(url: string): Promise<boolean>;
  copyText(value: string): Promise<boolean>;
  setBrowserBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<boolean>;
  setBrowserSurfaceActive(active: boolean): Promise<BrowserState>;
  showBrowser(): Promise<BrowserState>;
  hideBrowser(): Promise<BrowserState>;
  navigateBrowser(action: "back" | "forward" | "reload"): Promise<BrowserState>;
  zoomBrowser(action: "in" | "out" | "reset"): Promise<BrowserState>;
  selectBrowserTab(tabId: string): Promise<BrowserState>;
  closeBrowserTab(tabId: string): Promise<BrowserState>;
  openLogin(): Promise<BrowserState>;
  openPasskeyLogin(): Promise<BrowserState>;
  continuePasskeyLogin(): Promise<boolean>;
  logoutChatGpt(): Promise<{ browser: BrowserState; state: LauncherState }>;
  dismissSessionReminder(): Promise<LauncherState>;
  smokeTest(): Promise<{ ok: boolean; effort: string; response: string }>;
  verifyMcp(): Promise<DoctorReport>;
  doctor(): Promise<DoctorReport>;
  cancelTurns(): Promise<{ stdout: string }>;
  uninstallIntegration(): Promise<{ cancelled: true } | { cancelled: false; state: LauncherState }>;
  setupCore(): Promise<{ ok: boolean; stdout: string; restartRequired: boolean }>;
  setupMcp(input: {
    tunnelId?: string;
    runtimeKey?: string;
    replace?: boolean;
  }): Promise<{ ok: boolean; stdout: string }>;
  setMcpStep(step: number): Promise<LauncherState>;
  setAutostart(enabled: boolean): Promise<{ state: LauncherState; supported: boolean; enabled: boolean }>;
  setBiggerContext(enabled: boolean): Promise<LauncherState>;
  dismissBiggerContextRecommendation(): Promise<LauncherState>;
  setPreference(
    key: "keepRunningOnClose" | "showBrowserDuringTurns" | "taskNotifications",
    value: boolean,
  ): Promise<LauncherState>;
  setSidebarState(state: { open: boolean; width: number }): Promise<LauncherState>;
  logs(limit?: number): Promise<LogRecord[]>;
  exportLogs(): Promise<string | null>;
  usageSummary(): Promise<UsageSummary>;
  exportUsage(): Promise<string | null>;
  resetUsage(): Promise<{ cancelled: boolean; summary: UsageSummary }>;
  installUpdate(): Promise<boolean>;
  windowState(): Promise<{ fullScreen: boolean; maximized: boolean }>;
  windowControl(action: "close" | "minimize" | "zoom"): void;
  onWindowStateChanged(listener: (state: { fullScreen: boolean; maximized: boolean }) => void): () => void;
  onStateChanged(listener: (state: LauncherState) => void): () => void;
  onBrowserState(listener: (state: BrowserState) => void): () => void;
  onOperation(listener: (state: OperationState) => void): () => void;
  onLog(listener: (record: LogRecord) => void): () => void;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
  onNavigate(listener: (surface: Surface) => void): () => void;
}

export type AnalysisMode = "auto" | "chatgpt" | "codex";
export interface TaskSettings {
  mode: AnalysisMode; executable: string; model: string; webEffort: string;
  maxRounds: number; maxTokens: number; maxMinutes: number;
  inputPrice: number | null; cachedPrice: number | null; outputPrice: number | null;
}
export interface TaskPreview { cwd: string; prompt: string; context: {project: string; entries: string[]; revision: string; changes: string; diffStat: string}; route: {provider: string; reason: string}; }
export interface WorkbenchTask {
  id: string; title: string; prompt: string; cwd: string; mode: AnalysisMode; effectiveMode: AnalysisMode; config: TaskSettings;
  status: string; phase: string; round: number; createdAt: string; updatedAt: string; error?: string; pauseRequested?: boolean;
  decision: {provider: string; reason: string} | null;
  plan: {decision: string; summary: string; instruction: string; acceptance: string[]} | null;
  result: {status: string; summary: string; nextInstruction: string; tests: {command: string; exitCode: number}[]} | null;
  context: TaskPreview["context"]; baseline: TaskPreview["context"];
  events: {at: string; kind: string; detail: string}[];
  commands: {id: string; round: number; command: string; exitCode: number | null; output: string}[];
  approvals: {id: number; method: string; detail: string}[];
  usage: {inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningOutputTokens: number; totalTokens: number};
  usageAvailable?: boolean;
  webUsage: {inputTokens: number; outputTokens: number; unknownTurns?: number}; estimatedCost: number | null; elapsedMs: number;
}
export interface TaskSnapshot { version: number; revision: number; settings: TaskSettings; tasks: WorkbenchTask[]; keyConfigured: boolean; webReady: boolean; loadError: string | null; }

export interface UsageTotals {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedSavingsUsd: number;
  unpricedTurns?: number;
}

export interface UsageDay extends UsageTotals {
  date: string;
}

export interface UsageSummary {
  storageError?: string;
  version: 1;
  generatedAt: string;
  estimated: true;
  pricing: {
    currency: "USD";
    basis: "standard-short-context";
    asOf: string;
    source: string;
    pricesPerMillionTokens: Record<string, { input: number; output: number }>;
  };
  today: UsageTotals;
  last7Days: UsageTotals;
  lifetime: UsageTotals;
  days: UsageDay[];
}

declare global {
  interface Window {
    codexWebLauncher?: LauncherApi;
  }
}
