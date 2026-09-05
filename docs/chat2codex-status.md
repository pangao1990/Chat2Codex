# Chat2Codex implementation status

Baseline: upstream 4.0.8 at `bd535d8359cf1980de2b449a7d3b79af97862226`.

## Implemented in `1.0.0`

- M0: fork metadata, `develop` branch, product/package/application rebrand, independent environment
  variables, browser partitions, executable names, installers, service labels, and private roots.
- M1 foundation: `IntegrationMode`, CC Switch detection, Standalone backups, External Manager
  read-only ownership enforcement, config fingerprints, conflict monitor, provider export, and CLI.
- M2: ChatGPT-first routing policy and runtime circuit routing.
- M3: exact-tier Quality Lock with explicit downgrade opt-in only.
- M4 foundation: eligible-failure classification and whole-turn Native Codex fallback after an open
  circuit. A single SSE stream never changes providers.
- M5 foundation: deterministic tool argument hashes, side-effect ledger, replay detection, and
  fallback-pending state.
- Launcher usage dashboard: privacy-safe aggregate Web input/output token estimates, daily and
  seven-day views, JSON export/reset, and versioned API-equivalent value using the matching
  backend model's published Standard short-context price.
- Operator tray: live reasoning-to-action readiness, direct navigation to the browser, connection,
  usage, and preferences surfaces, plus background operation after the main window closes.
- Privacy-safe task completion notifications: shown only while the launcher is not focused, contain
  no task title, prompt, answer, or file name, and suppress internal compaction completions.
- Launcher recovery and accessibility: bounded startup with retry, next-step connection actions,
  retained MCP credentials across navigation, searchable/filterable activity with complete details,
  expanded diagnostic guidance, labeled switches, native preference selectors, persisted sidebar,
  and keyboard focus management for the context recommendation.
- Usage reliability: distinguish unavailable data from zero, preserve the last valid reading, suppress
  stale poll results after reset, require a configured daemon to confirm its reset, and keep completed
  responses successful when optional usage persistence fails.
- Real Chromium renderer regression with isolated IPC fixtures and reviewed interface screenshots.
  See [UI validation](ui-validation.md); this does not replace the live release gates below.

## Home workbench

- Prominent Automatic / ChatGPT plans / Codex independent controls, persisted per task and for new tasks; changes apply at phase boundaries.
- Real tool-free Web planner CLI and isolated API-backed Codex App Server client, including effective-route validation and native approval forwarding.
- Atomic task history, serial queue, overlapping-workspace exclusion, explicit restart recovery, pause/stop/resume, budgets, structured reports and evidence-based acceptance.
- OS-encrypted API keys, no-inference connection checks, context preview, search/filter, task export/deletion and in-window drafts.
- Token events separated from Web estimates, unknown prices/unfinished usage identified, optional per-task price snapshots and corrected legacy equivalent-value wording.
- Regression tests cover policy, locks, state transitions, invalid plans, budgets, persistence, unknown pricing, RPC races and approvals; Chromium covers the actual renderer with simulated IPC.

Real Web + API inference acceptance remains a release gate. Neither mocked execution receipts nor a no-inference protocol handshake proves that gate.

## Peer-project feature review

The product pass compared the operational patterns in
[CC Switch](https://github.com/farion1231/cc-switch),
[Claude Code Router](https://github.com/musistudio/claude-code-router),
[OpenCode](https://github.com/anomalyco/opencode),
[Continue](https://github.com/continuedev/continue), and
[Aider](https://github.com/Aider-AI/aider). The tray command center and background completion signal
were the remaining small, high-impact additions that fit Chat2Codex's narrow purpose.

Provider marketplaces, general IDE editing and voice input were not copied. Codex already owns these workflows. The new workbench intentionally adds private, explicitly deletable task history; its storage boundary is documented separately. Provider switching remains deliberately limited to ChatGPT Web
and Native Codex fallback instead of turning this project into another general-purpose router.

## Release gates still requiring live environments

- Authenticated ChatGPT Browser-only and Full Harness smoke tests.
- CC Switch + Codex Desktop provider-topology spike for tools, images, skills, subagents, projects,
  thread reopen, and model picker.
- Real 429/quota, browser crash, expired session, and Native Codex continuation tests.
- macOS and Windows packaged fresh-install/recovery tests.

These cannot be proven by CI alone because they require the user's signed-in account and installed
Codex / CC Switch applications.

## Not implemented yet

- Persistent SQLite telemetry and ACTUAL usage imported from an official billing or account source.
- Official ChatGPT/Codex balance and reset-window reporting (not exposed by this local estimate).
- A dedicated integration-history page beyond the current setup, doctor, and reversible backups.
- One-click browser-profile deletion beyond the preserved upstream logout/session clearing flow.
- Stable signed release publication and platform acceptance testing.
