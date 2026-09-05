<div align="center">
  <img src="launcher/assets/icon.png" alt="Chat2Codex" width="132" />
  <h1>Chat2Codex</h1>
  <p><strong>Use ChatGPT as the brain, Codex as the hands.</strong></p>
  <p>Let ChatGPT Web reason and decide while Codex keeps handling local files, shell, Git, and tools.</p>
  <p>
    <a href="README.md">简体中文</a> ·
    <a href="README.en.md">English</a>
  </p>
  <p>
    <a href="https://github.com/pangao1990/Chat2Codex/releases/latest">Download packages</a> ·
    <a href="docs/INSTALLATION.en.md">Installation guide</a> ·
    <a href="docs/DEVELOPMENT.en.md">Development guide</a> ·
    <a href="TROUBLESHOOTING.md">Troubleshooting</a>
  </p>
  <p>
    <a href="https://github.com/pangao1990/Chat2Codex/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pangao1990/Chat2Codex/actions/workflows/ci.yml/badge.svg" /></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
    <img alt="macOS arm64 and x64" src="https://img.shields.io/badge/macOS-arm64%20%7C%20x64-black?logo=apple" />
    <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078D4?logo=windows" />
    <img alt="Linux x64" src="https://img.shields.io/badge/Linux-x64-FCC624?logo=linux&amp;logoColor=black" />
  </p>
</div>

> [!IMPORTANT]
> Chat2Codex **V1.0.0** is the stable version. Home provides Automatic, ChatGPT plans and Codex independent strategies.
> Web planning depends on ChatGPT interface compatibility. See the [current implementation status](docs/chat2codex-status.md)
> for the platforms and live-account flows that have been validated.

## Home task workbench

**Choose a strategy → describe the task → plan if needed → Codex implements and tests → review and accept.**

Home prominently offers **Automatic / ChatGPT plans / Codex independent**. Changes during execution apply at the next phase boundary.

| Feature | Behavior |
| --- | --- |
| Automatic routing | Local rules consider planning benefit, context overhead and lack of progress; no guaranteed savings |
| Hard locks | Web planning pauses on failure; Codex independent requires no Web login |
| API execution | Local Codex App Server with isolated settings and the official OpenAI API |
| Task controls | Queue, phase pause, stop, explicit resume, approvals and human acceptance |
| Context and evidence | Preview, plans, command receipts, search/filter, export and deletion |
| Usage and budgets | Codex usage, Web estimates, optional rates and round/token/time limits |

The workbench requires **Codex CLI and an execution API key**. Web login is needed only for Web planning; no legacy model installation or MCP Tunnel is required. Read the [workbench guide](docs/workbench.en.md).

For your first Home task:

1. Install Codex CLI, then save an OpenAI execution API key and an available model under Connections & execution.
2. Select Check execution connection (no inference) to verify the local protocol and API model access.
3. Choose a strategy; sign into ChatGPT in the application's browser when using Web planning.
4. Select a project, describe the outcome and acceptance criteria, preview the context, then start.
5. Review changes, commands and test results in task details; respond to permission requests or human acceptance when prompted.

Codex execution uses separately billed API inference. Automatic selection uses rules; measure savings using the same tasks and acceptance quality.

The original Web-model bridge inside Codex remains available. Its login, browser testing, model route and MCP setup are separate. The detailed bridge instructions below describe that legacy path.

### Interface preview

Actual renderer screenshots with simulated data; these are not account-usage or savings evidence.

![Home workbench](docs/images/workbench-home-zh.png)

<details>
<summary>Task details and legacy setup</summary>

![Task detail](docs/images/workbench-task-zh.png)
![Connection setup](docs/images/setup-zh.png)

</details>

## Choose your path first

This project serves two kinds of users. Go directly to the section that matches you:

| Who you are | Where to start |
| --- | --- |
| **User: install and use the application** | Read [Part 1: packaged application](#package-users). You do not need Bun, Node.js, npm, or source dependencies. |
| **Developer: modify or extend the source** | Understand the user workflow first, then read [Part 2: source development](#developers). Every development tool and dependency can stay inside the repository. |

Most of this README is written for packaged-application users. Technical details and contribution
instructions are deliberately kept in the later sections.

## Contents

- [Part 1: packaged-application users](#package-users)
  - [What the application is](#what-is-it)
  - [Whether it fits your needs](#should-i-use-it)
  - [Download and installation](#install-package)
  - [First-time setup](#first-run)
  - [Daily use](#daily-use)
  - [Update and uninstall](#update-and-uninstall)
  - [Usage, cost, and privacy](#usage-and-privacy)
  - [User troubleshooting](#user-troubleshooting)
  - [FAQ](#faq)
- [Part 2: source development](#developers)
- [Part 3: technical reference](#technical-reference)
- [Documentation, contributing, and license](#project-docs)

<a id="package-users"></a>
# Part 1: packaged-application users

If you only want to use Chat2Codex, this part is the complete starting guide. Download the package
for your computer—do not clone the source or set up a development environment.

<a id="what-is-it"></a>
## 1. What is this application?

Chat2Codex is a standalone desktop application that works with official Codex Desktop or Codex CLI.

It has two parts:

1. A visual launcher for ChatGPT sign-in, connection setup, status, and usage.
2. A local-only bridge that sends a Codex task to ChatGPT Web for reasoning and returns local actions to Codex.

It is not:

- a replacement for ChatGPT or Codex;
- a browser extension or website;
- a cloud service that you must deploy to a server;
- a tool for bypassing account allowances, rate limits, safety policies, or permissions.

### One-minute answers

| Question | Answer |
| --- | --- |
| What problem does it solve? | It uses the available ChatGPT Web allowance for reasoning inside a Codex workflow while preserving Codex files, shell, Git, and tools. |
| Is a separately billed inference API required? | The new workbench requires a usage-billed execution API key. The legacy Web bridge needs no separate inference API key; its Full-mode Tunnel key does not pay for model inference. |
| Is it a standalone application? | Yes. It is an Electron desktop application installed alongside Codex. |
| Must it stay open? | The background service must run while a `ChatGPT Web` bridge model is selected. You may close the window and leave Chat2Codex in the tray. |
| What is the default interface? | Simplified Chinese and the light theme are the defaults. English and dark mode are optional. There is no Japanese interface. |
| Does it read cookies from official apps? | No. It uses an isolated browser profile and requires one separate ChatGPT sign-in. |

<a id="should-i-use-it"></a>
## 2. Do I need Chat2Codex?

The official ChatGPT desktop app already combines ChatGPT, Codex, local projects, and plugins. Choose
the option that matches your goal:

| Your goal | Recommendation |
| --- | --- |
| Use ordinary ChatGPT and Codex in the official integrated workspace | Use the [official ChatGPT desktop app](https://learn.chatgpt.com/docs/app) |
| Select a ChatGPT Web reasoning model in Codex while preserving local Codex actions | Use Chat2Codex |
| Chat in a browser without files, shell, Git, or tools | Use the ChatGPT website directly |
| Reuse cookies, login state, or private data from another application | Unsupported; Chat2Codex intentionally isolates this data |
| Bypass subscriptions, rate limits, safety policies, or access control | Unsupported and outside this project's purpose |

<a id="install-package"></a>
## 3. Download and install the package

### 3.1 Requirements

You need:

- official Codex Desktop or Codex CLI;
- a ChatGPT account that can use the ChatGPT website normally;
- network access to ChatGPT and GitHub Releases;
- for the complete local-tool loop, an account that can create an MCP tunnel and ChatGPT connector.

### 3.2 Choose the correct file

Open [GitHub Releases](https://github.com/pangao1990/Chat2Codex/releases/latest), choose the latest release,
and download the file for your computer:

| Computer | Download | How to identify it |
| --- | --- | --- |
| Apple silicon Mac | `chat2codex-<version>-mac-arm64.dmg` | About This Mac shows M1, M2, M3, M4, M5, or later |
| Intel Mac | `chat2codex-<version>-mac-x64.dmg` | About This Mac shows Intel |
| 64-bit Windows 10/11 | `chat2codex-<version>-win-x64.exe` | Most modern Windows computers |
| 64-bit Intel/AMD Linux | `chat2codex-<version>-linux-x64.AppImage` | `uname -m` prints `x86_64` |

Ordinary users should not download the source ZIP. Source archives are for developers and do not
replace a built DMG, EXE, or AppImage.

Each release also provides `checksums.txt` and installer scripts. To verify SHA-256 or use a one-command
installer, read the [English installation guide](docs/INSTALLATION.en.md); the Simplified Chinese edition
is [docs/INSTALLATION.md](docs/INSTALLATION.md).

### 3.3 Install on macOS

1. Open the downloaded DMG.
2. Drag Chat2Codex into Applications.
3. Open Chat2Codex from Applications.
4. If macOS cannot verify the developer, first confirm that the file came from this repository's Release
   and verify its SHA-256. Do not disable macOS security globally; the Release notes state whether a
   package is signed and notarized.

macOS 13 or later is supported with separate Apple silicon and Intel packages.

### 3.4 Install on Windows

1. Open `chat2codex-<version>-win-x64.exe`.
2. Follow the per-user installer; administrator access is not required.
3. Start Chat2Codex from the Start menu or desktop shortcut.
4. If security software blocks a package, verify its Release source and SHA-256 instead of disabling protection.

The current package supports x64 Windows 10/11.

### 3.5 Install on Linux

The recommended approach is to follow the [English installation guide](docs/INSTALLATION.en.md) and run
the installer included in the Release. It installs to user-owned directories without `sudo` and creates
a command and desktop entry.

You may also mark the AppImage executable and run it directly. The current distributable is Linux x64
only; source-development support does not imply a published package for every architecture.

### 3.6 Does the package install Bun or Node.js globally?

No global `bun`, `node`, or `npm` command is added. The packaged application already contains its runtime
and JavaScript dependencies. Ordinary users do not need to understand or install development tools.

<a id="first-run"></a>
## 4. First-time setup

Chat2Codex automatically opens the next unfinished step. Follow the launcher from top to bottom.

### Step 1: sign in to ChatGPT

Choose Open sign-in and authenticate inside Chat2Codex's own browser window. This profile is separate
from Chrome, Safari, official ChatGPT Desktop, and Codex, so you may need to sign in even when another
application is already authenticated.

Never send cookies, verification codes, API keys, or browser profiles to another person or GitHub issue.

### Step 2: run the browser test

After sign-in, run the browser smoke test. It checks whether the account, Temporary Chat, reasoning mode,
and current web controls are usable. Read the complete error if it fails instead of repeatedly clicking.

### Step 3: install ChatGPT Web models

Choose Standalone when no other Codex route manager is active. Chat2Codex changes only its recorded route
fields and keeps recovery information.

Choose External Manager when CC Switch or another tool manages `openai_base_url`. This mode leaves
`~/.codex/config.toml` read-only and requires the external manager to import the Chat2Codex route. One
Codex environment can have only one route writer.

### Step 4: fully restart Codex

After installing models, fully quit every Codex Desktop window and Codex CLI process, then reopen Codex.
Signing out, closing only one window, or creating a new task does not refresh the model catalog.

### Step 5: choose Browser-only or full MCP

| Mode | Capability | Tunnel and connector required |
| --- | --- | --- |
| Browser-only | ChatGPT Web can reason and answer but cannot call local Codex tools | No |
| Full / MCP core workflow | ChatGPT Web reasons while Codex performs files, shell, Git, and tool actions | Yes |

The complete loop is the project's primary use case. If you need local actions, finish the launcher's
**MCP core workflow**:

1. Create or enter the tunnel by following the guide.
2. Use the copy action to create a ChatGPT connector with the exact required name.
3. Configure connector permissions exactly as shown.
4. Connect the harness and run verification.

The regular API key used by MCP creates the tunnel and is not used to purchase ChatGPT Web inference.
Credentials stay in Chat2Codex's private local storage and are excluded from ordinary logs.

### Step 6: start a task in Codex

1. Open Codex.
2. Choose a model marked `ChatGPT Web` from the model picker.
3. Enter a task normally.
4. File changes, terminal commands, Git actions, and approvals still appear in Codex.

<a id="daily-use"></a>
## 5. Daily use

### Every time you start

1. Start Chat2Codex.
2. Confirm that the tray says the reasoning-to-action loop is ready.
3. Open Codex and select the required `ChatGPT Web` model.
4. Describe the task normally; there is no need to copy and paste between ChatGPT and Codex.

### Must Chat2Codex stay open?

Its background service must run while a `ChatGPT Web` model is selected, but the main window need not remain visible:

- closing the main window leaves Chat2Codex in the system tray;
- the tray opens the browser, connection setup, usage, and preferences directly;
- do not choose Quit from the tray while a task is running;
- a full exit makes the local bridge unavailable and may interrupt an active Web turn;
- Native Codex models do not depend on the Chat2Codex background service.

### Completion notifications

When Chat2Codex is not focused, a normal Web task completion can show a system notification. It contains
no task title, prompt, answer, or file name. Internal context compaction does not create duplicate
notifications. You can disable this in Preferences.

### When ChatGPT Web is unavailable

Chat2Codex never secretly changes the model inside one answer. Availability failures such as allowance,
rate limit, unavailable model, browser failure, or expired login may allow a later retry or continuation
to use Native Codex at a whole-turn boundary. Safety refusals, user cancellation, permissions, and sandbox
denials never trigger fallback.

<a id="update-and-uninstall"></a>
## 6. Update, repair, and uninstall

### Update

- Follow an in-app update notice when available.
- Or quit Chat2Codex, download a newer GitHub Release, and install it over the previous version.
- A normal update preserves settings and the isolated browser profile.
- Before an upgrade, read its Release notes and the [implementation status](docs/chat2codex-status.md).

### Repair Codex integration

If models disappear or routing looks wrong, run Preferences → Run doctor first. Then use Repair Codex
setup once and fully restart Codex. Do not repeatedly reinstall or delete configuration first; recovery
metadata exists to protect the route that was present before setup.

### Uninstall in the correct order

1. Choose Remove Codex integration in Chat2Codex and wait for the previous route to be restored.
2. Fully restart Codex and confirm that it no longer uses the Chat2Codex route.
3. Quit Chat2Codex from the tray.
4. Delete it from Applications on macOS, use Installed apps on Windows, or remove the user-directory
   installation on Linux as described in the installation guide.
5. If login and settings are no longer required, delete `~/.chat2codex/` only after the app has fully
   exited. That directory may contain sensitive login material and must not be copied or shared.

Deleting the application before removing integration may leave Codex pointing to a local service that
no longer exists, so do not reverse the order.

<a id="usage-and-privacy"></a>
## 7. Usage, cost, and privacy

### Does it cost money?

Chat2Codex is MIT-licensed open-source software. It charges no software fee. The new workbench uses paid API inference; the legacy Web bridge does not require separate inference API billing. You still provide eligible ChatGPT/Codex accounts, plan capabilities, and
network access. Chat2Codex never increases, changes, or bypasses official allowances.

### Which allowance does it consume?

- ChatGPT Web reasoning consumes the ChatGPT plan allowance.
- Outer Codex execution, approvals, or optional native capabilities may still use Codex allowance.
- File I/O and shell commands are not themselves model tokens, but the turns driving tools may be metered.
- Official account displays remain the source of truth for metering, model availability, and cooldowns.

### What does “API-equivalent value” mean?

Usage & value is a rough local estimate, not an official bill:

- it estimates input and output tokens from bridge-turn text and image context;
- it uses published OpenAI Standard short-context API prices for the matching backend model;
- the app shows the price date and [official pricing source](https://developers.openai.com/api/docs/pricing);
- API-equivalent value is not measured savings, cash, a refund, a balance, or a credit;
- Chat2Codex cannot read exact official balances, remaining allowance, or reset times and never invents them.

### What data is stored?

| Data | Location and meaning |
| --- | --- |
| Production settings, private runtime, and login profile | `~/.chat2codex/` |
| Development data | `~/.chat2codex-dev/`; never reused by production |
| Legacy bridge usage ledger | Aggregate tokens, turns, and estimated amount only; no prompts, answers, task titles, or file contents |
| Workbench history | `workbench/` stores requests, plans, command evidence and isolated execution history; delete per task. Keys are separately encrypted. |
| Codex route recovery | Only fields managed by Chat2Codex, retained for safe restoration |

The local Responses service binds only to `127.0.0.1` and is not directly exposed to the LAN.
Chat2Codex never reads or copies cookies, history, or private configuration from official ChatGPT/Codex
apps. Diagnostic exports redact credentials and common local details, but inspect every export before sharing.

Read [SECURITY.md](SECURITY.md) and the [security model](docs/security-model.md) before enabling Full mode.

<a id="user-troubleshooting"></a>
## 8. Troubleshooting for users

Use this order when something fails:

1. Confirm that the latest Release is installed and Chat2Codex is still running.
2. Check that sign-in, browser test, model installation, Codex restart, and MCP verification are complete.
3. Fully quit and reopen Codex, then reselect a model marked `ChatGPT Web`.
4. Open Preferences → Run doctor and read every failed check.
5. Reproduce the problem once, then use Activity → Export privacy-safe log.
6. Read the complete [Troubleshooting guide](TROUBLESHOOTING.md). If it remains unresolved, open a
   [GitHub Issue](https://github.com/pangao1990/Chat2Codex/issues).

Use Retry if startup cannot load. A failed usage read does not appear as zero; a failed refresh keeps the
last successful reading and its timestamp. If resetting fails, restore the configured local runtime and
try again; the app will not claim the reset succeeded. Activity searches full details and filters errors.
Expand an event or select Details and recovery guidance in a diagnostic report to inspect the cause.

Include the operating system and architecture, Chat2Codex/Codex versions, selected model, Browser-only
or Full mode, minimal reproduction, complete final error, and privacy-safe export. Never upload cookies,
API keys, tunnel IDs, browser storage, or unredacted private prompts.

<a id="faq"></a>
## 9. User FAQ

### Codex already includes ChatGPT. Why use this project?

The official desktop app is best for ordinary official ChatGPT and Codex workflows. Chat2Codex solves
a narrower problem: it places ChatGPT Web reasoning models in the Codex model route while preserving
the native Codex tool loop. The official app is usually simpler if you do not need that route.

### Why not reuse a ChatGPT login from another application?

Copying cookies or browser state increases credential-leak and account-mixing risks. Chat2Codex requires
one separate sign-in inside an isolated profile to keep ownership and deletion boundaries clear.

### Why do the new models not appear in Codex after setup?

Codex caches its model catalog. Fully quit every Codex Desktop and CLI process before reopening it.
Closing one window, signing out, or creating a task is not enough.

### Can I use CC Switch at the same time?

Yes, but two applications must not write the same Codex route. If CC Switch owns routing, select External
Manager and let it import the Chat2Codex endpoint. Do not run Chat2Codex Standalone beside another writer.

### Can I run many tasks concurrently?

Five browser task tabs are a safety maximum, not recommended concurrency. A ChatGPT account may rate-limit
at a lower number. Start with one task at a time and increase cautiously only after confirming stability.

### Are images and image generation supported?

Ordinary image context depends on the selected model and ChatGPT web capabilities. Image generation uses
a different generation and download lifecycle and is not currently a supported turn type.

<a id="developers"></a>
# Part 2: developers extending the source

Developers should understand the packaged-user workflow above because the UI, installers, and errors are
designed around it. This section is only the source quick start. See the
[English development guide](docs/DEVELOPMENT.en.md) and
[中文教程](docs/DEVELOPMENT.md) for complete instructions.

## 1. Clone and install the repository-local environment

```bash
git clone https://github.com/pangao1990/Chat2Codex.git
cd Chat2Codex
./scripts/setup-local.sh
```

```powershell
git clone https://github.com/pangao1990/Chat2Codex.git
Set-Location Chat2Codex
scripts\setup-local.cmd
```

The script verifies downloads and places pinned Bun 1.4.0, Node.js 24.14.0, Electron, dependencies,
and persistent caches inside the repository. It does not modify shell profiles, system environment
variables, or global package directories.

| Content | Repository-local location |
| --- | --- |
| Bun and Node.js | `.tools/` |
| Bun, npm, Node.js, and Electron caches | `.cache/` |
| Core dependencies | `node_modules/` |
| Desktop launcher dependencies | `launcher/node_modules/` |

## 2. China and official sources

The default `auto` mode measures and remembers a download route. Override it when needed:

```bash
CHAT2CODEX_SOURCE=china ./scripts/setup-local.sh
CHAT2CODEX_SOURCE=official ./scripts/setup-local.sh
```

```powershell
$env:CHAT2CODEX_SOURCE = "china"
scripts\setup-local.cmd
```

The China mirror downloads binaries and packages while checksums still come from official releases.
Security audit temporarily contacts the official npm advisory endpoint because npmmirror does not provide
it; this does not change the computer's npm configuration.

## 3. Start development

```bash
./scripts/bun-local.sh run app
```

```powershell
scripts\bun-local.cmd run app
```

Development uses `~/.chat2codex-dev/`, isolated from production browser state, login, runtime, and Codex configuration.

## 4. Test and build

```bash
./scripts/bun-local.sh run verify
./scripts/bun-local.sh test tests/*.test.ts
./scripts/bun-local.sh run launcher:test
./scripts/bun-local.sh run app:package
```

```powershell
scripts\bun-local.cmd run verify
scripts\bun-local.cmd test tests/*.test.ts
scripts\bun-local.cmd run launcher:test
scripts\bun-local.cmd run app:package
```

Artifacts are written to `launcher/artifacts/`. Because packages embed platform-specific Bun and Electron
runtimes, macOS, Windows, and Linux must build on their matching systems; one platform cannot cross-build
every distributable.

## 5. Repository structure

Run `./scripts/bun-local.sh run launcher:smoke:ui` (Windows:
`scripts\bun-local.cmd run launcher:smoke:ui`) for real Chromium UI regression checks. Install Google Chrome
or set `CHAT2CODEX_TEST_BROWSER` to a Chromium executable. Tests inject simulated IPC, never sign in or
modify Codex configuration, and save screenshots to `output/playwright/`. See [UI validation](docs/ui-validation.md).

`verify` covers versions, dependency audits, types, unit/integration tests, builds, and the relocatable runtime.
Neither it nor UI regression replaces live-account and native installer acceptance. Complete [release validation](docs/release-validation.md) before publishing.

| Path | Purpose |
| --- | --- |
| `src/` | CLI, Responses service, routing, ChatGPT Web adapter, Codex integration, and usage ledger |
| `launcher/src/` | React desktop UI, localization, and styles |
| `launcher/electron/` | Electron main process, isolated browser, tray, update, and runtime management |
| `tests/`, `launcher/tests/` | Core and desktop-launcher automation |
| `scripts/` | Local toolchain, build, verification, and release scripts |
| `docs/` | Installation, development, architecture, security, and release documentation |

<a id="technical-reference"></a>
# Part 3: technical reference

## How it works

Home workbench: request → optional ChatGPT Web plan → Codex API execution and tests → summary review → continue or accept. Each phase retains usage, status and evidence; strategy changes apply between phases.

The original Web-model bridge follows this path:

```text
Select a ChatGPT Web model in Codex
                 ↓
ChatGPT Web uses the account's available allowance to reason and decide
                 ↓
Chat2Codex passes requests through a local loopback bridge
                 ↓
The Codex harness performs approved file, shell, Git, and tool actions
                 ↓
Tool results return to the same reasoning turn until the task is complete
```

## Core safety mechanisms

- ChatGPT-first routing with a per-model circuit breaker.
- Quality Lock prevents a silent reasoning-tier downgrade without explicit user permission.
- Native Codex fallback happens only at whole-turn boundaries.
- A tool ledger reduces repeated completed side effects during continuation.
- Standalone owns only recorded route fields and retains private recovery metadata.
- External Manager keeps `~/.codex/config.toml` read-only.
- Full mode still obeys Codex sandboxing, approvals, and connector permissions.
- Health checks, privacy-safe logs, automatic updates, and controlled runtime recovery.

See the [architecture](docs/architecture.md) and [security model](docs/security-model.md) for component
ownership, request flow, and trust boundaries.

## Known limitations

- ChatGPT DOM or interaction changes may require a compatibility release.
- Live-account, allowance-error, CC Switch coexistence and clean cross-platform coverage follow the recorded acceptance results.
- Official exact balance, remaining allowance, and reset time are unavailable.
- Image generation is not a supported turn type.
- Linux distributables currently provide x64 AppImage only.
- Unsigned or unnotarized local builds may trigger operating-system security warnings.

Treat the [implementation status](docs/chat2codex-status.md) and
[release validation checklist](docs/release-validation.md) as the source of truth. The version number does not imply OpenAI certification or completed acceptance in every environment.

The project is based on [miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web) 4.0.8.
See [UPSTREAM.md](UPSTREAM.md) for the exact baseline commit, synchronization policy, and copyright notices.

<a id="project-docs"></a>
# Documentation, contributing, and license

## Documentation index

| Document | Content |
| --- | --- |
| [User installation](docs/INSTALLATION.en.md) / [简体中文](docs/INSTALLATION.md) | Download, verify, install, first launch, update, and uninstall |
| [Source development](docs/DEVELOPMENT.en.md) / [简体中文](docs/DEVELOPMENT.md) | Repository-local toolchain, dependency updates, tests, packaging, and cleanup |
| [Troubleshooting](TROUBLESHOOTING.md) | Sign-in, model catalog, MCP, route conflicts, and browser errors |
| [Implementation status](docs/chat2codex-status.md) | Implemented behavior and work that still requires live environments |
| [Architecture](docs/architecture.md) | Component ownership, request flow, and data flow |
| [Security model](docs/security-model.md) | Trust boundaries, tool invocation, and fail-closed rules |
| [DEV Chat](docs/dev-chat.md) | Isolated browser and simulated MCP development workflow |
| [Release validation](docs/release-validation.md) | Automated and live-account acceptance before release |
| [Current release checks](docs/pre-release-check.md) | Recorded tests, package results and remaining live-environment acceptance |
| [Contributing](CONTRIBUTING.md) | Issue, code, test, and pull request requirements |

## Contributing

Focused, verifiable bug fixes, regression tests, documentation improvements, and platform compatibility
patches are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting:

1. Search existing issues first.
2. Discuss major features, architecture changes, new providers, and broad refactors before implementation.
3. Add tests for behavioral changes and run full verification.
4. Base browser compatibility fixes on observed DOM evidence.
5. Never commit cookies, browser state, secrets, tunnel IDs, logs, Codex history, or absolute local paths.

Use [GitHub Issues](https://github.com/pangao1990/Chat2Codex/issues) for ordinary reports. Follow
[SECURITY.md](SECURITY.md) for private vulnerability reports; do not publish exploit details or credentials.

## License

Chat2Codex is available under the [MIT License](LICENSE). Upstream copyright and third-party license notices
remain in force for derivatives and distributions.
