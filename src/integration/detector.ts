import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ExternalManagerDetection {
  detected: boolean;
  manager?: "CC Switch";
  evidence: string[];
}

export function detectExternalManager({
  homeDirectory = homedir(),
  pathExists = existsSync,
}: {
  homeDirectory?: string;
  pathExists?: (path: string) => boolean;
} = {}): ExternalManagerDetection {
  const candidates = [
    join(homeDirectory, ".cc-switch"),
    join(homeDirectory, ".config", "cc-switch"),
  ];
  const evidence = candidates.filter(pathExists);
  return evidence.length > 0
    ? { detected: true, manager: "CC Switch", evidence }
    : { detected: false, evidence: [] };
}
