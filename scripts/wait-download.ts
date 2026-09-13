#!/usr/bin/env node
// Wait for a Teal "Download Data" CSV to finish downloading, then print its path.
// Exit codes: 0 found, 1 error (bad args, folder unreadable), 2 timed out.
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { newestDownload } from './lib/exports.ts';

const USAGE = 'Usage: node scripts/wait-download.ts --dir <downloads folder> --since <epoch ms> [--timeout <seconds, default 60>]';
const POLL_MS = 500;

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs({
      options: {
        dir: { type: 'string' },
        since: { type: 'string' },
        timeout: { type: 'string', default: '60' },
      },
    }).values;
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 1;
  }

  const since = Number(args.since);
  const timeout = Number(args.timeout);
  if (!args.dir || !Number.isFinite(since) || !Number.isFinite(timeout)) {
    console.error(USAGE);
    return 1;
  }

  const deadline = Date.now() + timeout * 1000;
  for (;;) {
    let found: string | null;
    try {
      found = newestDownload(args.dir, since);
    } catch (error) {
      console.error(`Cannot read ${args.dir}: ${(error as Error).message}`);
      return 1;
    }
    if (found) {
      console.log(found);
      return 0;
    }
    if (Date.now() >= deadline) {
      console.error(`No finished job-tracker-*.csv in ${args.dir} after ${timeout}s`);
      return 2;
    }
    await delay(POLL_MS);
  }
}

process.exitCode = await main();
