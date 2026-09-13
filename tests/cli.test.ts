import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVaults } from '../scripts/lib/config.ts';
import { FIXTURE_PATH, TODAY, makeVaults } from './helpers.ts';

const SCRIPT = fileURLToPath(new URL('../scripts/import.ts', import.meta.url));

function setup() {
  const vaults = makeVaults();
  const vaultsJson = join(vaults.root, 'vaults.json');
  writeFileSync(vaultsJson, JSON.stringify({
    vaults: vaults.all.map((v) => join(v.dir, '.teal-sync.json')),
  }));
  return { ...vaults, vaultsJson };
}

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

describe('loadVaults', () => {
  it('loads each config and resolves the vault directory', () => {
    const { manager, ic, vaultsJson } = setup();
    const vaults = loadVaults(vaultsJson);
    assert.deepEqual(vaults.map((v) => v.dir), [manager.dir, ic.dir]);
    assert.equal(vaults[1].config.route, 'ic');
  });

  it('names the config file that is missing', () => {
    const { root } = setup();
    const bad = join(root, 'bad.json');
    writeFileSync(bad, JSON.stringify({ vaults: [join(root, 'nope/.teal-sync.json')] }));
    assert.throws(() => loadVaults(bad), /nope\/\.teal-sync\.json/);
  });
});

describe('import.ts CLI', () => {
  it('syncs every vault and prints the JSON result', () => {
    const { manager, vaultsJson } = setup();
    const proc = run(['--csv', FIXTURE_PATH, '--vaults', vaultsJson, '--today', TODAY]);
    assert.equal(proc.status, 0, proc.stderr);
    const result = JSON.parse(proc.stdout);
    assert.equal(result.vaults.length, 2);
    assert.deepEqual(result.counts, { manager: 3, ic: 7, pending: 0 });
    assert.ok(existsSync(join(manager.dir, 'Jobs')));
  });

  it('honors --dry-run', () => {
    const { manager, vaultsJson } = setup();
    const proc = run(['--csv', FIXTURE_PATH, '--vaults', vaultsJson, '--today', TODAY, '--dry-run']);
    assert.equal(proc.status, 0, proc.stderr);
    assert.ok(!existsSync(join(manager.dir, 'Jobs')));
  });

  it('exits 1 with usage when --csv is missing', () => {
    const proc = run([]);
    assert.equal(proc.status, 1);
    assert.match(proc.stderr, /--csv/);
  });
});

describe('import.ts CLI filing', () => {
  it('files the export into each root, stamps lastSync, and prints the digest', () => {
    const { root, manager, vaultsJson } = setup();
    const proc = run(['--csv', FIXTURE_PATH, '--vaults', vaultsJson, '--today', TODAY]);
    assert.equal(proc.status, 0, proc.stderr);
    const result = JSON.parse(proc.stdout);
    assert.match(result.header, /^Teal sync: 10 jobs/);
    assert.equal(result.exports.length, 2);
    for (const side of ['mgr', 'dev']) assert.ok(existsSync(join(root, side, '.teal-exports', 'teal-export.csv')), side);
    assert.equal(JSON.parse(readFileSync(join(manager.dir, '.teal-sync.json'), 'utf8')).lastSync, TODAY);
  });

  it('files nothing on a dry run', () => {
    const { root, vaultsJson } = setup();
    const proc = run(['--csv', FIXTURE_PATH, '--vaults', vaultsJson, '--today', TODAY, '--dry-run']);
    assert.equal(proc.status, 0, proc.stderr);
    assert.deepEqual(JSON.parse(proc.stdout).exports, []);
    assert.ok(!existsSync(join(root, 'mgr', '.teal-exports')));
  });
});

describe('import.ts --json-out', () => {
  it('writes the JSON to a file and prints the text digest', () => {
    const { root, vaultsJson } = setup();
    const out = join(root, 'result.json');
    const proc = run(['--csv', FIXTURE_PATH, '--vaults', vaultsJson, '--today', TODAY, '--dry-run', '--json-out', out]);
    assert.equal(proc.status, 0, proc.stderr);
    assert.match(proc.stdout, /^Teal sync: 10 jobs/);
    assert.match(proc.stdout, /\n== manager-job-search ==\n/);
    assert.match(proc.stdout, /summary: ic-web-dev-search: 7 new/);
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).exportRows, 10);
  });
});
