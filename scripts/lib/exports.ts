import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { ExportFiling } from './types.ts';

const TEAL_DOWNLOAD = /^job-tracker-.*\.csv$/;

/** Newest finished Teal download (`job-tracker-*.csv`, not `.crdownload`) in `dir` modified at or after `sinceMs`. */
export function newestDownload(dir: string, sinceMs: number): string | null {
  const newest = readdirSync(dir)
    .filter((name) => TEAL_DOWNLOAD.test(name))
    .map((name) => ({ path: join(dir, name), mtime: statSync(join(dir, name)).mtimeMs }))
    .filter((file) => file.mtime >= sinceMs)
    .sort((a, b) => b.mtime - a.mtime)[0];
  return newest?.path ?? null;
}

/** Copy a Teal CSV into `dir` and keep only the newest `keep` CSVs there. The source is left in place. */
export function fileExport(csvPath: string, dir: string, keep = 3): ExportFiling {
  mkdirSync(dir, { recursive: true });
  const filed = join(dir, basename(csvPath));
  if (resolve(csvPath) !== resolve(filed)) {
    copyFileSync(csvPath, filed);
    // macOS copies keep the source mtime; filing order is what "newest" means here.
    const now = new Date();
    utimesSync(filed, now, now);
  }

  const csvs = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .map((name) => ({ path: join(dir, name), name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  const pruned = csvs.slice(keep).map((file) => file.path);
  for (const path of pruned) rmSync(path);

  return { dir, filed, pruned };
}
