# Chat2Codex development guide

This guide is for first-time contributors. Bun, Node.js, npm, Electron, and project dependencies do
not need to be installed globally.

The launcher routes by state to the next unfinished surface: incomplete core setup opens Connection
setup, an installed production catalog without MCP opens the MCP guide, and a ready loop opens the
browser workspace. When changing state fields or onboarding flow, update the routing assertions in
`launcher/tests/renderer-wiring.test.cjs`. The renderer performs basic MCP credential format checks,
while the main process remains responsible for final validation. Connector-name copying uses a
restricted IPC method; do not expose direct system clipboard access to the renderer.

## 1. Get the source

Clone the repository with Git, or choose **Code → Download ZIP** on GitHub and extract it. The setup
bootstrap uses only basic operating-system facilities:

- macOS 13+: terminal, `curl`, `unzip`, `tar`, and `shasum`.
- Windows 10/11 x64: Windows PowerShell 5.1 or PowerShell 7.
- Linux x64/arm64: a POSIX shell, `curl`, `unzip`, `tar`, and `sha256sum` or `shasum`.
- Network access to GitHub Releases and the official npm registry.

Official Codex Desktop or CLI is needed only for real integration testing; it is the target product,
not a repository dependency.

## 2. One-command local setup

Run from the repository root:

```bash
# macOS / Linux
./scripts/setup-local.sh

# If an extracted ZIP lost executable permissions
sh ./scripts/setup-local.sh
```

On Windows, double-click `scripts\setup-local.cmd`, or run:

```powershell
scripts\setup-local.cmd
```

The bootstrap reads the exact Bun and Node.js versions from `package.json`, downloads them from their
official release sites, verifies both `SHASUMS256.txt` files, and installs both lockfile-pinned
dependency trees. It is safe to rerun after an interrupted download.

### China and official sources

The default `auto` mode compares the official endpoints with the npmmirror China mirror on first
setup and records the faster choice in `.tools/download-source`. Bun, Node.js, and npm dependency
downloads use that route. Binary checksums are still fetched from the official release sites, so a
mirror cannot replace the verification value.

Override the choice when needed:

```bash
CHAT2CODEX_SOURCE=china ./scripts/setup-local.sh
CHAT2CODEX_SOURCE=official ./scripts/setup-local.sh
```

```powershell
$env:CHAT2CODEX_SOURCE = "china"   # or official / auto
scripts\setup-local.cmd
```

The allowed values are `auto`, `china`, and `official`. An explicit run updates only this
repository's saved choice; it does not change the computer's npm configuration.

Dependency downloads continue to use the selected route. Only the security audit inside `verify`
uses the official npm registry automatically, because npmmirror does not provide npm's security
advisory endpoint. That temporary override applies only to the audit child process. If the official
service does not respond within 60 seconds, the command fails with an explicit timeout instead of
waiting indefinitely; retry when the registry is reachable.

## 3. Isolation contract

| Content | Repository location |
| --- | --- |
| Bun executable and home | `.tools/` |
| Node.js used by tests and packaging | `.tools/node/<version>/bin/` |
| Bun/npm/Electron/builder caches | `.cache/` |
| Backend dependencies | `node_modules/` |
| Launcher dependencies | `launcher/node_modules/` |

These paths are ignored by Git. The wrappers change `PATH` and cache variables only for their child
process; they do not modify shell profiles, system environment variables, or global package stores.
The OS temporary directory may contain short-lived build files, but no persistent dependency is
installed there.

## 4. Develop and verify

Always use the repository wrapper instead of a global `bun`:

```bash
# macOS / Linux
./scripts/bun-local.sh --version
./scripts/node-local.sh --version
./scripts/bun-local.sh run app
./scripts/bun-local.sh run verify
./scripts/bun-local.sh run launcher:test
```

```powershell
# Windows
scripts\bun-local.cmd --version
scripts\bun-local.cmd run app
scripts\bun-local.cmd run verify
scripts\bun-local.cmd run launcher:test
```

The main areas are `src/` (service and integration), `launcher/src/` (React UI),
`launcher/electron/` (desktop main process), the two test directories, and `scripts/`. Read
`CONTRIBUTING.md` before changing routing, model selection, browser automation, or credentials.

## 5. Build a native installer

After UI changes, run `./scripts/bun-local.sh run launcher:smoke:ui` (Windows:
`scripts\bun-local.cmd run launcher:smoke:ui`). It requires Google Chrome or a Chromium executable set
with `CHAT2CODEX_TEST_BROWSER`, and uses simulated IPC without accessing accounts or modifying Codex.
See [UI validation](ui-validation.md) for coverage and screenshots. Linux CI runs this check separately.

After setup and a successful `run verify`:

```bash
# macOS / Linux
./scripts/bun-local.sh run app:package

# Windows
scripts\bun-local.cmd run app:package
```

Artifacts are written to `launcher/artifacts/`: DMG/ZIP on macOS, an NSIS EXE on Windows x64, and an
AppImage on Linux x64. Build each target on its own operating system; cross-packaging is deliberately
disabled because the app embeds a native Bun runtime.

Release-grade Linux packaging also needs system desktop libraries and build tools. The reproducible
Ubuntu commands live in `.github/workflows/release.yml`. Use the Release workflow in a GitHub fork if
you do not want to change the local OS build environment.

## 6. Dependency updates and removal

Normal setup uses `--frozen-lockfile`. For an intentional dependency update only:

```bash
./scripts/bun-local.sh update
./scripts/bun-local.sh update --cwd launcher
```

Use `scripts\bun-local.cmd` with the same arguments on Windows, review both manifests and lockfiles,
then run the full verification.

To remove the complete local toolchain, close the development app and delete `.tools/`, `.cache/`,
`node_modules/`, and `launcher/node_modules/`. Source files remain untouched. Development runtime
data is separately isolated in `~/.chat2codex-dev/`; production data uses `~/.chat2codex/`.

For download, checksum, port, login, or model errors, see `TROUBLESHOOTING.md`.
