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
  } finally {
    // This fixture has no descendants. Once its exit is observed, signaling the
    // now-empty process group again can return EPERM on macOS runners.
    if (child.exitCode === null && child.signalCode === null) {
      terminateOwnedProcessTree(child, "SIGKILL");
    }
  }
});

test("process cleanup waits through a transient EPERM group probe until exit is observed", {
  skip: process.platform === "win32" ? "POSIX process groups only" : false,
}, async () => {
  const originalKill = process.kill;
  const child = { pid: 2147483000, exitCode: null, signalCode: null };
  let probes = 0;
  process.kill = (pid, signal) => {
    assert.equal(pid, -child.pid);
    if (signal !== 0) { assert.equal(signal, "SIGTERM"); return true; }
    probes += 1;
    if (probes === 1) throw Object.assign(new Error("awaiting reap"), { code: "EPERM" });
    child.signalCode = "SIGTERM";
    throw Object.assign(new Error("group exited"), { code: "ESRCH" });
  };
  try {
    await stopOwnedProcessTree(child);
    assert.ok(probes >= 2);
    assert.equal(child.signalCode, "SIGTERM");
  } finally { process.kill = originalKill; }
});

test("process cleanup still rejects a denied termination signal", {
  skip: process.platform === "win32" ? "POSIX process groups only" : false,
}, async () => {
  const originalKill = process.kill;
  process.kill = () => { throw Object.assign(new Error("kill EPERM"), { code: "EPERM" }); };
  try {
    await assert.rejects(stopOwnedProcessTree({ pid: 2147483000, exitCode: null, signalCode: null }), /Could not terminate owned process group/);
  } finally { process.kill = originalKill; }
});
