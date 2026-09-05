# Task workbench

[简体中文](workbench.md)

The workbench is separate from the existing Responses/MCP bridge. Home tasks optionally use ChatGPT Web for planning and a local API-backed Codex executor for implementation. They require no legacy model-route installation, desktop restart, or MCP Tunnel.

## Setup

1. Install Codex CLI with App Server support. Protocol initialization, effective configuration and isolated routing were checked locally with 0.152.1; check other versions before use.
2. On Home, open Connections & execution. Enter an OpenAI execution API key, model and executable. macOS/Linux search common installation directories. Windows requires native `codex.exe`; `.cmd` wrappers are not executed through a shell.
3. Save settings and select Check execution connection. This checks the official model catalog and local protocol without inference. It is not a full execution test.
4. Sign into ChatGPT in the application's own browser if Web planning is wanted. Codex independent needs no Web login.
5. Select a project, describe the outcome and acceptance criteria, preview context, then start.

Keys use OS encryption. Linux `basic_text` credential storage is rejected; configure a system keyring. This release targets the official OpenAI API only. Third-party compatible endpoints are not supported. Web model/effort availability follows the account; unsupported efforts produce an explicit error.

## Strategies

- **Automatic:** local rules consider task scope, handoff size, Web availability and lack of progress. Re-evaluation happens between phases.
- **ChatGPT plans:** Web plans and reviews; Codex implements and tests. Web failure pauses rather than silently changing providers.
- **Codex independent:** Codex analyzes, executes and reviews; no task is sent to Web.

The Home selector changes the new-task default and the selected task, leaving other tasks untouched. In-flight requests finish under their original route; strategy changes apply at the next phase. Codex still reasons about implementation.

Automatic routing is a cold-start rule policy, not a trained cost predictor. It never runs both alternatives merely to compare costs, and never promises an unsupported savings percentage. Compare equal outcomes from the same code baseline to measure benefits.

## Queue, controls and recovery

Tasks run sequentially in submission order. A queued/running task excludes overlapping parent/child project directories. Pause waits for a phase boundary; Stop cancels owned processes while preserving existing code changes. Application restart marks queued/running tasks interrupted and requires explicit resume. Resume retains the thread, usage, round count and runtime budget; it asks Codex to inspect existing changes before proceeding.

If interruption occurred before the first turn and Codex confirms that no history exists, explicit resume may create a recovery thread. Prior consumption and budgets remain, and existing changes must be inspected first.

Increase limits explicitly before resuming a budget-limited task. Token events are delayed: the limit is a best-effort stop threshold, not a provider-enforced billing cap. Command/file approval requests appear in task details. Unsupported interactive requests return errors for the executor to report as blockers.

Self-reported test success must match actual command receipts before automatic acceptance. Tasks without meaningful automated tests require human acceptance, recorded separately from a test pass.

## Context and storage

Preview includes the request, first-level directory names, Git revision, changed-file names and diff statistics. The entire repository is not automatically uploaded. Codex investigates missing source context. Web reviews receive necessary plans, summaries and recent command evidence. Names and output can contain private data; common credential patterns are redacted, but this cannot identify every secret.

`~/.chat2codex/workbench/tasks.json` stores requests, plans, states, command evidence and usage. `workbench/executors/<task-id>/` stores isolated Codex history. Records use private permissions and atomic writes, but are not encrypted. The API key is separately OS-encrypted in `workbench/api-key.enc`. Development uses `~/.chat2codex-dev/`.

The window's sessionStorage temporarily retains the request, folder, selected task and feedback while navigating to login or settings. Execution keys are excluded from drafts. Retention after window closure depends on the Electron session; drafts are not backups.

History is capped at 200 tasks, with the latest 200 events and 100 commands per task. Delete removes the task and its executor history, preserving project files. Explicit task reports contain requests, project names and command output; review before sharing. Corrupt history is preserved and blocks scheduling rather than appearing empty.

## Usage and release gates

Codex token events are measured separately from tokenizer-based Web estimates. Cached input and reasoning output are subsets and are not added twice. Missing executor usage stays unknown; incomplete Web turns with unobservable usage are identified. Failure/cancellation does not clear recorded consumption. Optional user-entered API rates are captured when the task starts; unknown rates stay unknown. Platform billing is authoritative.

Legacy API-equivalent Web value is not measured savings, credit or refund. Unpriced models still record tokens and are excluded from the value estimate explicitly.

`bun run verify` checks types, core/launcher tests, dependencies and relocatable runtime builds. `bun run launcher:smoke:ui` uses real Chromium with simulated IPC. Real Web + API execution, limits/session expiry, native permission windows, keyring behavior and signed packages require the separate [release gates](release-validation.md). Protocol checks and simulated tests do not establish those gates.
