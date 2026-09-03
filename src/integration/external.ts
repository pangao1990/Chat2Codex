import { readFileSync } from "node:fs";
import { sha256 } from "../codex-integration-shared";
import { ConfigOwnershipError } from "./ownership";

export function inspectExternalCodexConfig(path: string): { path: string; hash: string } {
  return { path, hash: sha256(readFileSync(path)) };
}

export function refuseExternalConfigMutation(): never {
  throw new ConfigOwnershipError();
}
