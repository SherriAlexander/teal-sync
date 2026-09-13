import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Vault, VaultConfig } from './types.ts';

const REQUIRED_KEYS = [
  'vaultName', 'route', 'managerRegex', 'ambiguousRegex', 'peopleRegex', 'jobsFolder', 'inboxFolder',
] as const;

/** Load `vaults.json` (`{ "vaults": [<path to .teal-sync.json>, …] }`) and every config it lists. */
export function loadVaults(vaultsJsonPath: string): Vault[] {
  const list = readJson(vaultsJsonPath) as { vaults?: unknown };
  if (!Array.isArray(list.vaults) || list.vaults.length === 0) {
    throw new Error(`${vaultsJsonPath}: expected { "vaults": ["/path/to/.teal-sync.json", …] }`);
  }
  return list.vaults.map((entry) => {
    const configPath = resolve(dirname(vaultsJsonPath), String(entry));
    return { dir: dirname(configPath), config: validateConfig(readJson(configPath), configPath) };
  });
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
  return { overrides: {}, aliases: {}, lastSync: null, pendingProposals: [], ...config } as VaultConfig;
}
