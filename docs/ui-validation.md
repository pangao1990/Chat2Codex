# Launcher UI validation

The launcher connects ChatGPT reasoning with Codex execution. UI checks exercise the actual React renderer
in Chromium using isolated IPC fixtures, without accessing an account, launching Electron, starting the
bridge, or changing Codex configuration. Fixtures are not included in the packaged application.

## Run

Install project dependencies and Google Chrome, then run from the repository root:

```bash
./scripts/bun-local.sh run launcher:smoke:ui
```

```powershell
scripts\bun-local.cmd run launcher:smoke:ui
```

If Chrome is not installed, set `CHAT2CODEX_TEST_BROWSER` to an existing compatible Chromium executable.
The test starts and stops its own loopback Vite server and browser. It does not use an existing browser profile.
Screenshots are saved under `output/playwright/`, which is ignored by Git. README previews in `docs/images/`
are reviewed copies of these screenshots with simulated data.

## Covered behavior

- A failed startup shows a retry action that can recover without reloading the window.
- Sign-in, browser testing, and installation advance connection readiness.
- Failed MCP step persistence leaves the user on the current step; the error does not block retry.
- Credential whitespace is trimmed, and saved credentials survive navigation away and back.
- Activity filters by severity and searches full details, including fields beyond the collapsed preview.
- Usage failures show an error rather than zero; refresh failure preserves the last valid reading.
- A delayed poll cannot overwrite a successful reset with old totals.
- Settings switch labels, Chinese/English changes, dark theme, and diagnostic recovery details work.
- A collapsed sidebar is restored and its hidden controls cannot receive focus.
- Compact windows keep the content scrollable without horizontal overflow.
- The context recommendation traps keyboard focus and supports Escape and focus restoration.
- Uncaught renderer errors fail the run.

The backend suites separately cover failed usage writes, numeric overflow, invalid model names, confirmed
runtime resets, and completed responses surviving accounting failures. `run verify` runs those tests along
with existing routing, cancellation, lifecycle, security, packaging-contract, and runtime checks.

## Workbench coverage

The renderer smoke also checks the prominent three-way selector, no-Web Codex start, execution key form, context preview, next-phase switching, pause/resume/stop and English dark/compact layouts. Task-service and RPC suites separately verify hard locks, startup recovery, budgets, unknown usage/prices, approval responses and completion-before-response races. Unsent drafts persist across page changes within the same window; credentials do not.

## Limits

Simulated IPC proves renderer behavior, not Electron native view layering, OS dialogs, sign-in, passkeys,
real ChatGPT responses, MCP Tunnel access, or Codex model discovery. Use the
[release checklist](release-validation.md) and [implementation status](chat2codex-status.md) for those gates.
Passing automated tests does not establish that every platform or live-account workflow is bug-free.
