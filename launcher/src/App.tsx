import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { copyFor, type Copy } from "./i18n";
import { Icon, type IconName } from "./icons";
import { Workbench } from "./Workbench";
import type {
  BrowserState,
  DoctorCheck,
  DoctorReport,
  Language,
  LauncherSnapshot,
  LauncherState,
  LogRecord,
  OperationState,
  Surface,
  Theme,
  UsageDay,
  UsageSummary,
  UsageTotals,
} from "./types";

const api = window.codexWebLauncher;
const PANEL_TRANSITION = { duration: 0.3, ease: [0.16, 1, 0.3, 1] } as const;
const COMPACT_SIDEBAR_QUERY = "(max-width: 820px)";
const MCP_GUIDE_MEDIA = [
  new URL("./assets/mcp-create-tunnel.gif", import.meta.url).href,
  new URL("./assets/mcp-connect-connector.gif", import.meta.url).href,
  new URL("./assets/mcp-connect-connector.gif", import.meta.url).href,
] as const;
const APP_ICON = new URL("../assets/icon-mark.png", import.meta.url).href;

function initialSurface(snapshot: LauncherSnapshot): Surface {
  return "home";
}

export function App() {
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const documentLanguage = snapshot?.state.language ?? "zh-CN";

  useEffect(() => {
    document.documentElement.lang = documentLanguage;
  }, [documentLanguage]);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let latestState: LauncherState | undefined;
    let latestBrowser: BrowserState | undefined;
    let latestOperation: OperationState | undefined;
    let latestUpdate: LauncherSnapshot["update"] | undefined;
    const pendingLogs: LogRecord[] = [];
    setStartupError(null);
    const timeout = window.setTimeout(() => {
      cancelled = true;
      setStartupError(copyFor(documentLanguage).startupTimeout);
    }, 15_000);
    void api.snapshot().then((next) => {
      if (cancelled) return;
      window.clearTimeout(timeout);
      const state = latestState ?? next.state;
      setSnapshot({ ...next, state, update: latestUpdate ?? next.update,
        smokePassed: latestState ? smokePassedForState(state, next.version) : next.smokePassed });
      setBrowser(latestBrowser ?? next.browser);
      const snapshotLogKeys = new Set(next.logs.map(record => JSON.stringify(record)));
      setLogs([...next.logs, ...pendingLogs.filter(record => !snapshotLogKeys.has(JSON.stringify(record)))].slice(-300));
      setOperation(latestOperation ?? next.operation);
      if (!latestOperation && next.operation?.status === "failed" && next.operation.name !== "mcp-verification") {
        setError(next.operation.message);
      }
    }).catch((cause) => {
      window.clearTimeout(timeout);
      if (!cancelled) setStartupError(messageOf(cause));
    });
    const unsubscribeState = api.onStateChanged((state) => {
      latestState = state;
      setSnapshot((current) => current
        ? {
            ...current,
            state,
            smokePassed: smokePassedForState(state, current.version),
          }
        : current);
    });
    const unsubscribeBrowser = api.onBrowserState((next) => {
      latestBrowser = next;
      setBrowser(next);
    });
    const unsubscribeOperation = api.onOperation((next) => {
      latestOperation = next;
      setOperation(next);
      if (next.status === "failed" && next.name !== "mcp-verification") setError(next.message);
    });
    const unsubscribeLog = api.onLog((record) => {
      pendingLogs.push(record);
      if (pendingLogs.length > 300) pendingLogs.shift();
      setLogs((current) => [...current.slice(-299), record]);
    });
    const unsubscribeUpdate = api.onUpdateState((update) => {
      latestUpdate = update;
      setSnapshot((current) => current ? { ...current, update } : current);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      unsubscribeState();
      unsubscribeBrowser();
      unsubscribeOperation();
      unsubscribeLog();
      unsubscribeUpdate();
    };
  }, [startupAttempt]);

  const updateState = useCallback((state: LauncherState) => {
    setSnapshot((current) => current
      ? {
          ...current,
          state,
          smokePassed: smokePassedForState(state, current.version),
        }
      : current);
  }, []);

  const updateSnapshot = useCallback((next: LauncherSnapshot) => {
    setSnapshot(next);
    setBrowser(next.browser);
    setOperation(next.operation);
  }, []);

  if (!api) return <FatalMessage message="启动器 IPC 不可用。" />;
  if (!snapshot) return startupError
    ? <FatalMessage message={startupError} onRetry={() => setStartupAttempt((current) => current + 1)} />
    : <LaunchLoading />;

  const language = snapshot.state.language ?? "zh-CN";
  const copy = copyFor(language);

  return (
    <MotionConfig reducedMotion="user"><div
      className="app-root"
      data-language={language}
      data-platform={snapshot.platform}
      data-profile={snapshot.profile}
      data-theme={snapshot.state.theme}
    >
      <AnimatePresence mode="wait">
        {!snapshot.state.onboardingComplete ? (
          <Onboarding
            key="onboarding"
            language={language}
            setError={setError}
            snapshot={snapshot}
            updateState={updateState}
          />
        ) : (
          <LauncherShell
            browser={browser}
            copy={copy}
            key="launcher"
            language={language}
            logs={logs}
            operation={operation}
            setError={setError}
            snapshot={snapshot}
            updateState={updateState}
            updateSnapshot={updateSnapshot}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {error ? <ErrorToast copy={copy} message={error} onDismiss={() => setError(null)} /> : null}
      </AnimatePresence>
    </div></MotionConfig>
  );
}

function Onboarding({
  language,
  setError,
  snapshot,
  updateState,
}: {
  language: Language;
  setError: (error: string | null) => void;
  snapshot: LauncherSnapshot;
  updateState: (state: LauncherState) => void;
}) {
  const [stage, setStage] = useState<"language" | "support">(snapshot.state.language ? "support" : "language");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language);
  const [busy, setBusy] = useState(false);
  const localized = copyFor(selectedLanguage);
  const isLanguage = stage === "language";

  const chooseLanguage = async () => {
    setBusy(true);
    setError(null);
    try {
      updateState(await api!.setLanguage(selectedLanguage));
      setStage("support");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const openSocial = async (target: "github") => {
    setBusy(true);
    setError(null);
    try {
      updateState(await api!.openSocial(target));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      updateState(await api!.completeOnboarding(selectedLanguage));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.main
      animate={{ opacity: 1 }}
      className="welcome"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <header className="welcome-top draggable">
        <div className="welcome-brand no-drag">
          <BrandMark small />
          <span>{localized.product}</span>
          {snapshot.profile === "development" ? <em className="dev-profile-badge">{localized.devBadge}</em> : null}
        </div>
        <span className="welcome-version no-drag">v{snapshot.version}</span>
      </header>

      <AnimatePresence mode="wait">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="welcome-stage"
          exit={{ opacity: 0, y: -8 }}
          initial={{ opacity: 0, y: 8 }}
          key={stage}
          transition={PANEL_TRANSITION}
        >
          <span className="welcome-kicker">{isLanguage ? "01" : "02"}</span>
          <h1>{isLanguage ? localized.chooseLanguage : localized.supportTitle}</h1>
          <p>{isLanguage ? localized.chooseLanguageHint : localized.supportBody}</p>
          <span className="welcome-tagline">{localized.tagline}</span>

          {isLanguage ? (
            <div className="welcome-options" role="radiogroup" aria-label={localized.chooseLanguage}
              onKeyDown={event => {
                if (busy || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "zh-CN" : event.key === "End" ? "en" : selectedLanguage === "en" ? "zh-CN" : "en";
                setSelectedLanguage(next);
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next === "en" ? 1 : 0]?.focus();
              }}>
              <WelcomeOption
                active={selectedLanguage === "zh-CN"}
                disabled={busy}
                detail={localized.chinese}
                label={localized.chinese}
                marker="简"
                onClick={() => setSelectedLanguage("zh-CN")}
              />
              <WelcomeOption
                active={selectedLanguage === "en"}
                disabled={busy}
                detail={localized.english}
                label={localized.english}
                marker="EN"
                onClick={() => setSelectedLanguage("en")}
              />
            </div>
          ) : (
            <div className="welcome-workflows">
              <WelcomeWorkflow
                body={localized.officialWorkflowBody}
                marker="01"
                title={localized.officialWorkflowTitle}
              />
              <WelcomeWorkflow
                body={localized.bridgeWorkflowBody}
                marker="02"
                recommended
                title={localized.bridgeWorkflowTitle}
              />
              <div className="welcome-support">
                <span>{localized.optionalSupport}</span>
                <div className="welcome-support-actions">
                  <WelcomeAction
                    complete={snapshot.state.githubOpened}
                    disabled={busy}
                    icon="github"
                    label={snapshot.state.githubOpened ? localized.starred : localized.star}
                    onClick={() => openSocial("github")}
                  />
                </div>
              </div>
            </div>
          )}
        </motion.section>
      </AnimatePresence>

      <footer className="welcome-footer">
        <div>
          {!isLanguage ? (
            <button className="text-button" disabled={busy} onClick={() => setStage("language")} type="button">
              {localized.previous}
            </button>
          ) : null}
        </div>
        <div className="welcome-progress" aria-label={`${isLanguage ? 1 : 2} / 2`}>
          <span className={!isLanguage ? "is-complete" : "is-active"} />
          <span className={!isLanguage ? "is-active" : ""} />
        </div>
        <PrimaryButton
          disabled={busy}
          onClick={isLanguage ? chooseLanguage : finish}
        >
          {isLanguage ? localized.continue : localized.finishWelcome}
        </PrimaryButton>
      </footer>
    </motion.main>
  );
}

function LauncherShell({
  browser,
  copy,
  language,
  logs,
  operation,
  setError,
  snapshot,
  updateState,
  updateSnapshot,
}: {
  browser: BrowserState | null;
  copy: Copy;
  language: Language;
  logs: LogRecord[];
  operation: OperationState | null;
  setError: (error: string | null) => void;
  snapshot: LauncherSnapshot;
  updateState: (state: LauncherState) => void;
  updateSnapshot: (snapshot: LauncherSnapshot) => void;
}) {
  const [surface, setSurface] = useState<Surface>(() => initialSurface(snapshot));
  const devProfile = snapshot.profile === "development";
  const compactAtMount = useRef(window.matchMedia(COMPACT_SIDEBAR_QUERY).matches).current;
  const [sidebarOpen, setSidebarOpen] = useState(!compactAtMount && snapshot.state.sidebarOpen);
  const [compactSidebar, setCompactSidebar] = useState(compactAtMount);
  const [browserSlot, setBrowserSlot] = useState<HTMLDivElement | null>(null);
  const [sessionReminderBusy, setSessionReminderBusy] = useState(false);
  const [sessionReminderDue, setSessionReminderDue] = useState(false);
  const [biggerContextRecommendationOpen, setBiggerContextRecommendationOpen] = useState(
    snapshot.state.coreSetupComplete === true
      && !snapshot.state.experimentalBiggerContext
      && !snapshot.state.biggerContextRecommendationDismissed,
  );
  const [biggerContextRecommendationBusy, setBiggerContextRecommendationBusy] = useState(false);
  const browserSlotRef = useCallback((node: HTMLDivElement | null) => setBrowserSlot(node), []);
  const browserSurfaceActive = surface === "browser"
    && !(compactSidebar && sidebarOpen)
    && !biggerContextRecommendationOpen;
  const needsBrowser = browser?.authenticated !== true;
  const needsSetup = !needsBrowser
    && (snapshot.state.coreSetupComplete !== true || snapshot.state.codexCatalogVerified !== true);
  const mcpNeedsSetup = !devProfile
    && snapshot.state.codexCatalogVerified === true
    && snapshot.state.mcpSetupComplete !== true;
  const workflowReady = browser?.authenticated === true && snapshot.smokePassed
    && snapshot.state.coreSetupComplete === true
    && snapshot.state.codexCatalogVerified === true
    && (devProfile || snapshot.state.mcpSetupComplete === true);
  const updateVisible = ["available", "downloading", "installing"].includes(snapshot.update.status);
  const updateBusy = snapshot.update.status === "downloading" || snapshot.update.status === "installing";
  const updateVersion = "version" in snapshot.update ? snapshot.update.version : null;

  useLayoutEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      if (!browserSlot) return;
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const rect = browserSlot.getBoundingClientRect();
        void api!.setBrowserBounds({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }).catch((cause) => setError(messageOf(cause)));
      });
    };

    void api!.setBrowserSurfaceActive(browserSurfaceActive).then(() => {
      if (cancelled || !browserSurfaceActive || !browserSlot) return;
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(browserSlot);
      window.addEventListener("resize", measure);
    }).catch((cause) => setError(messageOf(cause)));

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [browserSlot, browserSurfaceActive, setError]);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_SIDEBAR_QUERY);
    const apply = () => {
      setCompactSidebar(media.matches);
      setSidebarOpen(!media.matches);
    };
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const reminderAt = snapshot.state.sessionRefreshReminderAt;
    const reminderTime = reminderAt === null ? Number.NaN : Date.parse(reminderAt);
    if (browser?.authenticated !== true || !Number.isFinite(reminderTime)) {
      setSessionReminderDue(false);
      return;
    }
    const delay = reminderTime - Date.now();
    if (delay <= 0) {
      setSessionReminderDue(true);
      return;
    }
    setSessionReminderDue(false);
    const timer = window.setTimeout(() => setSessionReminderDue(true), delay);
    return () => window.clearTimeout(timer);
  }, [browser?.authenticated, snapshot.state.sessionRefreshReminderAt]);

  const activateBrowser = useCallback(async (show = false) => {
    setSurface("browser");
    await api!.setBrowserSurfaceActive(true);
    if (show) await api!.showBrowser();
  }, []);

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    if (compactSidebar && next && surface === "browser") {
      void api!.setBrowserSurfaceActive(false)
        .then(() => setSidebarOpen(true))
        .catch((cause) => setError(messageOf(cause)));
      return;
    }
    setSidebarOpen(next);
    if (!compactSidebar) {
      void api!.setSidebarState({ open: next, width: snapshot.state.sidebarWidth })
        .then(updateState).catch((cause) => setError(messageOf(cause)));
    }
  };

  const navigateSurface = (next: Surface) => {
    setSurface(next);
    if (compactSidebar) setSidebarOpen(false);
  };

  useEffect(() => api!.onNavigate((next) => {
    setSurface(next);
    if (compactSidebar) setSidebarOpen(false);
  }), [compactSidebar]);

  const installUpdate = async () => {
    setError(null);
    try {
      await api!.installUpdate();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const dismissSessionReminder = async () => {
    if (sessionReminderBusy) return;
    setSessionReminderBusy(true);
    setError(null);
    try {
      updateState(await api!.dismissSessionReminder());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSessionReminderBusy(false);
    }
  };

  const logoutChatGpt = async () => {
    if (sessionReminderBusy) return;
    setSessionReminderBusy(true);
    setError(null);
    try {
      const result = await api!.logoutChatGpt();
      updateState(result.state);
      navigateSurface("browser");
      await api!.setBrowserSurfaceActive(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSessionReminderBusy(false);
    }
  };

  const setRecommendedBiggerContext = async (enabled: boolean) => {
    if (biggerContextRecommendationBusy) return;
    setBiggerContextRecommendationBusy(true);
    setError(null);
    try {
      updateState(await api!.setBiggerContext(enabled));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBiggerContextRecommendationBusy(false);
    }
  };

  const dismissBiggerContextRecommendation = async () => {
    if (biggerContextRecommendationBusy) return;
    setBiggerContextRecommendationBusy(true);
    setError(null);
    try {
      updateState(await api!.dismissBiggerContextRecommendation());
      setBiggerContextRecommendationOpen(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBiggerContextRecommendationBusy(false);
    }
  };

  return (
    <motion.main
      animate={{ opacity: 1 }}
      className={`app-shell${compactSidebar ? " is-compact" : ""}${sidebarOpen ? " is-sidebar-open" : ""}`}
      initial={{ opacity: 0 }}
    >
      <TitleBar
        copy={copy}
        devProfile={devProfile}
        draggable={surface !== "browser"}
        sidebarOpen={sidebarOpen}
        toggleSidebar={toggleSidebar}
      />

      {compactSidebar && sidebarOpen ? (
        <button
          aria-label={copy.hideSidebar}
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <motion.aside
        animate={{ width: sidebarOpen ? "var(--sidebar-width)" : 0 }}
        className="app-sidebar"
        inert={!sidebarOpen || biggerContextRecommendationOpen}
        initial={false}
        transition={{ type: "spring", duration: 0.5, bounce: 0.08 }}
      >
        <div className="sidebar-clip">
          <div className="sidebar-content">
            <div className="sidebar-brand-row">
              <div className="sidebar-brand-identity">
                <BrandMark small />
                <strong>{copy.product}</strong>
                {devProfile ? <em className="dev-profile-badge">{copy.devBadge}</em> : null}
              </div>
              <div className="sidebar-brand-actions">
                <IconButton
                  icon="github"
                  label="GitHub"
                  onClick={() => void api!.openExternal(snapshot.urls.github).catch((cause) => setError(messageOf(cause)))}
                />
              </div>
            </div>

            <nav className="sidebar-nav" aria-label={copy.workspace}>
              <SidebarGroup label={copy.workspace}>
                <SidebarItem active={surface === "home"} icon="activity" label={language === "zh-CN" ? "首页与任务" : "Home & tasks"} onClick={() => navigateSurface("home")} />
                <SidebarItem
                  active={surface === "browser"}
                  badge={needsBrowser
                    ? <ActionDot pulse tone="required" />
                    : browser?.status === "error"
                      ? <ActionDot tone="error" />
                      : null}
                  icon="browser"
                  label={copy.browser}
                  onClick={() => navigateSurface("browser")}
                />
              </SidebarGroup>
              <SidebarGroup label={copy.configuration}>
                <SidebarItem
                  active={surface === "setup"}
                  badge={needsSetup ? <ActionDot pulse tone="required" /> : null}
                  icon="setup"
                  label={copy.setup}
                  onClick={() => navigateSurface("setup")}
                />
                <SidebarItem
                  active={surface === "mcp"}
                  badge={mcpNeedsSetup ? <ActionDot pulse tone="required" /> : null}
                  icon="mcp"
                  label="MCP"
                  onClick={() => navigateSurface("mcp")}
                />
              </SidebarGroup>
              <SidebarGroup label={copy.runtime}>
                <SidebarItem active={surface === "usage"} icon="usage" label={copy.usage} onClick={() => navigateSurface("usage")} />
                <SidebarItem active={surface === "activity"} icon="activity" label={copy.activity} onClick={() => navigateSurface("activity")} />
              </SidebarGroup>
            </nav>

            <div className="sidebar-footer">
              <div className="sidebar-readiness" role="status">
                <StateDot state={workflowReady ? "ready" : "busy"} />
                <span>{surface === "home" ? (language === "zh-CN" ? "任务连接状态见首页" : "Task connections on Home") : workflowReady ? copy.bridgeReady : copy.bridgeNeedsSetup}</span>
              </div>
              {updateVisible ? (
                <SidebarItem
                  active={false}
                  disabled={updateBusy || operation?.status === "running" || browser?.status === "running"}
                  icon="update"
                  label={updateBusy ? copy.updating : `${copy.updateAvailable} v${updateVersion}`}
                  onClick={() => void installUpdate()}
                  tone="update"
                />
              ) : null}
              <SidebarItem
                active={surface === "settings"}
                icon="settings"
                label={copy.settings}
                onClick={() => navigateSurface("settings")}
              />
            </div>
          </div>
        </div>
      </motion.aside>

      <section className="workspace" inert={biggerContextRecommendationOpen || (compactSidebar && sidebarOpen)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            animate={{ opacity: 1 }}
            className="surface-transition"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={surface}
            transition={{ duration: 0.16 }}
          >
            {surface === "home" ? <Workbench language={language} onLogin={() => { activateBrowser(); void api!.openLogin().catch(e => setError(messageOf(e))); }} /> : null}
            {surface === "browser" ? (
              <BrowserSurface
                browser={browser}
                browserSlotRef={browserSlotRef}
                copy={copy}
                operation={operation}
                onContinueSetup={() => navigateSurface(mcpNeedsSetup ? "mcp" : "setup")}
                onViewUsage={() => navigateSurface("usage")}
                platform={snapshot.platform}
                setError={setError}
                workflowReady={workflowReady}
              />
            ) : null}
            {surface === "setup" ? (
              <SetupSurface
                activateBrowser={activateBrowser}
                browser={browser}
                copy={copy}
                devProfile={devProfile}
                operation={operation}
                setError={setError}
                showMcp={() => setSurface("mcp")}
                snapshot={snapshot}
                updateState={updateState}
                updateSnapshot={updateSnapshot}
              />
            ) : null}
            {surface === "mcp" ? (
              <McpSurface
                copy={copy}
                devProfile={devProfile}
                onDone={() => setSurface("browser")}
                operation={operation}
                setError={setError}
                snapshot={snapshot}
                updateState={updateState}
                updateSnapshot={updateSnapshot}
              />
            ) : null}
            {surface === "activity" ? (
              <ActivitySurface copy={copy} language={language} logs={logs} setError={setError} />
            ) : null}
            {surface === "usage" ? (
              <UsageSurface
                copy={copy}
                language={language}
                pricingUrl={snapshot.urls.pricing}
                setError={setError}
              />
            ) : null}
            {surface === "settings" ? (
              <SettingsSurface
                copy={copy}
                devProfile={devProfile}
                language={language}
                setError={setError}
                snapshot={snapshot}
                updateState={updateState}
                updateSnapshot={updateSnapshot}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {biggerContextRecommendationOpen ? (
          <BiggerContextRecommendation
            busy={biggerContextRecommendationBusy || operation?.status === "running"}
            checked={snapshot.state.experimentalBiggerContext}
            copy={copy}
            onChange={(enabled) => void setRecommendedBiggerContext(enabled)}
            onClose={() => void dismissBiggerContextRecommendation()}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sessionReminderDue && !biggerContextRecommendationOpen ? (
          <SessionRefreshReminder
            busy={sessionReminderBusy}
            copy={copy}
            onDismiss={() => void dismissSessionReminder()}
            onLogout={() => void logoutChatGpt()}
          />
        ) : null}
      </AnimatePresence>
    </motion.main>
  );
}

function TitleBar({
  copy,
  devProfile,
  draggable,
  sidebarOpen,
  toggleSidebar,
}: {
  copy: Copy;
  devProfile: boolean;
  draggable: boolean;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}) {
  return (
    <header className={`app-titlebar${draggable ? " draggable" : ""}`}>
      <div className="titlebar-left no-drag">
        <IconButton
          icon="sidebar"
          label={sidebarOpen ? copy.hideSidebar : copy.showSidebar}
          onClick={toggleSidebar}
        />
        {devProfile ? <span className="titlebar-dev-profile">{copy.devBadge}</span> : null}
      </div>
    </header>
  );
}

function SidebarGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="sidebar-group">
      <h2>{label}</h2>
      <div>{children}</div>
    </section>
  );
}

function SidebarItem({
  active,
  badge,
  disabled = false,
  icon,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: "update";
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`sidebar-item${active ? " is-active" : ""}${tone === "update" ? " is-update" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon === "mcp" ? <McpMark /> : <Icon name={icon} />}
      <span>{label}</span>
      {badge ? <i className="sidebar-item-badge">{badge}</i> : null}
    </button>
  );
}

function BrowserSurface({
  browser,
  browserSlotRef,
  copy,
  operation,
  onContinueSetup,
  onViewUsage,
  platform,
  setError,
  workflowReady,
}: {
  browser: BrowserState | null;
  browserSlotRef: (node: HTMLDivElement | null) => void;
  copy: Copy;
  operation: OperationState | null;
  onContinueSetup: () => void;
  onViewUsage: () => void;
  platform: string;
  setError: (error: string | null) => void;
  workflowReady: boolean;
}) {
  const [passkeyContinuationRequested, setPasskeyContinuationRequested] = useState(false);
  const visible = browser?.visible === true;
  const navigationLocked = browser?.status === "running" || browser?.status === "testing";
  const passkeyWaiting = operation?.name === "passkey-login"
    && operation.status === "running"
    && browser?.authenticated !== true;
  useEffect(() => {
    if (!passkeyWaiting) setPasskeyContinuationRequested(false);
  }, [passkeyWaiting]);
  const navigate = async (action: "back" | "forward" | "reload") => {
    try {
      await api!.navigateBrowser(action);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  const zoom = async (action: "in" | "out" | "reset") => {
    try {
      await api!.zoomBrowser(action);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  const toggle = async () => {
    try {
      if (visible) await api!.hideBrowser();
      else await api!.showBrowser();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  const selectTab = async (tabId: string) => {
    try {
      await api!.selectBrowserTab(tabId);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  const closeTab = async (tabId: string) => {
    try {
      await api!.closeBrowserTab(tabId);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  const openPasskeyLogin = () => {
    if (operation?.status === "running") return;
    setError(null);
    void api!.openPasskeyLogin().catch(cause => setError(messageOf(cause)));
  };
  const continuePasskeyLogin = async () => {
    if (!passkeyWaiting || passkeyContinuationRequested) return;
    setPasskeyContinuationRequested(true);
    setError(null);
    try {
      await api!.continuePasskeyLogin();
    } catch (cause) {
      setPasskeyContinuationRequested(false);
      setError(messageOf(cause));
    }
  };

  return (
    <section className="browser-surface">
      <div className="browser-tab-strip" title={copy.browserTabLimit}>
        {(browser?.tabs ?? []).map((tab) => (
          <div
            className={`browser-tab${tab.active ? " is-active" : ""}`}
            key={tab.id}
            onClick={() => void selectTab(tab.id)}
            role="tab"
            aria-selected={tab.active}
          >
            <BrandMark small />
            <span title={tab.traceId ? `${tab.title} · ${tab.traceId}` : tab.title}>
              {browserTabTitleFromTitle(tab.title, copy)}
            </span>
            {tab.loading ? <i className="tab-spinner" /> : <StateDot state={browserTabTone(tab.status)} />}
            {tab.closable ? (
              <button
                aria-label={copy.hideTab}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(tab.id);
                }}
                title={copy.hideTab}
                type="button"
              >
                <Icon name="close" />
              </button>
            ) : null}
          </div>
        ))}
        <div className="browser-tab-drag draggable" />
      </div>
      <div className="browser-toolbar">
        <div className="browser-history">
          <IconButton
            disabled={navigationLocked || !browser?.canGoBack}
            icon="back"
            label={copy.back}
            onClick={() => void navigate("back")}
          />
          <IconButton
            disabled={navigationLocked || !browser?.canGoForward}
            icon="forward"
            label={copy.forward}
            onClick={() => void navigate("forward")}
          />
          <IconButton disabled={navigationLocked || !visible} icon="reload" label={copy.reload} onClick={() => void navigate("reload")} />
        </div>
        <div className="browser-address" title={browser?.url || copy.browserAddress}>
          <Icon name="globe" />
          <span>{formatBrowserAddress(browser?.url, copy)}</span>
        </div>
        <div className="browser-zoom-controls">
          <IconButton icon="minus" label={copy.zoomOut} onClick={() => void zoom("out")} />
          <button
            aria-label={copy.zoomReset}
            className="browser-zoom-reset"
            onClick={() => void zoom("reset")}
            title={copy.zoomReset}
            type="button"
          >
            {Math.round((browser?.zoomFactor ?? 1) * 100)}%
          </button>
          <IconButton icon="plus" label={copy.zoomIn} onClick={() => void zoom("in")} />
        </div>
        {platform === "darwin" && browser?.authenticated !== true ? (
          <button
            className="toolbar-text-button"
            disabled={passkeyWaiting && passkeyContinuationRequested}
            onClick={() => void (passkeyWaiting ? continuePasskeyLogin() : openPasskeyLogin())}
            type="button"
          >
            {passkeyWaiting
              ? passkeyContinuationRequested ? copy.passkeyImporting : copy.passkeyContinue
              : copy.passkeySignIn}
          </button>
        ) : null}
        <button className="toolbar-text-button" onClick={() => void toggle()} type="button">
          {visible ? copy.hideBrowser : copy.openChatgpt}
        </button>
        {browser?.loading ? <i className="browser-loading-line" /> : null}
      </div>
      <div className="browser-viewport" ref={browserSlotRef}>
        {!visible ? (
          <div className="browser-empty">
            <BrandMark />
            {browser?.authenticated ? (
              <span className={`browser-empty-kicker${workflowReady ? " is-ready" : ""}`}>
                <StateDot state={workflowReady ? "ready" : "busy"} />
                {workflowReady ? copy.workflowReadyKicker : copy.bridgeNeedsSetup}
              </span>
            ) : null}
            <h1>{browser?.authenticated ? copy.noActiveTask : copy.stepAccount}</h1>
            <p>{browser?.authenticated
              ? copy.noActiveTaskBody
              : passkeyWaiting ? copy.passkeyContinueBody : copy.stepAccountBody}</p>
            <div className="browser-empty-actions">
              <PrimaryButton
                disabled={passkeyWaiting}
                onClick={browser?.authenticated && !workflowReady ? onContinueSetup : () => void toggle()}
              >
                {browser?.authenticated
                  ? workflowReady ? copy.openChatgpt : copy.continueWorkflowSetup
                  : copy.signIn}
              </PrimaryButton>
              {browser?.authenticated && workflowReady ? (
                <SecondaryButton icon="usage" onClick={onViewUsage}>{copy.viewUsage}</SecondaryButton>
              ) : null}
              {platform === "darwin" && browser?.authenticated !== true ? (
                <SecondaryButton
                  disabled={passkeyWaiting && passkeyContinuationRequested}
                  onClick={passkeyWaiting ? continuePasskeyLogin : openPasskeyLogin}
                >
                  {passkeyWaiting
                    ? passkeyContinuationRequested ? copy.passkeyImporting : copy.passkeyContinue
                    : copy.passkeySignIn}
                </SecondaryButton>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="browser-underlay" aria-hidden="true">
            <span>{copy.loading}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function SetupSurface({
  activateBrowser,
  browser,
  copy,
  devProfile,
  operation,
  setError,
  showMcp,
  snapshot,
  updateState,
  updateSnapshot,
}: {
  activateBrowser: (show?: boolean) => Promise<void>;
  browser: BrowserState | null;
  copy: Copy;
  devProfile: boolean;
  operation: OperationState | null;
  setError: (error: string | null) => void;
  showMcp: () => void;
  snapshot: LauncherSnapshot;
  updateState: (state: LauncherState) => void;
  updateSnapshot: (snapshot: LauncherSnapshot) => void;
}) {
  const [localBusy, setLocalBusy] = useState(false);
  const [passkeyContinuationRequested, setPasskeyContinuationRequested] = useState(false);
  const passkeyWaiting = operation?.name === "passkey-login"
    && operation.status === "running"
    && browser?.authenticated !== true;
  const busy = localBusy
    || operation?.status === "running"
    || browser?.status === "loading"
    || browser?.status === "testing"
    || browser?.status === "running";
  useEffect(() => {
    if (!passkeyWaiting) setPasskeyContinuationRequested(false);
  }, [passkeyWaiting]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setLocalBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLocalBusy(false);
    }
  };

  const openLogin = () => run(async () => {
    await activateBrowser();
    await api!.openLogin();
  });
  const openPasskeyLogin = () => {
    if (busy) return;
    setLocalBusy(true);
    setError(null);
    void api!.openPasskeyLogin()
      .then(() => activateBrowser())
      .catch(cause => setError(messageOf(cause)))
      .finally(() => setLocalBusy(false));
  };
  const continuePasskeyLogin = async () => {
    if (!passkeyWaiting || passkeyContinuationRequested) return;
    setPasskeyContinuationRequested(true);
    setError(null);
    try {
      await api!.continuePasskeyLogin();
    } catch (cause) {
      setPasskeyContinuationRequested(false);
      setError(messageOf(cause));
    }
  };
  const smoke = () => run(async () => {
    await activateBrowser();
    await api!.smokeTest();
    updateSnapshot(await api!.snapshot());
  });
  const install = () => run(async () => {
    await api!.setupCore();
    updateSnapshot(await api!.snapshot());
  });
  const thinkingReady = browser?.authenticated === true && snapshot.smokePassed;
  const routingReady = snapshot.state.codexCatalogVerified === true;
  const executionReady = snapshot.state.mcpSetupComplete === true;
  const nextAction = !browser?.authenticated ? openLogin : !snapshot.smokePassed ? smoke
    : !snapshot.state.coreSetupComplete ? install : !routingReady ? null
    : !executionReady ? showMcp : () => void activateBrowser(true).catch(cause => setError(messageOf(cause)));

  return (
    <ContentSurface
      eyebrow={copy.required}
      subtitle={devProfile ? copy.devSetupSubtitle : copy.tagline}
      title={devProfile ? copy.devSetupTitle : copy.setupTitle}
    >
      <div className="setup-progress" role="status">
        <span>{copy.nextStep}</span>
        <strong>{!browser?.authenticated ? copy.stepAccount : !snapshot.smokePassed ? copy.stepSmoke
          : !snapshot.state.coreSetupComplete ? copy.stepInstall : !routingReady ? copy.awaitingCodex
          : !executionReady ? copy.configureMcp : copy.bridgeReady}</strong>
        <small>{[browser?.authenticated === true, snapshot.smokePassed, routingReady, executionReady].filter(Boolean).length} / 4</small>
        <PrimaryButton disabled={busy || !nextAction} onClick={() => nextAction?.()}>{copy.continue}</PrimaryButton>
      </div>
      {!devProfile ? (
        <BridgeOverview
          copy={copy}
          executionReady={executionReady}
          routingReady={routingReady}
          thinkingReady={thinkingReady}
        />
      ) : null}
      {!devProfile ? (
        <NoticeRow icon="activity" tone="neutral">
          {copy.backgroundRuntimeNotice}
        </NoticeRow>
      ) : null}
      <SectionHeading label={devProfile ? copy.devCoreSetup : copy.coreSetup} />
      <div className="setup-list">
        <SetupRow
          action={browser?.authenticated
            ? copy.signedIn
            : browser?.status === "loading" ? copy.checkingSignIn : copy.signIn}
          complete={browser?.authenticated === true}
          description={passkeyWaiting ? copy.passkeyContinueBody : copy.stepAccountBody}
          disabled={busy}
          index={1}
          onAction={openLogin}
          onSecondaryAction={snapshot.platform === "darwin" && browser?.authenticated !== true
            ? passkeyWaiting ? continuePasskeyLogin : openPasskeyLogin
            : undefined}
          secondaryAction={snapshot.platform === "darwin" && browser?.authenticated !== true
            ? passkeyWaiting
              ? passkeyContinuationRequested ? copy.passkeyImporting : copy.passkeyContinue
              : copy.passkeySignIn
            : undefined}
          secondaryDisabled={passkeyWaiting ? passkeyContinuationRequested : busy}
          title={copy.stepAccount}
        />
        <SetupRow
          action={snapshot.smokePassed ? copy.smokePassed : copy.runSmoke}
          complete={snapshot.smokePassed}
          description={copy.stepSmokeBody}
          disabled={busy || !browser?.authenticated}
          index={2}
          onAction={smoke}
          title={copy.stepSmoke}
        />
        <SetupRow
          action={snapshot.state.coreSetupComplete
            ? devProfile ? copy.devReinstall : copy.reinstall
            : devProfile ? copy.devInstall : copy.install}
          complete={snapshot.state.codexCatalogVerified === true}
          description={devProfile ? copy.devStepInstallBody : copy.stepInstallBody}
          disabled={busy || !browser?.authenticated
            || (!snapshot.smokePassed && snapshot.state.coreSetupComplete !== true)}
          index={3}
          onAction={install}
          repeatable
          title={devProfile ? copy.devStepInstall : copy.stepInstall}
        />
      </div>

      {!devProfile && snapshot.state.codexRestartRequired ? (
        <NoticeRow icon="alert" tone="warning">
          {copy.restartCodex}
        </NoticeRow>
      ) : null}

      <SectionHeading label="MCP" meta={devProfile ? copy.optional : copy.coreGoal} spaced />
      <button className="next-surface-row" disabled={!snapshot.state.codexCatalogVerified} onClick={showMcp} type="button">
        <McpMark />
        <span>
          <strong>{devProfile ? copy.devMcpTitle : copy.mcpTitle}</strong>
          <small>{devProfile ? copy.devMcpBody : copy.mcpBody}</small>
        </span>
        <em>{snapshot.state.mcpSetupComplete ? copy.mcpReady : copy.configureMcp}</em>
        <Icon name="chevron" />
      </button>
    </ContentSurface>
  );
}

function McpSurface({
  copy,
  devProfile,
  onDone,
  operation,
  setError,
  snapshot,
  updateState,
  updateSnapshot,
}: {
  copy: Copy;
  devProfile: boolean;
  onDone: () => void;
  operation: OperationState | null;
  setError: (error: string | null) => void;
  snapshot: LauncherSnapshot;
  updateState: (state: LauncherState) => void;
  updateSnapshot: (snapshot: LauncherSnapshot) => void;
}) {
  const [step, setStep] = useState(Math.min(2, Math.max(0, snapshot.state.mcpGuideStep || 0)));
  const [tunnelId, setTunnelId] = useState("");
  const [runtimeKey, setRuntimeKey] = useState("");
  const [credentialsConfigured, setCredentialsConfigured] = useState(snapshot.mcpCredentialsConfigured);
  const [replacingCredentials, setReplacingCredentials] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const busy = localBusy || operation?.status === "running";
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [connectorCopied, setConnectorCopied] = useState(false);
  const normalizedTunnelId = tunnelId.trim();
  const credentialsValid = /^tunnel_[a-f0-9]{32}$/.test(normalizedTunnelId)
    && runtimeKey.trim().length >= 20;
  const steps = useMemo(() => [
    { title: copy.mcpStepOne, body: copy.mcpStepOneBody },
    { title: copy.mcpStepTwo, body: copy.mcpStepTwoBody },
    { title: copy.mcpStepThree, body: copy.mcpStepThreeBody },
  ], [copy]);

  const move = async (next: number) => {
    updateState(await api!.setMcpStep(next));
    setStep(next);
  };
  const safeMove = async (next: number) => {
    if (busy) return;
    setLocalBusy(true);
    setError(null);
    try {
      await move(next);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLocalBusy(false);
    }
  };
  const openExternal = async (url: string) => {
    setError(null);
    try {
      await api!.openExternal(url);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  const install = async () => {
    if (busy) return;
    setLocalBusy(true);
    setError(null);
    try {
      await api!.setupMcp({
        ...(credentialsConfigured && !replacingCredentials
          ? { replace: false }
          : { tunnelId: normalizedTunnelId, runtimeKey: runtimeKey.trim(), replace: true }),
      });
      setRuntimeKey("");
      setTunnelId("");
      setCredentialsConfigured(true);
      setReplacingCredentials(false);
      setDoctor(null);
      updateSnapshot(await api!.snapshot());
      await move(2);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLocalBusy(false);
    }
  };
  const verify = async () => {
    if (busy) return;
    setLocalBusy(true);
    setError(null);
    setDoctor(null);
    try {
      setDoctor(await api!.verifyMcp());
      updateSnapshot(await api!.snapshot());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLocalBusy(false);
    }
  };
  const copyConnectorName = async () => {
    setError(null);
    try {
      await api!.copyText(snapshot.connectorName);
      setConnectorCopied(true);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  return (
    <ContentSurface
      fit
      subtitle={devProfile ? copy.devMcpSubtitle : copy.mcpSubtitle}
      title={devProfile ? copy.devMcpTitle : "MCP"}
    >
      {!snapshot.state.codexCatalogVerified ? (
        <NoticeRow icon="setup" tone="warning">{copy.mcpCatalogRequired}</NoticeRow>
      ) : null}

      <div className="wizard-stepper" aria-label={`${step + 1} / 3`}>
        {steps.map((item, index) => (
          <button
            className={`${index === step ? "is-active" : ""}${index < step ? " is-complete" : ""}`}
            aria-current={index === step ? "step" : undefined}
            disabled={busy || index > step}
            key={item.title}
            onClick={() => void safeMove(index)}
            type="button"
          >
            <span>{index < step ? <Icon name="check" /> : index + 1}</span>
            <em>{item.title}</em>
          </button>
        ))}
      </div>

      <div className="mcp-stage">
        <div className="guide-media">
          <img alt={`${copy.guideVideo}: ${steps[step]!.title}`} src={MCP_GUIDE_MEDIA[step]} />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            animate={{ opacity: 1, x: 0 }}
            className="wizard-content"
            exit={{ opacity: 0, x: -8 }}
            initial={{ opacity: 0, x: 8 }}
            key={step}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <header>
              <span>0{step + 1}</span>
              <div>
                <h2>{steps[step]!.title}</h2>
                <p>{steps[step]!.body}</p>
              </div>
            </header>

            {step === 0 ? (
              <div className="inline-actions">
                <SecondaryButton icon="external" onClick={() => void openExternal(snapshot.urls.tunnels)}>
                  {copy.openTunnels}
                </SecondaryButton>
                <SecondaryButton icon="external" onClick={() => void openExternal(snapshot.urls.keys)}>
                  {copy.openKeys}
                </SecondaryButton>
              </div>
            ) : null}
            {step === 1 ? (
              credentialsConfigured && !replacingCredentials ? (
                <div className="saved-credentials">
                  <NoticeRow icon="check" tone="success">
                    <span>
                      <strong>{copy.credentialsConfigured}</strong>
                      <small>{copy.credentialsConfiguredBody}</small>
                    </span>
                  </NoticeRow>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setReplacingCredentials(true)}
                    type="button"
                  >
                    {copy.replaceCredentials}
                  </button>
                </div>
              ) : (
                <div className="field-list">
                  <FieldRow label={copy.tunnelId}>
                    <input
                      autoCapitalize="none"
                      autoCorrect="off"
                      disabled={busy}
                      onChange={(event) => setTunnelId(event.target.value)}
                      placeholder="tunnel_…"
                      spellCheck={false}
                      value={tunnelId}
                    />
                  </FieldRow>
                  <FieldRow label={copy.runtimeKey}>
                    <input
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      disabled={busy}
                      onChange={(event) => setRuntimeKey(event.target.value)}
                      placeholder="sk-…"
                      spellCheck={false}
                      type="password"
                      value={runtimeKey}
                    />
                  </FieldRow>
                  {credentialsConfigured ? (
                    <button
                      className="text-button keep-credentials"
                      disabled={busy}
                      onClick={() => {
                        setTunnelId("");
                        setRuntimeKey("");
                        setReplacingCredentials(false);
                      }}
                      type="button"
                    >
                      {copy.keepCredentials}
                    </button>
                  ) : null}
                  <p className="field-format-hint">{copy.mcpCredentialFormatHint}</p>
                </div>
              )
            ) : null}
            {step === 1 ? (
              <p className="mcp-step-two-hint">
                {snapshot.state.codexCatalogVerified ? copy.mcpStepTwoHint : copy.mcpCatalogRequired}
              </p>
            ) : null}
            {step === 2 ? (
              <div className="connector-actions">
                <NoticeRow icon="alert" tone="warning">
                  {devProfile ? copy.devConnectorIsolationNotice : copy.connectorMigrationNotice}
                </NoticeRow>
                <div className="connector-name">
                  <span>{copy.connectorName}</span>
                  <div>
                    <code>{snapshot.connectorName}</code>
                    <button className="text-button" onClick={() => void copyConnectorName()} type="button">
                      {connectorCopied ? copy.connectorCopied : copy.copyConnector}
                    </button>
                  </div>
                </div>
                <div className="inline-actions">
                  <SecondaryButton
                    icon="external"
                    onClick={() => void (async () => {
                      setError(null);
                      try {
                        await api!.openExternal(snapshot.urls.connectors);
                      } catch (cause) {
                        setError(messageOf(cause));
                      }
                    })()}
                  >
                    {copy.openConnectors}
                  </SecondaryButton>
                </div>
                {doctor ? <DoctorSummary copy={copy} report={doctor} /> : null}
              </div>
            ) : null}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="wizard-footer">
        <button className="text-button" disabled={step === 0 || busy} onClick={() => void safeMove(step - 1)} type="button">
          {copy.previous}
        </button>
        {step === 0 ? <PrimaryButton disabled={busy} onClick={() => void safeMove(1)}>{copy.next}</PrimaryButton> : null}
        {step === 1 ? (
          <PrimaryButton
            disabled={
              busy
              || !snapshot.state.codexCatalogVerified
              || ((!credentialsConfigured || replacingCredentials) && !credentialsValid)
            }
            onClick={() => void install()}
          >
            {busy ? copy.running : credentialsConfigured && !replacingCredentials ? copy.reconnect : copy.connect}
          </PrimaryButton>
        ) : null}
        {step === 2 ? (
          <PrimaryButton
            disabled={busy}
            onClick={() => void (doctor?.ok ? onDone() : verify())}
          >
            {busy
              ? operation?.name === "mcp-verification" && operation.status === "running"
                ? operation.message
                : copy.running
              : doctor?.ok ? copy.done : copy.verifyRuntime}
          </PrimaryButton>
        ) : null}
      </div>
    </ContentSurface>
  );
}

function UsageSurface({
  copy,
  language,
  pricingUrl,
  setError,
}: {
  copy: Copy;
  language: Language;
  pricingUrl: string;
  setError: (error: string | null) => void;
}) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const requestVersion = useRef(0);
  const refreshing = useRef(false);
  const actionPending = useRef(false);
  const active = useRef(false);

  const refresh = useCallback(async (showBusy = false) => {
    if (refreshing.current || actionPending.current) return;
    refreshing.current = true;
    const version = ++requestVersion.current;
    if (showBusy) setBusy(true);
    try {
      const next = await api!.usageSummary();
      if (next.storageError) throw new Error(next.storageError);
      if (active.current && version === requestVersion.current) {
        setSummary(next);
        setLoadError(null);
      }
    } catch (cause) {
      if (active.current && version === requestVersion.current) setLoadError(messageOf(cause));
    } finally {
      if (version === requestVersion.current) {
        refreshing.current = false;
        if (active.current && showBusy) setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    active.current = true;
    const load = () => { if (!document.hidden) void refresh(); };
    load();
    const timer = window.setInterval(load, 5_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active.current = false;
      requestVersion.current += 1;
      refreshing.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [refresh]);

  const reset = async () => {
    if (busy || actionPending.current) return;
    actionPending.current = true;
    requestVersion.current += 1;
    refreshing.current = false;
    setBusy(true);
    setResetDone(false);
    try {
      const result = await api!.resetUsage();
      if (active.current) {
        setSummary(result.summary);
        setLoadError(null);
        setResetDone(!result.cancelled);
      }
    } catch (cause) {
      if (active.current) setError(messageOf(cause));
    } finally {
      actionPending.current = false;
      if (active.current) setBusy(false);
    }
  };

  const exportSummary = async () => {
    if (busy || actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setExported(false);
    try {
      const path = await api!.exportUsage();
      if (active.current) setExported(path !== null);
    } catch (cause) {
      if (active.current) setError(messageOf(cause));
    } finally {
      actionPending.current = false;
      if (active.current) setBusy(false);
    }
  };

  const days = useMemo(() => usageLastSevenDays(summary?.days ?? []), [summary?.days]);
  const recentTokens = days.reduce((total, day) => total + day.totalTokens, 0);
  const maxDayTokens = Math.max(1, ...days.map(day => day.totalTokens));
  const lifetime = summary?.lifetime ?? emptyUsageTotals();

  return (
    <ContentSurface subtitle={copy.usageSubtitle} title={copy.usageTitle}>
      <div className="usage-toolbar">
        <span className="usage-estimated-badge" role="status">{busy ? copy.loading : exported ? copy.exportDone : copy.estimated}</span>
        <div>
          <SecondaryButton icon="reload" disabled={busy} onClick={() => void refresh(true)}>
            {copy.usageRefresh}
          </SecondaryButton>
          <SecondaryButton
            icon="external"
            disabled={busy || !summary}
            onClick={() => void exportSummary()}
          >
            {copy.usageExport}
          </SecondaryButton>
        </div>
      </div>

      {loadError ? <NoticeRow icon="alert" tone="warning">
        <strong>{summary ? copy.usageStale : copy.usageLoadFailed}</strong>
        <span className="load-error-detail">{loadError}</span>
      </NoticeRow> : null}
      {!summary ? <div className="surface-empty" role="status"><Icon name="usage" /><span>{loadError ? copy.retryHint : copy.loading}</span></div> : <>
      <div className="usage-hero-grid">
        <article className="usage-hero-card is-primary">
          <span>{copy.usageWebTokens}</span>
          <strong title={formatInteger(lifetime.totalTokens, language)}>{formatCompactTokens(lifetime.totalTokens, language)}</strong>
          <small>{copy.usageWebTokensBody}</small>
          <div>
            <em>{copy.usageInput} {formatCompactTokens(lifetime.inputTokens, language)}</em>
            <em>{copy.usageOutput} {formatCompactTokens(lifetime.outputTokens, language)}</em>
          </div>
        </article>
        <article className="usage-hero-card is-savings">
          <span>{copy.usageSavings}</span>
          <strong>{formatUsd(lifetime.estimatedSavingsUsd, language)}</strong>
          <small>{copy.usageSavingsBody}</small>
          {!!lifetime.unpricedTurns && <small>{language === "zh-CN" ? `${lifetime.unpricedTurns} 个回合价格未知，金额未包含这些回合。` : `${lifetime.unpricedTurns} unpriced turns excluded from this value.`}</small>}
        </article>
        <article className="usage-hero-card">
          <span>{copy.usageTurns}</span>
          <strong>{formatInteger(lifetime.turns, language)}</strong>
          <small>{copy.usageTurnsBody}</small>
        </article>
      </div>

      <div className="usage-period-grid">
        <UsagePeriod label={copy.usageToday} language={language} totals={summary?.today ?? emptyUsageTotals()} />
        <UsagePeriod label={copy.usageLast7} language={language} totals={summary?.last7Days ?? emptyUsageTotals()} />
        <UsagePeriod label={copy.usageLifetime} language={language} totals={lifetime} />
      </div>

      <section className="usage-trend-card">
        <header>
          <span>{copy.usageTrend}</span>
          <small>{copy.usageWebTokens}</small>
        </header>
        {recentTokens === 0 ? (
          <div className="usage-empty">
            <Icon name="usage" />
            <span>{copy.usageNoData}</span>
          </div>
        ) : (
          <div className="usage-bars">
            {days.map(day => {
              const height = day.totalTokens === 0 ? 2 : Math.max(8, Math.round((day.totalTokens / maxDayTokens) * 100));
              return (
                <div
                  aria-label={`${formatUsageDate(day.date, language)}: ${formatInteger(day.totalTokens, language)} tokens`}
                  className="usage-bar-column"
                  key={day.date}
                  title={`${formatUsageDate(day.date, language)} · ${formatInteger(day.totalTokens, language)} tokens`}
                >
                  <span><i style={{ height: `${height}%` }} /></span>
                  <small>{formatUsageWeekday(day.date, language)}</small>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <p className="usage-updated">{copy.lastUpdated} <time dateTime={summary.generatedAt}>{formatTime(summary.generatedAt, language)}</time></p>
      </>}

      <section className="usage-method-card">
        <div>
          <Icon name="alert" />
          <span>
            <strong>{copy.usageEstimateTitle}</strong>
            <p>{copy.usageEstimateBody}</p>
            <small>{copy.usagePrivacy}</small>
          </span>
        </div>
        <footer>
          <span>{summary ? `${copy.usagePricingBasis} ${summary.pricing.asOf}` : copy.estimated}</span>
          <button
            className="text-button"
            onClick={() => void api!.openExternal(pricingUrl).catch((cause) => setError(messageOf(cause)))}
            type="button"
          >
            {copy.usagePricingSource}
          </button>
        </footer>
      </section>

      <div className="usage-danger-row">
        <span role="status">{resetDone ? copy.usageResetDone : copy.usagePrivacy}</span>
        <button className="text-button is-danger" disabled={busy || !summary} onClick={() => void reset()} type="button">
          {copy.usageReset}
        </button>
      </div>
    </ContentSurface>
  );
}

function UsagePeriod({ label, language, totals }: { label: string; language: Language; totals: UsageTotals }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{formatCompactTokens(totals.totalTokens, language)}</strong>
      <small>{formatUsd(totals.estimatedSavingsUsd, language)} · {formatInteger(totals.turns, language)}</small>
    </article>
  );
}

function ActivitySurface({
  copy,
  language,
  logs,
  setError,
}: {
  copy: Copy;
  language: Language;
  logs: LogRecord[];
  setError: (error: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const visibleLogs = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return [...logs].reverse().filter(record => (level === "all" || record.level === level)
      && (!search || `${record.event} ${humanEvent(record.event)} ${JSON.stringify(record.detail)}`.toLocaleLowerCase().includes(search)));
  }, [logs, query, level]);
  const exportLogs = async () => {
    if (exporting) return;
    setExporting(true);
    setExported(false);
    try { setExported((await api!.exportLogs()) !== null); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setExporting(false); }
  };
  return (
    <ContentSurface subtitle={copy.activitySubtitle} title={copy.activityTitle}>
      <div className="section-heading activity-heading">
        <span>{copy.recentActivity}</span>
        <SecondaryButton
          icon="external"
          disabled={exporting}
          onClick={() => void exportLogs()}
        >
          {copy.exportSafeLog}
        </SecondaryButton>
      </div>
      <div className="activity-filters">
        <input aria-label={copy.searchActivity} type="search" placeholder={copy.searchActivity}
          value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label={copy.activityLevel} value={level} onChange={event => setLevel(event.target.value)}>
          <option value="all">{copy.allEvents}</option>
          <option value="error">{copy.errorEvents}</option>
          <option value="warning">{copy.warningEvents}</option>
          <option value="info">{copy.infoEvents}</option>
          <option value="debug">{copy.debugEvents}</option>
        </select>
      </div>
      <p className="activity-count" role="status">{exported ? copy.exportDone : `${visibleLogs.length} / ${logs.length} · ${copy.recentActivity}`}</p>
      <div className="activity-table">
        {visibleLogs.length === 0 ? (
          <div className="surface-empty">
            <Icon name="logs" />
            <span>{logs.length === 0 ? copy.noLogs : copy.noMatchingLogs}</span>
            {logs.length > 0 ? <button className="text-button" onClick={() => { setQuery(""); setLevel("all"); }} type="button">{copy.clearFilters}</button> : null}
          </div>
        ) : null}
        {visibleLogs.map((record, index) => (
          <details className="activity-entry" key={`${record.at}-${record.event}-${index}`}>
          <summary className="activity-row">
            <StateDot state={record.level === "error" ? "error" : record.level === "warning" ? "busy" : "ready"} />
            <div>
              <strong>{humanEvent(record.event)}</strong>
              <span>{logDetail(record.detail)}</span>
            </div>
            <time dateTime={record.at} title={record.at}>{formatTime(record.at, language)}</time>
            <Icon name="chevron" />
          </summary>
          <div className="activity-detail"><strong>{record.level.toUpperCase()} · {record.event}</strong><pre>{JSON.stringify(record.detail, null, 2)}</pre></div>
          </details>
        ))}
      </div>
    </ContentSurface>
  );
}

function SettingsSurface({
  copy,
  devProfile,
  language,
  setError,
  snapshot,
  updateState,
  updateSnapshot,
}: {
  copy: Copy;
  devProfile: boolean;
  language: Language;
  setError: (error: string | null) => void;
  snapshot: LauncherSnapshot;
  updateState: (state: LauncherState) => void;
  updateSnapshot: (snapshot: LauncherSnapshot) => void;
}) {
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnsCancelled, setTurnsCancelled] = useState(false);
  const [integrationRemoved, setIntegrationRemoved] = useState(false);

  const updateLanguage = async (next: Language) => {
    try {
      updateState(await api!.setLanguage(next));
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  const runDoctor = async () => {
    setBusy(true);
    try {
      setDoctor(await api!.doctor());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };
  const cancelTurns = async () => {
    setBusy(true);
    setError(null);
    try {
      await api!.cancelTurns();
      setTurnsCancelled(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };
  const setBiggerContext = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      updateState(await api!.setBiggerContext(enabled));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };
  const uninstallIntegration = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api!.uninstallIntegration();
      if (!result.cancelled) {
        updateState(result.state);
        updateSnapshot(await api!.snapshot());
        setIntegrationRemoved(true);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentSurface narrow title={devProfile ? copy.devSettingsTitle : copy.settingsTitle}>
      <SectionHeading label={copy.general} />
      <div className="settings-list">
        {!devProfile ? <SettingRow body={copy.launchAtLoginBody} label={copy.launchAtLogin}>
          <Switch
            checked={snapshot.state.autoStart}
            label={copy.launchAtLogin}
            onChange={(checked) => void api!.setAutostart(checked)
              .then((result) => updateState(result.state))
              .catch((cause) => setError(messageOf(cause)))}
          />
        </SettingRow> : null}
        <SettingRow body={devProfile ? copy.devKeepRunningBody : copy.keepRunningOnCloseBody} label={copy.keepRunningOnClose}>
          <Switch
            checked={snapshot.state.keepRunningOnClose}
            label={copy.keepRunningOnClose}
            onChange={(checked) => void api!.setPreference("keepRunningOnClose", checked)
              .then(updateState)
              .catch((cause) => setError(messageOf(cause)))}
          />
        </SettingRow>
        <SettingRow body={copy.showDuringTurnsBody} label={copy.showDuringTurns}>
          <Switch
            checked={snapshot.state.showBrowserDuringTurns}
            label={copy.showDuringTurns}
            onChange={(checked) => void api!.setPreference("showBrowserDuringTurns", checked)
              .then(updateState)
              .catch((cause) => setError(messageOf(cause)))}
          />
        </SettingRow>
        <SettingRow body={copy.taskNotificationsBody} label={copy.taskNotifications}>
          <Switch
            checked={snapshot.state.taskNotifications}
            label={copy.taskNotifications}
            onChange={(checked) => void api!.setPreference("taskNotifications", checked)
              .then(updateState)
              .catch((cause) => setError(messageOf(cause)))}
          />
        </SettingRow>
        <SettingRow body={copy.biggerContextBody} label={copy.biggerContext}>
          <Switch
            checked={snapshot.state.experimentalBiggerContext}
            label={copy.biggerContext}
            disabled={busy || snapshot.state.coreSetupComplete !== true}
            onChange={(checked) => void setBiggerContext(checked)}
          />
        </SettingRow>
        <SettingRow body={copy.chooseLanguageHint} label={copy.language}>
          <LanguageMenu copy={copy} language={language} onChange={(next) => void updateLanguage(next)} />
        </SettingRow>
        <SettingRow body={copy.themeHint} label={copy.theme}>
          <ThemeMenu
            copy={copy}
            onChange={(next) => void api!.setTheme(next)
              .then(updateState)
              .catch((cause) => setError(messageOf(cause)))}
            theme={snapshot.state.theme}
          />
        </SettingRow>
      </div>

      {!devProfile && snapshot.state.codexRestartRequired ? (
        <NoticeRow icon="alert" tone="warning">
          {copy.restartCodex}
        </NoticeRow>
      ) : null}

      {!devProfile ? (
        <NoticeRow icon="browser" tone="neutral">
          {copy.privateSessionNotice}
        </NoticeRow>
      ) : null}

      <SectionHeading label={copy.diagnostics} spaced />
      <button className="diagnostic-row" disabled={busy} onClick={() => void runDoctor()} type="button">
        <Icon name="activity" />
        <span>
          <strong>{copy.runDoctor}</strong>
          <small>{doctor ? (doctor.ok ? copy.healthy : copy.needsAttention) : copy.status}</small>
        </span>
        <Icon name="chevron" />
      </button>
      {!devProfile ? <button className="diagnostic-row" disabled={busy} onClick={() => void cancelTurns()} type="button">
        <Icon name="close" />
        <span>
          <strong>{copy.cancelTurns}</strong>
          <small>{turnsCancelled ? copy.turnsCancelled : copy.cancelTurnsBody}</small>
        </span>
        <Icon name="chevron" />
      </button> : null}
      {!devProfile ? <button className="diagnostic-row" disabled={busy} onClick={() => void uninstallIntegration()} type="button">
        <Icon name="close" />
        <span>
          <strong>{copy.uninstallIntegration}</strong>
          <small>{integrationRemoved ? copy.integrationRemoved : copy.uninstallIntegrationBody}</small>
        </span>
        <Icon name="chevron" />
      </button> : null}
      {doctor ? <DoctorSummary copy={copy} report={doctor} /> : null}

      <div className="about-row">
        <BrandMark small />
        <span>
          <strong>{copy.product}</strong>
          <small>
            {devProfile ? `${copy.devBadge} · ${snapshot.profilePaths.coreHome} · ` : ""}
            {platformLabel(snapshot.platform)} · v{snapshot.version}
          </small>
        </span>
      </div>
    </ContentSurface>
  );
}

function ContentSurface({
  children,
  eyebrow,
  fit = false,
  narrow = false,
  subtitle,
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  fit?: boolean;
  narrow?: boolean;
  subtitle?: string;
  title: string;
}) {
  return (
    <section className="content-surface">
      <div className={`content-scroll${narrow ? " is-narrow" : ""}${fit ? " is-fit" : ""}`}>
        <header className="surface-header">
          {eyebrow ? <span>{eyebrow}</span> : null}
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

function SetupRow({
  action,
  complete,
  description,
  disabled,
  index,
  onAction,
  onSecondaryAction,
  repeatable = false,
  secondaryAction,
  secondaryDisabled = false,
  title,
}: {
  action: string;
  complete: boolean;
  description: string;
  disabled: boolean;
  index: number;
  onAction: () => void;
  onSecondaryAction?: () => void;
  repeatable?: boolean;
  secondaryAction?: string;
  secondaryDisabled?: boolean;
  title: string;
}) {
  return (
    <div className={`setup-row${complete ? " is-complete" : ""}`}>
      <span className="setup-index">{complete ? <Icon name="check" /> : index}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="setup-actions">
        {secondaryAction && onSecondaryAction ? (
          <SecondaryButton disabled={secondaryDisabled || complete} onClick={onSecondaryAction}>
            {secondaryAction}
          </SecondaryButton>
        ) : null}
        <SecondaryButton disabled={disabled || (complete && !repeatable)} onClick={onAction}>
          {action}
        </SecondaryButton>
      </div>
    </div>
  );
}

function SectionHeading({ label, meta, spaced = false }: { label: string; meta?: string; spaced?: boolean }) {
  return (
    <div className={`section-heading${spaced ? " is-spaced" : ""}`}>
      <span>{label}</span>
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}

function NoticeRow({
  children,
  icon,
  tone,
}: {
  children: ReactNode;
  icon: IconName;
  tone: "neutral" | "warning" | "success";
}) {
  return (
    <div className={`notice-row tone-${tone}`}>
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}

function SettingRow({ body, children, label }: { body: string; children: ReactNode; label: string }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <p>{body}</p>
      </div>
      {children}
    </div>
  );
}

function BridgeOverview({
  copy,
  executionReady,
  routingReady,
  thinkingReady,
}: {
  copy: Copy;
  executionReady: boolean;
  routingReady: boolean;
  thinkingReady: boolean;
}) {
  const ready = thinkingReady && routingReady && executionReady;
  return (
    <section className={`bridge-overview${ready ? " is-ready" : ""}`}>
      <header>
        <div>
          <span>{copy.coreGoal}</span>
          <h2>{copy.bridgeOverviewTitle}</h2>
        </div>
        <small><StateDot state={ready ? "ready" : "busy"} />{ready ? copy.bridgeReady : copy.bridgeNeedsSetup}</small>
      </header>
      <p>{copy.bridgeOverviewBody}</p>
      <div className="bridge-pipeline">
        <BridgeRole
          body={copy.thinkingRoleBody}
          icon="browser"
          ready={thinkingReady}
          title={copy.thinkingRole}
        />
        <span aria-hidden="true">→</span>
        <BridgeRole
          body={copy.routingRoleBody}
          icon="mcp"
          ready={routingReady}
          title={copy.routingRole}
        />
        <span aria-hidden="true">→</span>
        <BridgeRole
          body={copy.executionRoleBody}
          icon="setup"
          ready={executionReady}
          title={copy.executionRole}
        />
      </div>
      <div className="bridge-usage-note">
        <Icon name="activity" />
        <span>{copy.usageBoundary}</span>
      </div>
    </section>
  );
}

function BridgeRole({
  body,
  icon,
  ready,
  title,
}: {
  body: string;
  icon: IconName;
  ready: boolean;
  title: string;
}) {
  return (
    <div className={`bridge-role${ready ? " is-ready" : ""}`}>
      <span><Icon name={icon} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
      <StateDot state={ready ? "ready" : "idle"} />
    </div>
  );
}

function FieldRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

function DoctorSummary({ copy, report }: { copy: Copy; report: DoctorReport }) {
  const visibleChecks = report.ok
    ? report.checks.slice(-6)
    : report.checks.filter((check) => check.status !== "ok");
  return (
    <div className={`doctor-summary${report.ok ? " is-healthy" : ""}`}>
      <header>
        <Icon name={report.ok ? "check" : "activity"} />
        <strong>{report.ok ? copy.healthy : copy.needsAttention}</strong>
      </header>
      <div>
        {visibleChecks.map((check) => (
          <div className="doctor-check" key={check.id}><p>
            <StateDot state={check.status === "ok" ? "ready" : check.status === "warning" ? "busy" : "error"} />
            <span>{doctorCheckMessage(copy, check)}</span>
          </p>{check.detail ? <details><summary>{copy.diagnosticDetails}</summary><pre>{check.detail}</pre></details> : null}</div>
        ))}
      </div>
    </div>
  );
}

function doctorCheckMessage(copy: Copy, check: DoctorCheck): string {
  if (check.id !== "codex") return check.message;
  if (check.message.startsWith("Chat2Codex is active")) return copy.doctorCodexActive;
  if (check.message.startsWith("Chat2Codex is disconnected")) return copy.doctorCodexDisconnected;
  if (check.message.startsWith("Chat2Codex is not installed")) return copy.doctorCodexNative;
  if (check.message.startsWith("Codex configuration changed after setup")) return copy.doctorCodexChanged;
  return check.message;
}

function WelcomeWorkflow({
  body,
  marker,
  recommended = false,
  title,
}: {
  body: string;
  marker: string;
  recommended?: boolean;
  title: string;
}) {
  return (
    <article className={`welcome-workflow${recommended ? " is-recommended" : ""}`}>
      <span>{marker}</span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      {recommended ? <Icon name="check" /> : null}
    </article>
  );
}

function WelcomeOption({
  active,
  disabled,
  detail,
  label,
  marker,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  detail: string;
  label: string;
  marker: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={active}
      disabled={disabled}
      tabIndex={active ? 0 : -1}
      className={`welcome-option${active ? " is-active" : ""}`}
      onClick={onClick}
      role="radio"
      type="button"
    >
      <span>{marker}</span>
      <strong>{label}</strong>
      <small>{detail}</small>
      {active ? <Icon name="check" /> : null}
    </button>
  );
}

function WelcomeAction({
  complete,
  disabled,
  icon,
  label,
  onClick,
}: {
  complete: boolean;
  disabled?: boolean;
  icon: "github";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`welcome-option is-social${complete ? " is-complete" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span><Icon name={icon} /></span>
      <strong>{label}</strong>
      <Icon name={complete ? "check" : "external"} />
    </button>
  );
}

function PrimaryButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="button-primary" disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled = false,
  icon,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  icon?: IconName;
  onClick: () => void;
}) {
  return (
    <button className="button-secondary" disabled={disabled} onClick={onClick} type="button">
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </button>
  );
}

function IconButton({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={icon} />
    </button>
  );
}

function Switch({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span />
    </button>
  );
}

function LanguageMenu({ copy, language, onChange }: { copy: Copy; language: Language; onChange: (language: Language) => void }) {
  return (
    <select className="preference-select" aria-label={copy.language} value={language} onChange={event => onChange(event.target.value as Language)}>
      <option value="zh-CN">{copy.chinese}</option>
      <option value="en">{copy.english}</option>
    </select>
  );
}

function ThemeMenu({ copy, onChange, theme }: { copy: Copy; onChange: (theme: Theme) => void; theme: Theme }) {
  return (
    <select className="preference-select" aria-label={copy.theme} value={theme} onChange={event => onChange(event.target.value as Theme)}>
      <option value="light">{copy.lightTheme}</option>
      <option value="dark">{copy.darkTheme}</option>
    </select>
  );
}

function StateDot({ state }: { state: "idle" | "ready" | "busy" | "error" }) {
  return <i aria-hidden="true" className={`state-dot is-${state}`} />;
}

function ActionDot({ pulse = false, tone }: { pulse?: boolean; tone: "required" | "optional" | "success" | "error" }) {
  return <i aria-hidden="true" className={`action-dot is-${tone}${pulse ? " is-pulse" : ""}`} />;
}

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? " is-small" : ""}`}>
      <img alt="" aria-hidden="true" src={APP_ICON} />
    </span>
  );
}

function ErrorToast({ copy, message, onDismiss }: { copy: Copy; message: string; onDismiss: () => void }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="error-toast"
      role="alert"
      exit={{ opacity: 0, y: 8 }}
      initial={{ opacity: 0, y: 8 }}
      transition={PANEL_TRANSITION}
    >
      <StateDot state="error" />
      <span>
        <strong>{copy.error}</strong>
        <p>{message}</p>
      </span>
      <button onClick={onDismiss} type="button">{copy.dismiss}</button>
    </motion.div>
  );
}

function SessionRefreshReminder({
  busy,
  copy,
  onDismiss,
  onLogout,
}: {
  busy: boolean;
  copy: Copy;
  onDismiss: () => void;
  onLogout: () => void;
}) {
  return (
    <motion.aside
      animate={{ opacity: 1, y: 0 }}
      aria-live="polite"
      className="session-refresh-reminder"
      exit={{ opacity: 0, y: -8 }}
      initial={{ opacity: 0, y: -8 }}
      transition={PANEL_TRANSITION}
    >
      <span className="session-refresh-reminder-icon"><Icon name="alert" /></span>
      <div className="session-refresh-reminder-copy">
        <strong>{copy.sessionReminderTitle}</strong>
        <p>{copy.sessionReminderBody}</p>
      </div>
      <div className="session-refresh-reminder-actions">
        <button className="text-button" disabled={busy} onClick={onDismiss} type="button">
          {copy.dismiss}
        </button>
        <button className="button-primary" disabled={busy} onClick={onLogout} type="button">
          {copy.logOut}
        </button>
      </div>
    </motion.aside>
  );
}

function BiggerContextRecommendation({
  busy,
  checked,
  copy,
  onChange,
  onClose,
}: {
  busy: boolean;
  checked: boolean;
  copy: Copy;
  onChange: (checked: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef({ busy, onClose });
  closeRef.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeRef.current.busy) closeRef.current.onClose();
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    dialog?.addEventListener("keydown", onKeyDown);
    return () => {
      dialog?.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <motion.div
      ref={dialogRef}
      tabIndex={-1}
      animate={{ opacity: 1 }}
      aria-describedby="bigger-context-recommendation-body"
      aria-labelledby="bigger-context-recommendation-title"
      aria-modal="true"
      className="bigger-context-recommendation-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      transition={{ duration: 0.18 }}
    >
      <motion.section
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bigger-context-recommendation"
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={PANEL_TRANSITION}
      >
        <header className="bigger-context-recommendation-header">
          <small>{copy.biggerContext}</small>
          <h2 id="bigger-context-recommendation-title">{copy.biggerContextRecommendationTitle}</h2>
        </header>
        <p className="bigger-context-recommendation-body" id="bigger-context-recommendation-body">{copy.biggerContextRecommendationBody}</p>
        <div className="bigger-context-recommendation-toggle">
          <div>
            <strong>{copy.biggerContext}</strong>
            <p>{copy.biggerContextRecommendationToggleBody}</p>
          </div>
          <Switch checked={checked} disabled={busy} label={copy.biggerContext} onChange={onChange} />
        </div>
        {checked ? <p className="bigger-context-recommendation-restart">{copy.restartCodex}</p> : null}
        <footer>
          <SecondaryButton disabled={busy} onClick={onClose}>{copy.close}</SecondaryButton>
        </footer>
      </motion.section>
    </motion.div>
  );
}

function McpMark() {
  return <i aria-hidden="true" className="mcp-mark" />;
}

function LaunchLoading() {
  return (
    <main className="launch-loading">
      <BrandMark />
      <span />
    </main>
  );
}

function FatalMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <main className="fatal-message">
      <BrandMark />
      <h1>Chat2Codex</h1>
      <p role="alert">{message}</p>
      {onRetry ? <PrimaryButton onClick={onRetry}>重试 / Retry</PrimaryButton> : null}
    </main>
  );
}

function smokePassedForState(state: LauncherState, version: string): boolean {
  return state.browserSmokePassed === true && state.browserSmokeVersion === version;
}

function browserTabTitleFromTitle(value: string | undefined, copy: Copy): string {
  const title = value?.trim();
  if (!title || title === "about:blank" || title.includes("chat2codex-browser-host")) return copy.temporaryChat;
  return title.replace(/\s*[|–-]\s*ChatGPT\s*$/i, "") || copy.temporaryChat;
}

function browserTabTone(status: BrowserState["tabs"][number]["status"]): "idle" | "ready" | "busy" | "error" {
  if (status === "error" || status === "aborted") return "error";
  if (status === "loading" || status === "running" || status === "testing") return "busy";
  if (status === "ready") return "ready";
  return "idle";
}

function formatBrowserAddress(url: string | undefined, copy: Copy): string {
  if (!url || url.startsWith("about:blank")) return copy.browserAddress;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "chatgpt.com" && parsed.searchParams.get("temporary-chat") === "true") {
      return `chatgpt.com  /  ${copy.temporaryChat}`;
    }
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return copy.browserAddress;
  }
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function platformLabel(value: string): string {
  return value === "darwin" ? "macOS" : value === "win32" ? "Windows" : value === "linux" ? "Linux" : value;
}

function humanEvent(value: string): string {
  return value.split(".").map((part) => part.replaceAll("_", " ")).join(" · ");
}

function logDetail(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" · ");
}

function formatTime(value: string, language: Language): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(language === "zh-CN" ? "zh-CN" : "en", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

function emptyUsageTotals(): UsageTotals {
  return { turns: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedSavingsUsd: 0 };
}

function formatInteger(value: number, language: Language): string {
  return new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US").format(value);
}

function formatCompactTokens(value: number, language: Language): string {
  if (value < 1_000) return formatInteger(value, language);
  return new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 100_000 ? 1 : 2,
  }).format(value);
}

function formatUsd(value: number, language: Language): string {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function usageLastSevenDays(recorded: UsageDay[], now = new Date()): UsageDay[] {
  const byDate = new Map(recorded.map(day => [day.date, day]));
  return Array.from({ length: 7 }, (_, reverseOffset) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - reverseOffset));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return byDate.get(key) ?? { date: key, ...emptyUsageTotals() };
  });
}

function usageDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1, 12);
}

function formatUsageDate(value: string, language: Language): string {
  return usageDate(value).toLocaleDateString(language === "zh-CN" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatUsageWeekday(value: string, language: Language): string {
  return usageDate(value).toLocaleDateString(language === "zh-CN" ? "zh-CN" : "en-US", { weekday: "short" });
}
