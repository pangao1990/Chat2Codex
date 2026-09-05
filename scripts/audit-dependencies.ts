const OFFICIAL_REGISTRY = "https://registry.npmjs.org";
const AUDIT_TIMEOUT_MS = 60_000;

export {};

// The npmmirror package mirror intentionally does not implement npm's audit API.
// Keep ordinary installs on the user's selected source, but send security audits
// to the authoritative registry so a fast China mirror does not create a false
// verification failure.
const child = Bun.spawn([process.execPath, "audit"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    BUN_CONFIG_REGISTRY: OFFICIAL_REGISTRY,
    npm_config_registry: OFFICIAL_REGISTRY,
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill();
}, AUDIT_TIMEOUT_MS);

const exitCode = await child.exited;
clearTimeout(timeout);
if (timedOut) {
  console.error(`Dependency audit timed out after ${AUDIT_TIMEOUT_MS / 1_000} seconds while contacting ${OFFICIAL_REGISTRY}`);
}
process.exit(timedOut ? 1 : exitCode);
