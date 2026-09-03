export type IntegrationMode = "standalone" | "external-manager";

export interface IntegrationState {
  version: 1;
  mode: IntegrationMode;
  managed: string[];
  installedAt: string;
  configPath: string;
  configHashBeforeInstall: string;
  configHashAfterInstall: string;
  externalManager?: string;
  active: boolean;
}
