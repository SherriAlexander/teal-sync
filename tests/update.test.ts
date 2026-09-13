import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncAll } from '../scripts/lib/sync.ts';
import type { Vault } from '../scripts/lib/types.ts';
import { TODAY, csvOf, jobPath, makeVaults, readJob, row } from './helpers.ts';

const SCRIPT = fileURLToPath(new URL('../scripts/update.ts', import.meta.url));
const ACME = 'Acme – Staff Frontend Engineer';

const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const configPath = (vault: Vault) => join(vault.dir, '.teal-sync.json');
const readConfig = (vault: Vault) => JSON.parse(readFileSync(configPath(vault), 'utf8'));

const proposal = (tealId: string) => ({
  tealId, company: 'Acme', role: 'Staff Frontend Engineer', notePath: 'x.md', loop: 'Acme',
  from: 'Researched', to: 'Applied', tealStatus: 'applied', proposedOn: TODAY,
});

describe('update.ts things-id', () => {
  it('sets things_id and leaves the body alone', () => {
    const { ic, all } = makeVaults();
    syncAll(csvOf([row({ id: 't1', statusName: 'applied' })]), all, { today: TODAY });
    const before = readJob(ic, ACME);

    const proc = run(['things-id', '--note', jobPath(ic, ACME), '--value', 'ABC123']);
    assert.equal(proc.status, 0, proc.stderr);
    const after = readJob(ic, ACME);
    assert.equal(after.fm.things_id, 'ABC123');
    assert.equal(after.body, before.body);
  });

  it('refuses a note that is not a job', () => {
    const { ic } = makeVaults();
    const path = join(ic.dir, 'Home.md');
    writeFileSync(path, '# Home\n');
    const proc = run(['things-id', '--note', path, '--value', 'ABC']);
    assert.equal(proc.status, 1);
    assert.match(proc.stderr, /not a job note/);
  });

  it('requires --note and --value', () => {
    assert.equal(run(['things-id', '--value', 'x']).status, 1);
  });
});

describe('update.ts resolve-proposal', () => {
  it('removes a handled proposal', () => {
    const { ic } = makeVaults({ ic: { pendingProposals: [proposal('t1'), proposal('t2')] } });
    const proc = run(['resolve-proposal', '--config', configPath(ic), '--teal-id', 't1']);
    assert.equal(proc.status, 0, proc.stderr);
    assert.deepEqual(readConfig(ic).pendingProposals.map((p: { tealId: string }) => p.tealId), ['t2']);
    assert.deepEqual(readConfig(ic).dismissedProposals, []);
  });

  it('remembers a dismissed proposal', () => {
    const { ic } = makeVaults({ ic: { pendingProposals: [proposal('t1')] } });
    const proc = run(['resolve-proposal', '--config', configPath(ic), '--teal-id', 't1', '--dismiss']);
    assert.equal(proc.status, 0, proc.stderr);
    assert.deepEqual(readConfig(ic).pendingProposals, []);
    assert.deepEqual(readConfig(ic).dismissedProposals, ['t1:Applied']);
  });

  it('fails on an unknown proposal', () => {
    const { ic } = makeVaults();
    assert.equal(run(['resolve-proposal', '--config', configPath(ic), '--teal-id', 'nope']).status, 1);
  });
});

describe('update.ts override', () => {
  it('writes the override into every vault', () => {
    const { root, all } = makeVaults();
    const vaultsJson = join(root, 'vaults.json');
    writeFileSync(vaultsJson, JSON.stringify({ vaults: all.map(configPath) }));
    const proc = run(['override', '--vaults', vaultsJson, '--teal-id', 't9', '--route', 'manager']);
    assert.equal(proc.status, 0, proc.stderr);
    for (const vault of all) assert.equal(readConfig(vault).overrides.t9, 'manager');
  });

  it('rejects a bad route or subcommand', () => {
    const { root, all } = makeVaults();
    const vaultsJson = join(root, 'vaults.json');
    writeFileSync(vaultsJson, JSON.stringify({ vaults: all.map(configPath) }));
    assert.equal(run(['override', '--vaults', vaultsJson, '--teal-id', 't9', '--route', 'boss']).status, 1);
    assert.equal(run(['explode']).status, 1);
  });
});
