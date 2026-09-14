import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Vault, VaultConfig } from './types.ts';

const REQUIRED_KEYS = [
  'vaultName', 'route', 'managerRegex', 'ambiguousRegex', 'peopleRegex', 'jobsFolder', 'inboxFolder',
] as const;

/** Load `vaults.json` (`{ "vaults": [<path to .teal-sync.json>, …] }`) and every config it lists. */
export function loadVaults(vaultsJsonPath: string): Vault[] {
  return configPaths(vaultsJsonPath).map((configPath) => ({
    dir: dirname(configPath),
    config: validateConfig(readJson(configPath), configPath),
  }));
}

/** Absolute paths of the `.teal-sync.json` files listed in `vaults.json`. */
export function configPaths(vaultsJsonPath: string): string[] {
  if (!existsSync(vaultsJsonPath)) {
    throw new Error(`${vaultsJsonPath} not found. Copy vaults.example.json to vaults.json and fill in your paths.`);
  }
  const list = readJson(vaultsJsonPath) as { vaults?: unknown };
  if (!Array.isArray(list.vaults) || list.vaults.length === 0) {
    throw new Error(`${vaultsJsonPath}: expected { "vaults": ["/path/to/.teal-sync.json", …] }`);
  }
  return list.vaults.map((entry) => resolve(dirname(vaultsJsonPath), String(entry)));
}

/** Read a `.teal-sync.json`, let `mutate` change it, and write it back (keys the script doesn't know survive). */
export function updateConfigFile(path: string, mutate: (raw: Record<string, unknown>) => void): void {
  const raw = readJson(path) as Record<string, unknown>;
  mutate(raw);
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
}

function validateConfig(raw: unknown, path: string): VaultConfig {
  const config = raw as Partial<VaultConfig>;
  const missing = REQUIRED_KEYS.filter((key) => typeof config[key] !== 'string');
  if (missing.length > 0) throw new Error(`${path} is missing: ${missing.join(', ')}`);
  if (config.route !== 'manager' && config.route !== 'ic') {
    throw new Error(`${path}: route must be "manager" or "ic"`);
  }
  return { overrides: {}, aliases: {}, lastSync: null, pendingFeedback: [], ...config } as VaultConfig;
}
