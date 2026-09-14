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

const item = (tealId: string, to: string) => ({
  tealId, company: 'Acme', role: 'Staff Frontend Engineer', url: null, from: 'bookmarked', to, seenOn: TODAY,
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

describe('update.ts feedback queue', () => {
  it('prints the queued feedback message', () => {
    const { ic } = makeVaults({ ic: { pendingFeedback: [item('t1', 'applied')] } });
    const proc = run(['feedback-message', '--config', configPath(ic)]);
    assert.equal(proc.status, 0, proc.stderr);
    assert.equal(proc.stdout, "I've just applied to Acme – Staff Frontend Engineer\n");
  });

  it('prints nothing when the queue is empty', () => {
    const { ic } = makeVaults();
    const proc = run(['feedback-message', '--config', configPath(ic)]);
    assert.equal(proc.status, 0, proc.stderr);
    assert.equal(proc.stdout, '');
  });

  it('clears the queue and keeps other keys', () => {
    const { ic } = makeVaults({ ic: { pendingFeedback: [item('t1', 'applied'), item('t2', 'interviewing')] } });
    const proc = run(['clear-feedback', '--config', configPath(ic)]);
    assert.equal(proc.status, 0, proc.stderr);
    assert.deepEqual(readConfig(ic).pendingFeedback, []);
    assert.equal(readConfig(ic).vaultName, 'ic-web-dev-search');
  });

  it('requires --config', () => {
    assert.equal(run(['clear-feedback']).status, 1);
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
