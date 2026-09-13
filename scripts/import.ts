#!/usr/bin/env node
// Sync a Teal "Download Data" CSV into every vault listed in vaults.json.
// Prints the machine-readable SyncResult as JSON. Exit codes: 0 ok, 1 error, 2 a vault aborted (missing guard).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadVaults } from './lib/config.ts';
import { syncAll } from './lib/sync.ts';

const USAGE = 'Usage: node scripts/import.ts --csv <teal-export.csv> [--vaults <vaults.json>] [--today YYYY-MM-DD] [--dry-run] [--force]';
const DEFAULT_VAULTS = fileURLToPath(new URL('../vaults.json', import.meta.url));

function localDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function main(): number {
  let args;
  try {
    args = parseArgs({
      options: {
        csv: { type: 'string' },
        vaults: { type: 'string', default: DEFAULT_VAULTS },
        today: { type: 'string', default: localDate() },
        'dry-run': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values;
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 1;
  }

  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (!args.csv) {
    console.error(`Missing --csv.\n${USAGE}`);
    return 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today)) {
    console.error(`--today must be YYYY-MM-DD, got "${args.today}"`);
    return 1;
  }

  try {
    const result = syncAll(readFileSync(args.csv, 'utf8'), loadVaults(args.vaults), {
      today: args.today,
      force: args.force,
      dryRun: args['dry-run'],
    });
    console.log(JSON.stringify(result, null, 2));
    return result.vaults.some((vault) => vault.aborted) ? 2 : 0;
  } catch (error) {
    console.error(`teal-sync: ${(error as Error).message}`);
    return 1;
  }
}

process.exitCode = main();
