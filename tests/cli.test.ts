import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
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
