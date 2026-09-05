const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateRuntimeBundle } = require("../electron/runtime-install.cjs");

const launcherRoot = path.resolve(__dirname, "..");
const artifactsDirectory = path.join(launcherRoot, "artifacts");
const launcherManifest = JSON.parse(
  fs.readFileSync(path.join(launcherRoot, "package.json"), "utf8"),
);
const expectedVersion = launcherManifest.version;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "chat2codex-package-smoke-"));
const markerPath = path.join(scratch, "ready.json");
const coreHome = path.join(scratch, "core-home");
let macAppBundle;
let lastProcessOutput = "";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || scratch,
    env: options.env || process.env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: options.timeout || 45_000,
    windowsHide: true,
  });
  lastProcessOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error) throw new Error(`${result.error.message}\n${lastProcessOutput.trim()}`, { cause: result.error });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with status ${result.status}: ${result.stderr?.trim() || result.stdout?.trim() || "no output"}`,
    );
  }
}

function windowsInstallLocation() {
  const guid = launcherManifest.build.nsis.guid;
  const registryKey = `HKCU\\Software\\${guid}`;
  const result = spawnSync("reg.exe", ["query", registryKey, "/v", "InstallLocation"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Windows installer did not register ${registryKey}: ${result.stderr?.trim() || "no output"}`);
  }
  const match = result.stdout.match(/^\s*InstallLocation\s+REG_SZ\s+(.+?)\s*$/mi);
  if (!match || !path.win32.isAbsolute(match[1])) {
    throw new Error(`Windows installer registered an invalid InstallLocation: ${result.stdout.trim()}`);
  }
  return match[1];
}

function artifact(pattern, label) {
  const matches = fs.readdirSync(artifactsDirectory)
    .filter((name) => pattern.test(name))
    .sort();
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in ${artifactsDirectory}; found ${matches.join(", ") || "none"}`);
  }
  return path.join(artifactsDirectory, matches[0]);
}

function smokeEnvironment() {
  return {
    ...process.env,
    TMPDIR: scratch,
    CHAT2CODEX_LAUNCHER_DATA_DIR: path.join(scratch, "launcher-data"),
    CHAT2CODEX_HOME: coreHome,
    CODEX_HOME: path.join(scratch, "codex-home"),
    CHAT2CODEX_SMOKE_FILE: markerPath,
  };
}

try {
  let executable;
  let command;
  let args;
  const env = smokeEnvironment();

  if (process.platform === "darwin") {
    const archive = artifact(/-mac-(?:arm64|x64)\.zip$/, "macOS launcher archive");
    const stage = path.join(scratch, "stage");
    fs.mkdirSync(stage);
    run("ditto", ["-x", "-k", archive, stage]);
    macAppBundle = path.join(stage, "Chat2Codex.app");
    executable = path.join(macAppBundle, "Contents", "MacOS", "Chat2Codex");
    command = executable;
    args = ["--launcher-smoke-test"];
  } else if (process.platform === "linux") {
    executable = artifact(/-linux-x64\.AppImage$/, "Linux AppImage");
    fs.chmodSync(executable, 0o755);
    run(path.join(launcherRoot, "scripts", "smoke-linux-appimage-symbols.sh"), [executable], {
      timeout: 120_000,
    });
    command = "xvfb-run";
    args = ["-a", executable, "--launcher-smoke-test"];
    env.APPIMAGE_EXTRACT_AND_RUN = "1";
  } else if (process.platform === "win32") {
    const installer = artifact(/-win-x64\.exe$/, "Windows installer");
    run(installer, ["/S", "/currentuser"], { timeout: 120_000 });
    executable = path.join(windowsInstallLocation(), `${launcherManifest.build.productName}.exe`);
    command = executable;
    args = ["--launcher-smoke-test"];
  } else {
    throw new Error(`Unsupported package smoke platform: ${process.platform}`);
  }

  if (!fs.existsSync(executable)) throw new Error(`Packaged launcher executable is missing: ${executable}`);
  const startupAt = Date.now();
  run(command, args, { env });
  process.stdout.write(`PACKAGED_LAUNCHER_STARTUP_MS ${Date.now() - startupAt}\n`);
  if (!fs.existsSync(markerPath)) throw new Error("Packaged launcher did not write its readiness marker");
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  if (marker.ok !== true
    || marker.packaged !== true
    || marker.runtimeVerified !== true
    || marker.version !== expectedVersion
    || marker.platform !== process.platform) {
    throw new Error(`Unexpected packaged launcher marker: ${JSON.stringify(marker)}`);
  }
  const installedRuntime = path.join(
    coreHome,
    "versions",
    `${expectedVersion}-${process.platform}-${process.arch}`,
  );
  const installedManifest = JSON.parse(
    fs.readFileSync(path.join(installedRuntime, "manifest.json"), "utf8"),
  );
  validateRuntimeBundle(installedRuntime, {
    version: expectedVersion,
    platform: process.platform,
    arch: process.arch,
  });
  if (installedManifest.schemaVersion !== 2
    || installedManifest.appVersion !== expectedVersion
    || installedManifest.platform !== process.platform
    || installedManifest.arch !== process.arch
    || !Array.isArray(installedManifest.files)
    || installedManifest.files.length === 0
    || !/^[a-f0-9]{64}$/.test(installedManifest.bundleId)) {
    throw new Error(`Packaged launcher installed the wrong durable runtime: ${JSON.stringify(installedManifest)}`);
  }
  process.stdout.write(`PACKAGED_LAUNCHER_SMOKE_OK ${process.platform}/${process.arch}\n`);
} catch (error) {
  // Preserve small diagnostics before deleting the isolated profile; never copy browser storage.
  const diagnostics = path.resolve(launcherRoot, "../output/package-smoke", `failure-${Date.now()}`);
  fs.mkdirSync(diagnostics, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(diagnostics, "process.log"), lastProcessOutput, { mode: 0o600 });
  fs.writeFileSync(path.join(diagnostics, "failure.txt"), String(error.stack || error), { mode: 0o600 });
  for (const name of ["launcher.jsonl", "launcher-fatal.log"]) {
    const source = path.join(scratch, "launcher-data", "logs", name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(diagnostics, name));
  }
  if (fs.existsSync(markerPath)) fs.copyFileSync(markerPath, path.join(diagnostics, "ready.json"));
  console.error(`Package smoke diagnostics: ${diagnostics}`);
  throw error;
} finally {
  try {
    if (macAppBundle) {
      const launchServices =
        "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
      run(
        launchServices,
        ["-u", macAppBundle],
      );
      run(launchServices, ["-gc"]);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
