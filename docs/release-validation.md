# Release validation

CI is configured to check runtime builds, launcher startup, and native package smoke
contracts on macOS, Windows, and Linux; passing evidence must be recorded for each release. It does not prove an authenticated ChatGPT session, a live
MCP connector, or a complete Codex turn. A release candidate is not ready until those account-bound
flows are exercised manually on the platforms below.

## Required evidence

Record the release version, operating-system version, install path (`clean` or `upgrade`), ChatGPT
plan, Codex version, result of each check, and a redacted Activity log for every failure. Never
capture cookies, tunnel IDs, API keys, bearer tokens, or prompt contents.

## GitHub Actions packaging and publication

1. Synchronize the root and launcher package versions, then run the version check and relevant verification gates.
2. Write `docs/releases/v<version>.md` with bullet-point changes, platform download links, and actual validation limitations. The initial Chat2Codex release uses `docs/releases/v1.0.0.md`.
3. Commit the reviewed source and notes, then push the matching `v<version>` tag to `origin`. Push only the intended tag; this repository may also have local tags inherited from upstream.
4. The Release workflow validates the tag and notes, builds macOS arm64/x64, Windows x64, and Linux x64, then runs verification and packaged startup checks. Publication waits for every build.
5. The publish job requires all six desktop packages and four runtime archives, adds licenses/installers and `checksums.txt`, and publishes the tracked notes. Stable tags become the latest release; tags containing a hyphen are marked prerelease.
6. Check the published attachments and checksum contents, and confirm that `https://github.com/pangao1990/Chat2Codex/releases/latest` opens the expected stable version. Both README download buttons use this permanent latest-release URL.

Automated publication does not turn a manual NOT RUN result into PASS. Record actual account and platform acceptance separately below and in the version's release notes.

## Windows 11 gate

Run this list on a maintained Windows 11 x64 machine with a real ChatGPT account:

1. Install the packaged launcher on a clean profile and prove that the embedded Bun runtime starts.
2. Sign in inside the embedded browser and prove that Temporary Chat reaches a usable composer.
3. Install the Codex model route, restart Codex, and prove that every account-available ChatGPT Web
   effort appears exactly once without removing native models.
4. Complete one Browser-only turn and verify streamed commentary plus the final answer.
5. Configure the `Codex Native2` connector, run **Verify runtime**, and complete one Full-mode local
   tool turn. Repeat with Pro when the account exposes Pro.
6. Drive a chat past the compaction threshold and prove that it continues after compaction without
   a duplicate or orphaned browser turn.
7. Cancel a running turn by closing its launcher tab, then cancel another with the launcher action;
   prove that neither turn recreates a tab or keeps the runtime busy.
8. Quit the launcher during an active turn, confirm the explicit cancellation path, reopen it, and
   prove that the saved ChatGPT session and Codex route are still valid.
9. Disconnect the bridge and prove that the exact previous Codex route is restored. Reconnect it
   and prove that the existing private MCP credentials are reused rather than replaced.
10. Upgrade from the previous public release and prove that launcher state, browser state, Codex
    settings, and MCP configuration survive the updater transaction.

Any failed or unexecuted item blocks a stable release. An alpha may ship with a named failed item
only when the release notes describe the limitation and recovery path explicitly.

### v3.0.0 result

Maintainer validation passed on Windows 11 x64 on 2026-08-22 using the published v3.0.0-alpha
upgrade package and a real ChatGPT Pro account. The authenticated launcher, Codex model catalog,
Full-mode MCP tools, Pro turns, compaction, cancellation, session reuse, and preserved connector
configuration were exercised successfully. The direct installer completed successfully but gave no
clear completion action; v3.0.0 changes it to an assisted installer with a final launch option.

## macOS gate

Repeat items 2 through 10 on the oldest supported macOS version or the closest maintained machine.
Packaging smoke and code-signing verification remain separate gates; neither substitutes for the
interactive account flow.

## Linux gate

CI packaging smoke is required. Before claiming interactive Linux support for a release, repeat
items 2 through 7 under a supported desktop session and record the display server and packaging
format used.

## Workbench release gates

The Home workbench requires independent evidence in addition to legacy bridge gates:

1. Fresh profile: Codex independent runs with the execution API key while ChatGPT Web remains signed out; no legacy model installation or MCP setup is required.
2. With a real Web session and API account, run plan → edit → failing test → corrective execution → review → successful verification in a disposable Git repository.
3. Repeat all three strategies, change strategy during a phase, and verify no later Web request occurs after a Codex lock takes effect. Web lock must pause on expired login/429 instead of silently switching.
4. Verify native key encryption (including Windows DPAPI, macOS Keychain and a Linux secret service), native directory/save/confirmation dialogs, and default CLI discovery.
5. Exercise command/file approvals, denial, cancellation and application restart with actual file changes. Inspect the working tree and assert that execution is not blindly replayed.
6. Confirm API token accounting for cached input, failure and resume; check unknown prices and delayed budget stops against the provider record.
7. Verify report deletion and local task/credential retention across a packaged upgrade. Export only a redacted test fixture as public release evidence.

Record each result as PASS / FAIL / NOT RUN with version and platform. Keep the build prerelease while a required gate is unexecuted. A local protocol probe (`bun run launcher:check:executor`) uses no account credentials or inference and does not satisfy steps 1–6.
