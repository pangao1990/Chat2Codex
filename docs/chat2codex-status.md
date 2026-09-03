# Chat2Codex implementation status

Baseline: upstream 4.0.8 at `bd535d8359cf1980de2b449a7d3b79af97862226`.

## Implemented in `0.1.0-alpha.0`

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

## Release gates still requiring live environments

- Authenticated ChatGPT Browser-only and Full Harness smoke tests.
- CC Switch + Codex Desktop provider-topology spike for tools, images, skills, subagents, projects,
  thread reopen, and model picker.
- Real 429/quota, browser crash, expired session, and Native Codex continuation tests.
- macOS and Windows packaged fresh-install/recovery tests.

These cannot be proven by CI alone because they require the user's signed-in account and installed
Codex / CC Switch applications.

## Not implemented yet

- Persistent SQLite telemetry and ACTUAL / ESTIMATED / MODELED usage aggregation.
- Versioned pricing and savings engine.
- Integration and Usage launcher pages.
- One-click browser-profile deletion beyond the preserved upstream logout/session clearing flow.
- Stable signed release publication and platform acceptance testing.
