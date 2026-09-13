#!/usr/bin/env node
// Sync a Teal "Download Data" CSV into every vault listed in vaults.json.
// Mirrors Interview Loops, files the CSV into each root's exports folder, and prints the SyncResult (with digests) as JSON. Exit codes: 0 ok, 1 error, 2 a vault aborted (missing guard).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadVaults } from './lib/config.ts';
import { renderText } from './lib/digest.ts';
import { fileExport } from './lib/exports.ts';
import { finishAll } from './lib/finish.ts';
import { formatLocalDate } from './lib/plan.ts';
import { syncAll } from './lib/sync.ts';

const USAGE = 'Usage: node scripts/import.ts --csv <teal-export.csv> [--vaults <vaults.json>] [--today YYYY-MM-DD] [--dry-run] [--force] [--json-out <file>]';
const DEFAULT_VAULTS = fileURLToPath(new URL('../vaults.json', import.meta.url));

function main(): number {
  let args;
  try {
    args = parseArgs({
      options: {
        csv: { type: 'string' },
        vaults: { type: 'string', default: DEFAULT_VAULTS },
        today: { type: 'string', default: formatLocalDate(new Date()) },
        'dry-run': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        'json-out': { type: 'string' },
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
    const vaults = loadVaults(args.vaults);
    const options = { today: args.today, force: args.force, dryRun: args['dry-run'] };
    const result = finishAll(syncAll(readFileSync(args.csv, 'utf8'), vaults, options), vaults, options);
    if (!options.dryRun) {
      const dirs = new Set(
        vaults
          .filter((vault) => !result.vaults.find((v) => v.vaultDir === vault.dir)?.aborted)
          .map((vault) => resolve(vault.dir, vault.config.exportsDir)),
      );
      result.exports = [...dirs].map((dir) => fileExport(args.csv!, dir));
    }
    const json = JSON.stringify(result, null, 2);
    if (args['json-out']) {
      writeFileSync(args['json-out'], `${json}\n`);
      console.log(renderText(result));
    } else {
      console.log(json);
    }
    return result.vaults.some((vault) => vault.aborted) ? 2 : 0;
  } catch (error) {
    console.error(`teal-sync: ${(error as Error).message}`);
    return 1;
  }
}

process.exitCode = main();
