import { existsSync, readFileSync, statSync } from "node:fs";
import { sha256 } from "../codex-integration-shared";

export interface ConfigFingerprint {
  exists: boolean;
  hash: string;
  modifiedAtMs: number | null;
}

export function fingerprintCodexConfig(path: string): ConfigFingerprint {
  if (!existsSync(path)) return { exists: false, hash: sha256(""), modifiedAtMs: null };
  return {
    exists: true,
    hash: sha256(readFileSync(path)),
    modifiedAtMs: statSync(path).mtimeMs,
  };
}

export function configChangedExternally(expected: ConfigFingerprint, current: ConfigFingerprint): boolean {
  return expected.exists !== current.exists || expected.hash !== current.hash;
}

export class ConfigConflictMonitor {
  private expected: ConfigFingerprint;

  constructor(private readonly configPath: string) {
    this.expected = fingerprintCodexConfig(configPath);
  }

  acknowledgeCurrent(): ConfigFingerprint {
    this.expected = fingerprintCodexConfig(this.configPath);
    return this.snapshot();
  }

  inspect(): { changed: boolean; expected: ConfigFingerprint; current: ConfigFingerprint } {
    const current = fingerprintCodexConfig(this.configPath);
    return { changed: configChangedExternally(this.expected, current), expected: this.snapshot(), current };
  }

  private snapshot(): ConfigFingerprint {
    return { ...this.expected };
  }
}
