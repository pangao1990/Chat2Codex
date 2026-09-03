# Chat2Codex

**Use ChatGPT as the brain, Codex as the hands.**

Chat2Codex is a local, Responses-compatible bridge for the official Codex Desktop and CLI. It uses
your authenticated ChatGPT Web session as the primary reasoning provider, keeps Codex's native
file/shell/git/tool harness, and can move a later retry or continuation to Native Codex when the
ChatGPT route is unavailable.

The project is based on
[miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web) 4.0.8. The exact base commit
and sync rules are recorded in [UPSTREAM.md](UPSTREAM.md). The upstream MIT license and notices are
preserved.

## Current alpha scope

- Independent product identity, application id, command, browser partition, and data roots.
- Production data in `~/.chat2codex/`; isolated development data in `~/.chat2codex-dev/`.
- ChatGPT-first policy with a per-model circuit breaker.
- Quality Lock: a requested tier is never silently downgraded unless the user opts in.
- Native Codex fallback only for eligible availability failures. Safety refusals, cancellation,
  workspace permission failures, malformed requests, and sandbox denials never trigger fallback.
- Turn-boundary fallback: one SSE response is never stitched from two providers.
- A tool-call ledger that prevents completed side effects from being replayed during continuation.
- Standalone mode owns only its recorded Codex route field and creates private backups.
- External Manager mode is read-only for `~/.codex/config.toml` and is compatible with CC Switch's
  single-writer ownership.

Telemetry, savings, and the full launcher dashboard remain later milestones; see
[the implementation status](docs/chat2codex-status.md).

## Requirements and setup

Source development requires Bun 1.4.0. If Bun is not installed globally, the commands below use the
pinned npm-distributed executable without changing the required runtime version.

```bash
npx -y bun@1.4.0 install --frozen-lockfile
cd launcher && npx -y bun@1.4.0 install --frozen-lockfile && cd ..
```

Run verification:

```bash
npx -y bun@1.4.0 run typecheck
npx -y bun@1.4.0 test tests/*.test.ts
npm test --prefix launcher
```

Start the launcher:

```bash
npx -y bun@1.4.0 run app
```

Inspect integration ownership or export the loopback endpoint for CC Switch:

```bash
npx -y bun@1.4.0 run src/cli.ts integration status
npx -y bun@1.4.0 run src/cli.ts integration export
```

Choose ownership explicitly during setup with `--integration-mode standalone` or
`--integration-mode external-manager`. External Manager mode never writes the Codex configuration.

## Security boundary

The Responses listener is restricted to `127.0.0.1`. Browser session data is private local account
material and must not be copied or logged. Chat2Codex is unofficial browser automation; ChatGPT UI
changes can break it, and it must not be used to evade usage limits, safety policy, permissions, or
access controls.

## License

[MIT](LICENSE). Upstream copyright and third-party notices are retained.
