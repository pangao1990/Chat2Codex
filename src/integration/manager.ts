import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../config";
import { atomicWriteFile, getConfigDir } from "../config";
import {
  getCodexConfigPath,
  installCodexIntegration,
  uninstallCodexIntegration,
} from "../codex-integration";
import { sha256 } from "../codex-integration-shared";
import { backupCodexConfig } from "./backup";
import { detectExternalManager } from "./detector";
import type { IntegrationMode, IntegrationState } from "./mode";
import { assertChat2CodexOwnsCodexConfig } from "./ownership";

type InstallRoute = (config: AppConfig, options?: Parameters<typeof installCodexIntegration>[1]) => unknown;
type UninstallRoute = () => unknown;

export class IntegrationManager {
  readonly statePath: string;
  readonly backupDirectory: string;

  constructor(private readonly options: {
    appHome?: string;
    codexConfigPath?: string;
    installRoute?: InstallRoute;
    uninstallRoute?: UninstallRoute;
    now?: () => Date;
  } = {}) {
    const appHome = options.appHome ?? getConfigDir();
    this.statePath = join(appHome, "integration.json");
    this.backupDirectory = join(appHome, "backups");
  }

  recommendedMode(): IntegrationMode {
    return detectExternalManager().detected ? "external-manager" : "standalone";
  }

  readState(): IntegrationState | undefined {
    if (!existsSync(this.statePath)) return undefined;
    const value = JSON.parse(readFileSync(this.statePath, "utf8")) as IntegrationState;
    if (value.version !== 1 || (value.mode !== "standalone" && value.mode !== "external-manager")) {
      throw new Error(`Invalid integration state: ${this.statePath}`);
    }
    return value;
  }

  install(
    config: AppConfig,
    mode: IntegrationMode,
    externalManager = "CC Switch",
    routeOptions: Parameters<typeof installCodexIntegration>[1] = {},
  ): IntegrationState {
    const configPath = this.options.codexConfigPath ?? getCodexConfigPath();
    const before = existsSync(configPath) ? readFileSync(configPath) : Buffer.from("");
    const beforeHash = sha256(before);
    const installedAt = (this.options.now?.() ?? new Date()).toISOString();

    if (mode === "standalone") {
      assertChat2CodexOwnsCodexConfig(mode);
      backupCodexConfig({ configPath, backupDirectory: this.backupDirectory, now: new Date(installedAt) });
      (this.options.installRoute ?? installCodexIntegration)(config, routeOptions);
    }

    const after = existsSync(configPath) ? readFileSync(configPath) : Buffer.from("");
    const afterHash = sha256(after);
    if (mode === "external-manager" && afterHash !== beforeHash) {
      throw new Error("External Manager mode mutated Codex configuration");
    }
    const state: IntegrationState = {
      version: 1,
      mode,
      managed: mode === "standalone" ? ["openai_base_url"] : [],
      installedAt,
      configPath,
      configHashBeforeInstall: beforeHash,
      configHashAfterInstall: afterHash,
      ...(mode === "external-manager" ? { externalManager } : {}),
      active: true,
    };
    atomicWriteFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  restoreNative(): IntegrationState {
    const current = this.readState();
    if (!current) throw new Error("Chat2Codex integration is not installed");
    assertChat2CodexOwnsCodexConfig(current.mode);
    (this.options.uninstallRoute ?? uninstallCodexIntegration)();
    const next = { ...current, active: false } satisfies IntegrationState;
    atomicWriteFile(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}
