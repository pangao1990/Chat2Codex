import type { IntegrationMode } from "./mode";

export class ConfigOwnershipError extends Error {
  readonly code = "config_ownership_error";

  constructor(message = "Codex configuration is owned by an external manager") {
    super(message);
    this.name = "ConfigOwnershipError";
  }
}

export function assertChat2CodexOwnsCodexConfig(mode: IntegrationMode): void {
  if (mode === "external-manager") throw new ConfigOwnershipError();
}
