# Upstream

- Repository: https://github.com/miuuyy/codex-chatgpt-web
- Base version: `4.0.8`
- Base commit: `bd535d8359cf1980de2b449a7d3b79af97862226`
- Last synced: `2026-09-03`

Chat2Codex keeps the browser worker, ChatGPT session handling, Responses/SSE bridge, Codex harness,
MCP tunnel, and native Codex passthrough close to upstream. Product-specific work belongs under
`src/hybrid`, `src/integration`, `src/telemetry`, and clearly named launcher surfaces.

The Git remote named `upstream` points to the repository above. No product `origin` is configured
until a Chat2Codex repository URL is provided.
