import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkInDue, obsidianUrl, thingsPlan } from '../scripts/lib/plan.ts';
import type { JobSummary } from '../scripts/lib/types.ts';
import { TODAY, makeConfig } from './helpers.ts';

process.env.TZ = 'America/New_York';

const NOTE = 'Jobs/Globex – Sr. Manager, Digital Experience/Globex – Sr. Manager, Digital Experience.md';

const job = (over: Partial<JobSummary> = {}): JobSummary => ({
  tealId: 't1',
  company: 'Globex',
  role: 'Sr. Manager, Digital Experience',
  route: 'manager',
  tealStatus: 'bookmarked',
  loopStatus: null,
  notePath: NOTE,
  url: null,
  appliedAt: null,
  followUpAt: null,
  thingsId: null,
  ...over,
});

describe('checkInDue', () => {
  it('uses follow_up_at as a local date', () => {
    assert.equal(checkInDue(job({ followUpAt: '2026-09-14T04:00:00Z', appliedAt: '2026-09-03T07:11:06Z' }), TODAY), '2026-09-14');
  });

  it('falls back to applied_at + 7 days, then today + 7', () => {
    assert.equal(checkInDue(job({ appliedAt: '2026-09-03T02:11:06Z' }), TODAY), '2026-09-09');
    assert.equal(checkInDue(job(), TODAY), '2026-09-19');
  });
});

describe('obsidianUrl', () => {
  it('encodes the vault and the note path without .md', () => {
    const url = obsidianUrl('manager-job-search', NOTE);
    assert.ok(url.startsWith('obsidian://open?vault=manager-job-search&file='));
    assert.equal(decodeURIComponent(url.split('&file=')[1]), NOTE.slice(0, -3));
    assert.ok(!/[ ,–]/.test(url));
  });
});

describe('thingsPlan', () => {
  const config = makeConfig('manager');

  it('offers a neutral check-in for applied jobs without a to-do', () => {
    const plan = thingsPlan([job({ tealStatus: 'applied', followUpAt: '2026-09-14T04:00:00Z' })], config, TODAY);
    assert.deepEqual(plan.create, [{
      tealId: 't1',
      company: 'Globex',
      notePath: NOTE,
      title: 'Check in: Globex',
      notes: obsidianUrl('manager-job-search', NOTE),
      due: '2026-09-14',
      area: 'Example',
      project: 'Example – M',
    }]);
    assert.deepEqual(plan.complete, []);
    assert.deepEqual(plan.offerComplete, []);
  });

  it('never creates twice, and "none" means the user declined', () => {
    const plan = thingsPlan([
      job({ tealStatus: 'applied', thingsId: 'ABC' }),
      job({ tealId: 't2', tealStatus: 'applied', thingsId: 'none' }),
    ], config, TODAY);
    assert.deepEqual(plan, { create: [], complete: [], offerComplete: [] });
  });

  it('completes to-dos past applied and offers to complete archived or missing ones', () => {
    const plan = thingsPlan([
      job({ tealStatus: 'interviewing', thingsId: 'A' }),
      job({ tealId: 't2', tealStatus: 'archived', thingsId: 'B' }),
      job({ tealId: 't3', tealStatus: 'missing', thingsId: 'C' }),
      job({ tealId: 't4', tealStatus: 'interviewing', thingsId: 'none' }),
    ], config, TODAY);
    assert.deepEqual(plan.complete.map((ref) => ref.thingsId), ['A']);
    assert.deepEqual(plan.offerComplete.map((ref) => ref.thingsId), ['B', 'C']);
  });
});
