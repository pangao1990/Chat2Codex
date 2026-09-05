const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  SESSION_REFRESH_REMINDER_INTERVAL_MS,
  createStateStore,
  nextSessionRefreshReminderAt,
  validateSidebarState,
} = require("../electron/state.cjs");

test("launcher state persists onboarding, language, and autostart atomically", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-launcher-state-"));
  const file = path.join(root, "state.json");
  try {
    const store = createStateStore(file);
    assert.deepEqual(store.read(), {
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
    store.update({
      language: "zh-CN",
      theme: "dark",
      onboardingComplete: true,
      keepRunningOnClose: false,
      browserSmokePassed: true,
      browserSmokeVersion: "0.2.0",
    });
    assert.deepEqual(createStateStore(file).read(), {
      version: 1,
      language: "zh-CN",
      theme: "dark",
      onboardingComplete: true,
      githubOpened: false,
      autoStart: true,
      keepRunningOnClose: false,
      showBrowserDuringTurns: true,
      taskNotifications: true,
      experimentalBiggerContext: false,
      biggerContextRecommendationDismissed: false,
      browserSmokePassed: true,
      browserSmokeVersion: "0.2.0",
      sidebarOpen: true,
      sidebarWidth: 252,
      mcpGuideStep: 0,
      sessionRefreshReminderAt: null,
    });
    if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o077, 0);
    assert.equal(fs.readdirSync(root).some(name => name.includes(".tmp-")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("launcher state publishes durable updates for tray status refresh", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-launcher-state-listener-"));
  const file = path.join(root, "state.json");
  const updates = [];
  try {
    const store = createStateStore(file, (state) => updates.push(state));
    store.update({ coreSetupComplete: true });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].coreSetupComplete, true);
    assert.notEqual(updates[0], store.read());
    assert.throws(() => createStateStore(file, "invalid"), /must be a function/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sidebar state accepts only bounded native shell dimensions", () => {
  assert.deepEqual(validateSidebarState({ open: false, width: 300.4 }), {
    sidebarOpen: false,
    sidebarWidth: 300,
  });
  assert.throws(() => validateSidebarState({ open: "yes", width: 300 }), /invalid/);
  assert.throws(() => validateSidebarState({ open: true, width: 100 }), /between 240 and 420/);
  assert.throws(() => validateSidebarState({ open: true, width: 900 }), /between 240 and 420/);
});

test("legacy Japanese preference migrates to the default Chinese language", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-ja-state-"));
  const file = path.join(root, "state.json");
  try {
    fs.writeFileSync(file, JSON.stringify({ version: 1, language: "ja" }));
    assert.equal(createStateStore(file).read().language, "zh-CN");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persisted sidebar corruption is repaired without changing the rest of launcher state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-sidebar-state-"));
  const file = path.join(root, "state.json");
  try {
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      language: "zh-CN",
      theme: "invalid",
      onboardingComplete: "yes",
      autoStart: "yes",
      bridgeEnabled: false,
      browserSmokePassed: "yes",
      browserSmokeVersion: { invalid: true },
      sidebarOpen: "yes",
      sidebarWidth: 900,
      mcpGuideStep: 99,
      sessionRefreshReminderAt: "not-a-date",
      coreSetupComplete: "yes",
    }));
    assert.deepEqual(createStateStore(file).read(), {
      version: 1,
      language: "zh-CN",
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
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("session refresh reminders are deferred by exactly 48 hours", () => {
  const now = Date.UTC(2026, 7, 5, 12, 0, 0);
  assert.equal(SESSION_REFRESH_REMINDER_INTERVAL_MS, 48 * 60 * 60 * 1000);
  assert.equal(nextSessionRefreshReminderAt(now), "2026-08-07T12:00:00.000Z");
  assert.throws(() => nextSessionRefreshReminderAt(Number.NaN), /must be finite/);
});
