import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncAll } from '../scripts/lib/sync.ts';
import type { Vault } from '../scripts/lib/types.ts';
import {
  SCAFFOLD, TODAY, csvOf, fixtureRecords, fixtureText, jobPath, makeVaults, readJob, row, snapshot, writeJob,
} from './helpers.ts';

const GLOBEX = 'Globex – Sr. Manager, Digital Experience';
const APERTURE = 'Aperture Labs – Senior-Staff Software Engineer, Front End';
const UMBRELLA = 'Umbrella – Senior Software Engineer – Marketing';
const INITECH = 'Initech – Staff Frontend Engineer';
const MANAGER_NAMES = [GLOBEX, 'stark.io – Engineering Manager - Front-End (UI-UX)', 'Soylent – Engineering Manager, Frontend Platform & Mobile'];
const IC_NAMES = [
  APERTURE, INITECH, 'Hooli – Sr-Staff Frontend Engineer Web Products', UMBRELLA,
  'Vandelay Industries – Staff Software Engineer (Frontend - UI)',
  'Wonka – Principal Software Engineer, Front End Web UI Platform',
  'Tyrell – Senior Frontend Engineer - Design Systems',
];

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const vaultResult = (result: ReturnType<typeof syncAll>, vault: Vault) =>
  result.vaults.find((v) => v.vaultDir === vault.dir)!;

function editRecords(edit: (records: ReturnType<typeof fixtureRecords>) => void): string {
  const records = fixtureRecords();
  edit(records);
  return csvOf(records);
}

describe('first sync', () => {
  it('routes 3 manager and 7 IC jobs into one folder each', () => {
    const { manager, ic, all } = makeVaults();
    const result = syncAll(fixtureText(), all, { today: TODAY });

    assert.equal(result.exportRows, 10);
    assert.deepEqual(result.counts, { manager: 3, ic: 7, pending: 0 });
    for (const name of MANAGER_NAMES) assert.ok(existsSync(jobPath(manager, name)), name);
    for (const name of IC_NAMES) assert.ok(existsSync(jobPath(ic, name)), name);
    assert.ok(!existsSync(jobPath(ic, GLOBEX)));
    assert.deepEqual(vaultResult(result, manager).changes.map((c) => c.type), ['new', 'new', 'new']);
    assert.equal(vaultResult(result, ic).changes.length, 7);
  });

  it('writes the full frontmatter in a stable key order', () => {
    const { manager, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    const { fm } = readJob(manager, GLOBEX);
    const expected = {
      type: 'job',
      teal_id: id(2),
      route: 'manager',
      company: '[[Companies/Globex]]',
      company_name: 'Globex',
      role: 'Sr. Manager, Digital Experience',
      teal_status: 'interviewing',
      loop_status: null,
      excitement: 4,
      location: 'Waltham, MA',
      salary_min: null,
      salary_max: 150000,
      salary_currency: null,
      salary_period: null,
      url: 'https://example.com/jobs/1002',
      source: 'WebClient',
      added_at: '2026-09-01T17:53:25Z',
      applied_at: '2026-09-08T03:28:49Z',
      follow_up_at: '2026-09-14T04:00:00Z',
      updated_at: '2026-09-10T00:20:09Z',
      archived_at: null,
      teal_last_seen: TODAY,
      things_id: null,
    };
    assert.deepEqual(fm, expected);
    assert.deepEqual(Object.keys(fm), Object.keys(expected));
  });

  it('uses company aliases from the vault config', () => {
    const { manager, all } = makeVaults({ manager: { aliases: { Globex: 'Interviewing/Globex' } } });
    syncAll(fixtureText(), all, { today: TODAY });
    assert.equal(readJob(manager, GLOBEX).fm.company, '[[Interviewing/Globex]]');
  });

  it('gives bookmarks an empty body and applied-or-later jobs the scaffold', () => {
    const { manager, ic, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    assert.equal(readJob(ic, APERTURE).body, '');
    assert.equal(readJob(ic, UMBRELLA).body, SCAFFOLD);
    assert.equal(readJob(manager, GLOBEX).body, SCAFFOLD);
  });

  it('summarizes every job in the vault for the skill', () => {
    const { ic, all } = makeVaults();
    const result = syncAll(fixtureText(), all, { today: TODAY });
    const umbrella = vaultResult(result, ic).jobs.find((j) => j.company === 'Umbrella');
    assert.deepEqual(umbrella, {
      tealId: id(6),
      company: 'Umbrella',
      role: 'Senior Software Engineer – Marketing',
      route: 'ic',
      tealStatus: 'applied',
      loopStatus: null,
      notePath: `Jobs/${UMBRELLA}/${UMBRELLA}.md`,
      url: 'https://example.com/jobs/1006',
      appliedAt: '2026-09-03T07:11:06Z',
      followUpAt: '2026-09-10T04:00:00Z',
      thingsId: null,
    });
    assert.equal(vaultResult(result, ic).jobs.length, 7);
  });

  it('writes nothing on a dry run but still reports changes', () => {
    const { manager, all } = makeVaults();
    const result = syncAll(fixtureText(), all, { today: TODAY, dryRun: true });
    assert.equal(vaultResult(result, manager).changes.length, 3);
    assert.ok(!existsSync(join(manager.dir, 'Jobs')));
  });
});

describe('later syncs', () => {
  it('is idempotent', () => {
    const { manager, ic, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    const before = [snapshot(manager.dir), snapshot(ic.dir)];
    const second = syncAll(fixtureText(), all, { today: TODAY });
    assert.deepEqual(second.vaults.map((v) => v.changes), [[], []]);
    assert.deepEqual([snapshot(manager.dir), snapshot(ic.dir)], before);
  });

  it('updates status and role, keeps the folder name, user keys, and body bytes', () => {
    const { ic, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    const original = readJob(ic, APERTURE).text;
    writeJob(ic, APERTURE, original.replace('loop_status:\n', 'loop_status: Researched\ntags:\n  - dream\n') + 'My notes\n');

    const csv = editRecords((records) => {
      records[0].statusName = 'applying';
      records[0].role = 'Staff Software Engineer, Front End';
    });
    const result = syncAll(csv, all, { today: TODAY });

    const job = readJob(ic, APERTURE);
    assert.equal(job.fm.teal_status, 'applying');
    assert.equal(job.fm.role, 'Staff Software Engineer, Front End');
    assert.equal(job.fm.loop_status, 'Researched');
    assert.deepEqual(job.fm.tags, ['dream']);
    assert.equal(job.body, 'My notes\n');
    const changes = vaultResult(result, ic).changes.map(({ type, from, to }) => ({ type, from, to }));
    assert.deepEqual(changes, [
      { type: 'status', from: 'bookmarked', to: 'applying' },
      { type: 'retitle', from: 'Senior/Staff Software Engineer, Front End', to: 'Staff Software Engineer, Front End' },
    ]);
  });

  it('appends the scaffold after existing body text when a job reaches applied', () => {
    const { ic, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    writeJob(ic, APERTURE, readJob(ic, APERTURE).text + 'My notes\n');
    syncAll(editRecords((r) => { r[0].statusName = 'applied'; }), all, { today: TODAY });
    assert.equal(readJob(ic, APERTURE).body, `My notes\n\n${SCAFFOLD}`);
  });

  it('marks archived jobs', () => {
    const { ic, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    const csv = editRecords((r) => { r[2].archived_at = '2026-09-13T10:00:00Z'; });
    const result = syncAll(csv, all, { today: '2026-09-13' });
    const job = readJob(ic, INITECH);
    assert.equal(job.fm.teal_status, 'archived');
    assert.equal(job.fm.archived_at, '2026-09-13T10:00:00Z');
    assert.equal(job.fm.teal_last_seen, '2026-09-13');
    assert.deepEqual(vaultResult(result, ic).changes.map((c) => [c.type, c.from, c.to]), [['archived', 'bookmarked', 'archived']]);
  });

  it('marks jobs missing from the export without deleting them, then notices when they return', () => {
    const { ic, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    const withoutInitech = editRecords((r) => { r.splice(2, 1); });

    const result = syncAll(withoutInitech, all, { today: '2026-09-13' });
    const job = readJob(ic, INITECH);
    assert.equal(job.fm.teal_status, 'missing');
    assert.equal(job.fm.teal_last_seen, TODAY);
    assert.deepEqual(vaultResult(result, ic).changes.map((c) => [c.type, c.from, c.to]), [['missing', 'bookmarked', 'missing']]);

    assert.deepEqual(vaultResult(syncAll(withoutInitech, all, { today: '2026-09-14' }), ic).changes, []);

    const back = syncAll(fixtureText(), all, { today: '2026-09-15' });
    assert.deepEqual(vaultResult(back, ic).changes.map((c) => [c.type, c.from, c.to]), [['status', 'missing', 'bookmarked']]);
    assert.equal(readJob(ic, INITECH).fm.teal_last_seen, '2026-09-15');
  });

  it('aborts a vault without writing when more than half its known jobs go missing', () => {
    const { manager, ic, all } = makeVaults();
    syncAll(fixtureText(), all, { today: TODAY });
    const before = snapshot(ic.dir);
    const icIds = new Set([id(1), id(3), id(4), id(6)]);
    const csv = editRecords((r) => { for (let i = r.length - 1; i >= 0; i--) if (icIds.has(r[i].id)) r.splice(i, 1); });

    const result = syncAll(csv, all, { today: '2026-09-13' });
    const icResult = vaultResult(result, ic);
    assert.equal(icResult.aborted, true);
    assert.match(icResult.abortReason ?? '', /4 of 7/);
    assert.deepEqual(icResult.changes, []);
    assert.deepEqual(snapshot(ic.dir), before);
    assert.equal(vaultResult(result, manager).aborted, false);

    const forced = syncAll(csv, all, { today: '2026-09-13', force: true });
    assert.equal(vaultResult(forced, ic).aborted, false);
    assert.equal(vaultResult(forced, ic).changes.filter((c) => c.type === 'missing').length, 4);
  });
});

describe('routing edge cases', () => {
  const CYBERDYNE = 'Cyberdyne – Lead Engineer, Frontend Team';
  const withCyberdyne = () =>
    editRecords((r) => { r.push(row({ id: id(11), company_name: 'Cyberdyne', role: 'Lead Engineer, Frontend Team' })); });

  it('passes unknown statuses through with a warning', () => {
    const { manager, all } = makeVaults();
    const result = syncAll(editRecords((r) => { r[1].statusName = 'offer'; }), all, { today: TODAY });
    assert.equal(readJob(manager, GLOBEX).fm.teal_status, 'offer');
    assert.ok(result.warnings.some((w) => /offer/.test(w) && /Globex/.test(w)), result.warnings.join('\n'));
  });

  it('knows negotiating and accepted (no warning)', () => {
    const { manager, all } = makeVaults();
    const result = syncAll(editRecords((r) => { r[1].statusName = 'negotiating'; r[2].statusName = 'accepted'; }), all, { today: TODAY });
    assert.equal(readJob(manager, GLOBEX).fm.teal_status, 'negotiating');
    assert.deepEqual(result.warnings.filter((w) => /Unknown Teal status/.test(w)), []);
  });

  it('puts ambiguous titles in both inboxes with route pending', () => {
    const { manager, ic, all } = makeVaults();
    const result = syncAll(withCyberdyne(), all, { today: TODAY });
    assert.equal(result.counts.pending, 1);
    for (const vault of [manager, ic]) {
      assert.equal(readJob(vault, CYBERDYNE, true).fm.route, 'pending');
      const change = vaultResult(result, vault).changes.find((c) => c.company === 'Cyberdyne');
      assert.deepEqual([change?.type, change?.route, change?.path], ['new', 'pending', `Jobs/_Inbox/${CYBERDYNE}/${CYBERDYNE}.md`]);
    }
  });

  it('moves an overridden inbox job into Jobs/ and removes the other inbox copy', () => {
    const { manager, ic, all } = makeVaults();
    syncAll(withCyberdyne(), all, { today: TODAY });
    ic.config.overrides[id(11)] = 'ic';

    const result = syncAll(withCyberdyne(), all, { today: TODAY });
    assert.ok(!existsSync(jobPath(ic, CYBERDYNE, true)));
    assert.equal(readJob(ic, CYBERDYNE).fm.route, 'ic');
    assert.ok(!existsSync(join(manager.dir, 'Jobs/_Inbox', CYBERDYNE)));
    assert.deepEqual(vaultResult(result, ic).changes.map((c) => c.type), ['moved']);
    assert.deepEqual(vaultResult(result, manager).changes.map((c) => c.type), ['removed']);
  });

  it('keeps an inbox copy that holds more than the main note, with a warning', () => {
    const { manager, ic, all } = makeVaults();
    syncAll(withCyberdyne(), all, { today: TODAY });
    writeFileSync(join(manager.dir, 'Jobs/_Inbox', CYBERDYNE, 'Cyberdyne · Research.md'), 'notes\n');
    manager.config.overrides[id(11)] = 'ic';

    const result = syncAll(withCyberdyne(), all, { today: TODAY });
    assert.ok(existsSync(jobPath(manager, CYBERDYNE, true)));
    assert.ok(vaultResult(result, manager).warnings.some((w) => w.includes('Cyberdyne')));
    assert.ok(existsSync(jobPath(ic, CYBERDYNE)));
  });

  it('keeps a job pending when vault overrides disagree', () => {
    const { manager, ic, all } = makeVaults();
    manager.config.overrides[id(11)] = 'manager';
    ic.config.overrides[id(11)] = 'ic';
    const result = syncAll(withCyberdyne(), all, { today: TODAY });
    assert.equal(result.counts.pending, 1);
    assert.ok(result.warnings.some((w) => w.includes(id(11))));
    assert.ok(existsSync(jobPath(ic, CYBERDYNE, true)));
  });

  it('suffixes a colliding name with the teal id prefix, fixed at creation', () => {
    const { ic, all } = makeVaults();
    const two = csvOf([
      row({ id: 'abcd0000-0000-4000-8000-000000000012', company_name: 'Acme' }),
      row({ id: 'beef0000-0000-4000-8000-000000000013', company_name: 'Acme' }),
    ]);
    syncAll(two, all, { today: TODAY });
    assert.equal(readJob(ic, 'Acme – Staff Frontend Engineer').fm.teal_id, 'abcd0000-0000-4000-8000-000000000012');
    assert.equal(readJob(ic, 'Acme – Staff Frontend Engineer (beef)').fm.teal_id, 'beef0000-0000-4000-8000-000000000013');
    assert.deepEqual(vaultResult(syncAll(two, all, { today: TODAY }), ic).changes, []);
  });

  it('links a coach-created job note with no teal_id by company and role', () => {
    const { ic, all } = makeVaults();
    writeJob(ic, UMBRELLA, '---\ntype: job\nteal_id:\ncompany_name: Umbrella\nrole: Senior Software Engineer – Marketing\n---\nCoach research\n');

    const result = syncAll(fixtureText(), all, { today: TODAY });
    const job = readJob(ic, UMBRELLA);
    assert.equal(job.fm.teal_id, id(6));
    assert.equal(job.body, `Coach research\n\n${SCAFFOLD}`);
    assert.ok(!existsSync(jobPath(ic, `${UMBRELLA} (0000)`)));
    const change = vaultResult(result, ic).changes.find((c) => c.company === 'Umbrella');
    assert.equal(change?.type, 'linked');
  });
});
