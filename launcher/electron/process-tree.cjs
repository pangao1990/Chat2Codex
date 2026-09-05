const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DETACH_OWNED_CHILD = process.platform !== "win32";

function processRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM proves the process exists even though this user cannot signal it.
    return error?.code === "EPERM";
  }
}

function ownedProcessTreeRunning(child) {
  if (!child) return false;
  if (!Number.isInteger(child.pid) || child.pid < 1) return child.exitCode === null && child.signalCode === null;
  if (process.platform === "win32") return processRunning(child.pid);
  try { process.kill(-child.pid, 0); return true; }
  catch (error) {
    if (error.code === "ESRCH") return false;
    // macOS can report EPERM while a killed group leader is a zombie awaiting
    // reaping. Treat that as still present, so the bounded wait can observe both
    // group disappearance and Node's exit event. Never infer exit from EPERM.
    if (error.code === "EPERM") return true;
    throw error;
  }
}

async function stopOwnedProcessTree(child) {
  terminateOwnedProcessTree(child);
  // Windows taskkill may finish before Node dispatches the child's exit event.
  // Wait for both OS termination and the local process handle to settle.
  const pending = () => ownedProcessTreeRunning(child) || (child && child.exitCode === null && child.signalCode === null);
  const waitUntil = async deadline => {
    while (pending() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return !pending();
  };
  if (await waitUntil(Date.now() + 1500)) return;
  terminateOwnedProcessTree(child, "SIGKILL");
  if (!await waitUntil(Date.now() + 1500)) throw new Error("Owned process tree did not exit; scheduling must remain stopped");
}

function terminateOwnedProcessTree(child, signal = "SIGTERM") {
  if (!child) return;
  const pid = child.pid;
  if (!Number.isInteger(pid) || pid < 1) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (!child.kill(signal) && child.exitCode === null && child.signalCode === null) {
      throw new Error("Owned child process has no valid pid and refused termination");
    }
    return;
  }

  if (process.platform === "win32") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || "C:\\Windows";
    const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
    const result = spawnSync(taskkill, ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 10_000,
    });
    if ((result.error || result.status !== 0) && processRunning(pid)) {
      const detail = result.error?.message || `taskkill exited with status ${result.status ?? "unknown"}`;
      throw new Error(`Could not terminate owned Windows process tree ${pid}: ${detail}`);
    }
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code === "ESRCH") return;
    throw new Error(
      `Could not terminate owned process group ${pid}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

module.exports = {
  DETACH_OWNED_CHILD,
  processRunning,
  terminateOwnedProcessTree,
  stopOwnedProcessTree,
};
