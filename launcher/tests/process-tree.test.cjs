const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { stopOwnedProcessTree, terminateOwnedProcessTree, DETACH_OWNED_CHILD } = require("../electron/process-tree.cjs");

test("process cleanup waits for a stubborn owned process to exit before resolving", async () => {
  const child = spawn(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000);'], { detached: DETACH_OWNED_CHILD, stdio: ["ignore", "pipe", "ignore"] });
  try {
    await once(child.stdout, "data");
    await stopOwnedProcessTree(child);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
    if (process.platform !== "win32") assert.equal(child.signalCode, "SIGKILL");
  } finally { terminateOwnedProcessTree(child, "SIGKILL"); }
});
