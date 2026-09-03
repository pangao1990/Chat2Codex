import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { atomicWriteFile } from "../config";

function timestampName(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function backupCodexConfig({
  configPath,
  backupDirectory,
  now = new Date(),
}: {
  configPath: string;
  backupDirectory: string;
  now?: Date;
}): { baselinePath: string; timestampedPath: string; existed: boolean } {
  const data = existsSync(configPath) ? readFileSync(configPath) : Buffer.from("");
  const baselinePath = join(backupDirectory, "config-before-install.toml");
  const timestampedPath = join(backupDirectory, `config-${timestampName(now)}.toml`);
  if (!existsSync(baselinePath)) atomicWriteFile(baselinePath, data);
  atomicWriteFile(timestampedPath, data);
  return { baselinePath, timestampedPath, existed: existsSync(configPath) };
}

export function describeBackup(path: string): string {
  return basename(path);
}
