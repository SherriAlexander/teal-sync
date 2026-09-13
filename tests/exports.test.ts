import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileExport } from '../scripts/lib/exports.ts';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'teal-exports-'));
  const dir = join(root, '.teal-exports');
  const csv = join(root, 'job-tracker-2026-09-12T20_16_07.587Z.csv');
  writeFileSync(csv, 'a,b\n');
  return { root, dir, csv };
}

function seed(dir: string, names: string[]) {
  mkdirSync(dir, { recursive: true });
  names.forEach((name, index) => {
    const path = join(dir, name);
    writeFileSync(path, 'old\n');
    const time = new Date(Date.UTC(2026, 8, 1 + index));
    utimesSync(path, time, time);
  });
}

describe('fileExport', () => {
  it('copies the CSV into a new exports folder', () => {
    const { dir, csv } = setup();
    const filing = fileExport(csv, dir);
    assert.equal(filing.filed, join(dir, 'job-tracker-2026-09-12T20_16_07.587Z.csv'));
    assert.deepEqual(filing.pruned, []);
    assert.ok(existsSync(csv), 'source is left in place');
  });

  it('keeps only the newest 3 CSVs', () => {
    const { dir, csv } = setup();
    seed(dir, ['job-tracker-a.csv', 'job-tracker-b.csv', 'job-tracker-c.csv', 'notes.txt']);
    const filing = fileExport(csv, dir);
    assert.deepEqual(filing.pruned, [join(dir, 'job-tracker-a.csv')]);
    assert.deepEqual(readdirSync(dir).sort(), [
      'job-tracker-2026-09-12T20_16_07.587Z.csv', 'job-tracker-b.csv', 'job-tracker-c.csv', 'notes.txt',
    ]);
  });

  it('does not copy a CSV that already lives in the exports folder', () => {
    const { dir } = setup();
    seed(dir, ['job-tracker-a.csv']);
    const filing = fileExport(join(dir, 'job-tracker-a.csv'), dir);
    assert.equal(filing.filed, join(dir, 'job-tracker-a.csv'));
    assert.deepEqual(readdirSync(dir), ['job-tracker-a.csv']);
  });
});
