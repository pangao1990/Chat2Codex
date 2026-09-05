// Read-only protocol probe. No account credential, thread or inference request is used.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CodexExecutor } = require("../electron/codex-executor.cjs");

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-executor-check-"));
  const client = new CodexExecutor({ executable: process.argv[2] || "codex", home, cwd: home, apiKey: "local-protocol-check-no-inference" });
  try {
    const info = await client.initialize();
    console.log(JSON.stringify({ initialized: true, isolatedOfficialApi: true, userAgent: info.userAgent }));
  } finally { await client.close(); fs.rmSync(home, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
