import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../src/config";
import {
  ConfigOwnershipError,
  IntegrationManager,
  externalProviderConfiguration,
} from "../src/integration";

const roots: string[] = [];

function fixture() {
  const root = join(tmpdir(), `chat2codex-integration-${crypto.randomUUID()}`);
  const appHome = join(root, "app");
  const codexConfigPath = join(root, "codex", "config.toml");
  mkdirSync(join(root, "codex"), { recursive: true });
  writeFileSync(codexConfigPath, 'model = "gpt-5.6-sol"\n');
  roots.push(root);
  return { root, appHome, codexConfigPath };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("integration ownership", () => {
  test("external mode never mutates Codex config.toml", () => {
    const { appHome, codexConfigPath } = fixture();
    const before = readFileSync(codexConfigPath, "utf8");
    let installCalls = 0;
    const manager = new IntegrationManager({
      appHome,
      codexConfigPath,
      installRoute: () => { installCalls += 1; throw new Error("must not be called"); },
    });
    const state = manager.install(defaultConfig(), "external-manager", "CC Switch");
    expect(installCalls).toBe(0);
    expect(readFileSync(codexConfigPath, "utf8")).toBe(before);
    expect(state.configHashAfterInstall).toBe(state.configHashBeforeInstall);
    expect(() => manager.restoreNative()).toThrow(ConfigOwnershipError);
  });

  test("standalone mode backs up before the owned route is installed", () => {
    const { appHome, codexConfigPath } = fixture();
    const original = readFileSync(codexConfigPath, "utf8");
    const manager = new IntegrationManager({
      appHome,
      codexConfigPath,
      now: () => new Date("2026-09-03T10:00:00.000Z"),
      installRoute: () => writeFileSync(codexConfigPath, `${original}openai_base_url = "http://127.0.0.1:17841/v1"\n`),
      uninstallRoute: () => writeFileSync(codexConfigPath, original),
    });
    const state = manager.install(defaultConfig(), "standalone");
    expect(state.managed).toEqual(["openai_base_url"]);
    expect(readFileSync(join(appHome, "backups", "config-before-install.toml"), "utf8")).toBe(original);
    expect(manager.restoreNative().active).toBe(false);
    expect(readFileSync(codexConfigPath, "utf8")).toBe(original);
  });

  test("exports a loopback-only CC Switch configuration", () => {
    expect(externalProviderConfiguration()).toContain('openai_base_url = "http://127.0.0.1:17841/v1"');
    expect(() => externalProviderConfiguration("http://0.0.0.0:17841/v1")).toThrow(/loopback/);
  });
});
