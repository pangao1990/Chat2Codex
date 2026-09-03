import type { AppConfig } from "../config";
import {
  deactivateCodexIntegration,
  installCodexIntegration,
  uninstallCodexIntegration,
} from "../codex-integration";

export function installStandaloneRoute(config: AppConfig): void {
  installCodexIntegration(config);
}

export function disableStandaloneRoute(): void {
  deactivateCodexIntegration();
}

export function restoreNativeCodexRoute(): void {
  uninstallCodexIntegration();
}
