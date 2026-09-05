# Chat2Codex installation guide

For the new Home workbench, follow the [workbench guide](workbench.en.md). It uses Codex CLI and an execution API key; the legacy MCP setup below is not required.

Native release packages embed the Chat2Codex runtime and pinned Bun executable. End users do not
need Bun, Node.js, npm, Python, or source dependencies.

## 1. Requirements

- Official Codex Desktop or Codex CLI.
- A ChatGPT account that can sign in on the web.
- Network access to ChatGPT and GitHub Releases.

Chat2Codex is unofficial browser automation. It does not bypass account limits, safety policy, or
access controls, and a ChatGPT UI change can temporarily affect compatibility.

## 2. Choose a package

Open [GitHub Releases](https://github.com/pangao1990/Chat2Codex/releases) and select:

| Computer | Asset |
| --- | --- |
| Apple Silicon Mac | `chat2codex-<version>-mac-arm64.dmg` |
| Intel Mac | `chat2codex-<version>-mac-x64.dmg` |
| Windows 10/11 64-bit | `chat2codex-<version>-win-x64.exe` |
| Linux Intel/AMD 64-bit | `chat2codex-<version>-linux-x64.AppImage` |

Alpha and beta releases are previews. Do not rely on a preview as the only copy of important setup.

## 3. Install

On macOS, open the DMG, drag Chat2Codex to Applications, and launch it there. On Windows, run the EXE
and follow the current-user installer; administrator access is not required.

The release also includes checked installer scripts. Replace the example version with the release
you downloaded:

```bash
# macOS or Linux, from the directory containing install-launcher.sh
CHAT2CODEX_VERSION=1.0.0 sh ./install-launcher.sh
```

```powershell
# Windows, from the directory containing install-launcher.ps1
$env:CHAT2CODEX_VERSION = "1.0.0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-launcher.ps1
```

Both scripts verify the selected package against the release SHA-256 list. The Linux installer needs
no `sudo`; it uses `~/.local/lib/chat2codex/`, `~/.local/bin/`, and the current user's desktop menu.

## 4. First launch

1. Open Chat2Codex. Chinese is the default UI; English is selectable.
   The launcher automatically opens the next unfinished step and enters the browser workspace once setup is complete.
2. Follow the guided ChatGPT sign-in in the app's isolated browser space.
3. Complete the sign-in check, browser test, and Install models steps.
4. Fully quit and restart Codex once so its model catalog refreshes.
5. Complete the **MCP core workflow** in the launcher so ChatGPT Web can hand local actions to the Codex harness.
   The guide checks the basic Tunnel ID and API key format before connecting and offers one-click copying of the exact connector name.
6. Select an explicitly labelled `ChatGPT Web` model in Codex and start a task. The Chat2Codex idle page repeats this prompt;
   a live Web reasoning tab appears automatically after the task starts.

Full MCP mode keeps Codex file, shell, Git, and tool capabilities. Without MCP, Browser-only mode can
reason with ChatGPT Web but cannot call local Codex tools. External Manager mode never writes
`~/.codex/config.toml` and is intended for users of a single-writer manager such as CC Switch. Actual
metering, model availability, and rate limits are determined by OpenAI and shown on your account.

## 5. Isolation, updates, and removal

The packaged Bun and JavaScript dependencies remain inside the Chat2Codex application. Installation
does not add global `bun`, `node`, or `npm` commands and does not share `node_modules` with projects.
Application settings, the private runtime, and the login profile live in `~/.chat2codex/`; these are
product data, not global development dependencies.
The Usage & savings page stores aggregate tokens, completed rounds, and estimated value only in
`~/.chat2codex/runtime/usage-summary.json`; it never stores prompts, answers, task names, or file
contents, and offers explicit export and confirmed reset actions.

Before uninstalling, choose **Remove Codex integration** in Chat2Codex and restart Codex. Then remove
the app from Applications on macOS, use Settings → Apps on Windows, or remove the installed
`~/.local` Chat2Codex entries on Linux. Delete `~/.chat2codex/` separately only if you also want to
erase settings and sensitive login material.

See `TROUBLESHOOTING.md` before filing an issue. Never upload cookies, browser state, keys, Tunnel IDs,
or raw prompts and logs.
