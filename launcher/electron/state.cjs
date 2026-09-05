const fs = require("node:fs");
const { writePrivateFileAtomic } = require("./atomic-file.cjs");
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 420;
const SESSION_REFRESH_REMINDER_INTERVAL_MS = 48 * 60 * 60 * 1000;

const DEFAULT_STATE = Object.freeze({
  version: 1,
  language: null,
  theme: "light",
  onboardingComplete: false,
  githubOpened: false,
  autoStart: true,
  keepRunningOnClose: true,
  showBrowserDuringTurns: true,
  taskNotifications: true,
  experimentalBiggerContext: false,
  biggerContextRecommendationDismissed: false,
  browserSmokePassed: false,
  browserSmokeVersion: null,
  sidebarOpen: true,
  sidebarWidth: 252,
  mcpGuideStep: 0,
  sessionRefreshReminderAt: null,
});

function nextSessionRefreshReminderAt(now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error("Session refresh reminder time must be finite");
  return new Date(now + SESSION_REFRESH_REMINDER_INTERVAL_MS).toISOString();
}

function readState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || parsed.version !== 1) return { ...DEFAULT_STATE };
    const state = { ...DEFAULT_STATE, ...parsed };
    delete state.bridgeEnabled;
    delete state.xOpened;
    if (state.language === "ja") state.language = "zh-CN";
    if (state.language !== null && state.language !== "en" && state.language !== "zh-CN") {
      state.language = DEFAULT_STATE.language;
    }
    if (state.theme !== "light" && state.theme !== "dark") state.theme = DEFAULT_STATE.theme;
    for (const key of [
      "onboardingComplete",
      "githubOpened",
      "autoStart",
      "keepRunningOnClose",
      "showBrowserDuringTurns",
      "taskNotifications",
      "experimentalBiggerContext",
      "biggerContextRecommendationDismissed",
      "browserSmokePassed",
      "sidebarOpen",
    ]) {
      if (typeof state[key] !== "boolean") state[key] = DEFAULT_STATE[key];
    }
    if (state.browserSmokeVersion !== null
      && (typeof state.browserSmokeVersion !== "string" || state.browserSmokeVersion.length > 128)) {
      state.browserSmokeVersion = DEFAULT_STATE.browserSmokeVersion;
    }
    if (!Number.isFinite(state.sidebarWidth)
      || state.sidebarWidth < SIDEBAR_MIN_WIDTH
      || state.sidebarWidth > SIDEBAR_MAX_WIDTH) {
      state.sidebarWidth = DEFAULT_STATE.sidebarWidth;
    }
    if (!Number.isInteger(state.mcpGuideStep) || state.mcpGuideStep < 0 || state.mcpGuideStep > 2) {
      state.mcpGuideStep = DEFAULT_STATE.mcpGuideStep;
    }
    if (state.sessionRefreshReminderAt !== null
      && (typeof state.sessionRefreshReminderAt !== "string"
        || !Number.isFinite(Date.parse(state.sessionRefreshReminderAt)))) {
      state.sessionRefreshReminderAt = DEFAULT_STATE.sessionRefreshReminderAt;
    }
    for (const key of [
      "coreSetupComplete",
      "codexCatalogVerified",
      "mcpSetupComplete",
      "mcpRuntimeInstalled",
      "codexRestartRequired",
    ]) {
      if (state[key] !== undefined && typeof state[key] !== "boolean") delete state[key];
    }
    return state;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(filePath, state) {
  writePrivateFileAtomic(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

function validateSidebarState(value) {
  if (!value || typeof value !== "object" || typeof value.open !== "boolean") {
    throw new Error("Sidebar state is invalid");
  }
  if (!Number.isFinite(value.width) || value.width < SIDEBAR_MIN_WIDTH || value.width > SIDEBAR_MAX_WIDTH) {
    throw new Error(`Sidebar width must be between ${SIDEBAR_MIN_WIDTH} and ${SIDEBAR_MAX_WIDTH}`);
  }
  return { sidebarOpen: value.open, sidebarWidth: Math.round(value.width) };
}

function createStateStore(filePath, onUpdate) {
  if (onUpdate !== undefined && typeof onUpdate !== "function") {
    throw new Error("State update listener must be a function");
  }
  let state = readState(filePath);
  return {
    read() {
      return structuredClone(state);
    },
    update(patch) {
      const next = { ...state, ...patch, version: 1 };
      writeState(filePath, next);
      state = next;
      const snapshot = structuredClone(next);
      onUpdate?.(snapshot);
      return snapshot;
    },
  };
}

module.exports = {
  SESSION_REFRESH_REMINDER_INTERVAL_MS,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  createStateStore,
  nextSessionRefreshReminderAt,
  validateSidebarState,
};
