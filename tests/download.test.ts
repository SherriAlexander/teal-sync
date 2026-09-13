import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestDownload } from '../scripts/lib/exports.ts';

const SCRIPT = fileURLToPath(new URL('../scripts/wait-download.ts', import.meta.url));

function downloads() {
  const dir = mkdtempSync(join(tmpdir(), 'teal-downloads-'));
  const add = (name: string, secondsAgo = 0) => {
    const path = join(dir, name);
    writeFileSync(path, 'a,b\n');
    const time = new Date(Date.now() - secondsAgo * 1000);
    utimesSync(path, time, time);
    return path;
  };
  return { dir, add };
}

describe('newestDownload', () => {
  it('returns the newest finished Teal CSV since the click', () => {
    const { dir, add } = downloads();
    add('job-tracker-2026-09-01T00_00_00.000Z.csv', 3600);
    const fresh = add('job-tracker-2026-09-12T20_16_07.587Z.csv');
    add('other.csv');
    assert.equal(newestDownload(dir, Date.now() - 60_000), fresh);
  });

  it('ignores partial downloads and files from before the click', () => {
    const { dir, add } = downloads();
    add('job-tracker-2026-09-01T00_00_00.000Z.csv', 3600);
    add('job-tracker-2026-09-12T20_16_07.587Z.csv.crdownload');
    assert.equal(newestDownload(dir, Date.now() - 60_000), null);
  });
});

describe('wait-download.ts CLI', () => {
  const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

  it('prints the path when the download is there', () => {
    const { dir, add } = downloads();
    const fresh = add('job-tracker-x.csv');
    const proc = run(['--dir', dir, '--since', String(Date.now() - 60_000), '--timeout', '0']);
    assert.equal(proc.status, 0, proc.stderr);
    assert.equal(proc.stdout.trim(), fresh);
  });

  it('exits 2 on timeout and 1 when the folder is unreadable', () => {
    const { dir } = downloads();
    assert.equal(run(['--dir', dir, '--since', String(Date.now()), '--timeout', '0']).status, 2);
    assert.equal(run(['--dir', join(dir, 'nope'), '--since', '0', '--timeout', '0']).status, 1);
    assert.equal(run(['--dir', dir]).status, 1);
  });
});
