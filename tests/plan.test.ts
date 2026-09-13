import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkInDue, loopAction, obsidianUrl, thingsPlan } from '../scripts/lib/plan.ts';
import type { JobSummary, Loop } from '../scripts/lib/types.ts';
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
  appliedAt: null,
  followUpAt: null,
  thingsId: null,
  ...over,
});

const loop = (status: string | null): Loop => ({
  heading: 'Globex', company: 'Globex', qualifier: null, status, rounds: null, nextRound: null, stories: null, past: false,
});

describe('loopAction', () => {
  const cases: [tealStatus: string, loopStatus: string | null, expected: string][] = [
    ['bookmarked', null, 'none'],
    ['applied', null, 'none'],
    ['archived', null, 'none'],
    ['interviewing', null, 'flag:no-loop'],
    ['bookmarked', 'Decoded', 'none'],
    ['bookmarked', 'Researched', 'none'],
    ['applying', 'Researched', 'proposal:Applied'],
    ['applied', 'Decoded', 'proposal:Applied'],
    ['applied', 'Applied', 'none'],
    ['interviewing', 'Applied', 'proposal:Interviewing'],
    ['bookmarked', 'Applied', 'proposal:Researched'],
    ['archived', 'Researched', 'flag:closed-in-teal'],
    ['missing', 'Applied', 'flag:closed-in-teal'],
    ['offer', 'Applied', 'flag:unmapped-status'],
    ['interviewing', 'Interviewing', 'none'],
    ['applied', 'Interviewing', 'flag:teal-behind'],
    ['archived', 'Interviewing', 'flag:loop-mismatch'],
    ['not selected', 'Interviewing', 'flag:loop-mismatch'],
    ['interviewing', 'Offer', 'none'],
    ['offer', 'Offer', 'none'],
    ['applying', 'Offer', 'flag:teal-behind'],
    ['missing', 'Offer', 'flag:loop-mismatch'],
    ['archived', 'Closed', 'none'],
    ['interviewing', 'Closed', 'none'],
    ['applied', null, 'none'],
  ];

  for (const [tealStatus, loopStatus, expected] of cases) {
    it(`Teal ${tealStatus} + loop ${loopStatus ?? '(none)'} → ${expected}`, () => {
      const hasLoop = loopStatus !== null;
      const { proposal, flag } = loopAction(job({ tealStatus }), hasLoop ? loop(loopStatus) : null, { today: TODAY, dismissed: [] });
      const actual = proposal ? `proposal:${proposal.to}` : flag ? `flag:${flag.type}` : 'none';
      assert.equal(actual, expected);
    });
  }

  it('ignores a loop with no readable Status', () => {
    assert.deepEqual(loopAction(job({ tealStatus: 'applied' }), loop(null), { today: TODAY, dismissed: [] }), { proposal: null, flag: null });
  });

  it('fills in the proposal', () => {
    const { proposal } = loopAction(job({ tealStatus: 'applied' }), loop('Researched'), { today: TODAY, dismissed: [] });
    assert.deepEqual(proposal, {
      tealId: 't1',
      company: 'Globex',
      role: 'Sr. Manager, Digital Experience',
      notePath: NOTE,
      loop: 'Globex',
      from: 'Researched',
      to: 'Applied',
      tealStatus: 'applied',
      proposedOn: TODAY,
    });
  });

  it('skips a dismissed proposal', () => {
    const action = loopAction(job({ tealStatus: 'applied' }), loop('Researched'), { today: TODAY, dismissed: ['t1:Applied'] });
    assert.deepEqual(action, { proposal: null, flag: null });
  });

  it('suggests coach commands on flags', () => {
    const opts = { today: TODAY, dismissed: [] };
    assert.equal(loopAction(job({ tealStatus: 'interviewing' }), null, opts).flag?.suggest, 'prep Globex');
    assert.equal(loopAction(job({ tealStatus: 'archived' }), loop('Interviewing'), opts).flag?.suggest, 'feedback Globex');
    assert.equal(loopAction(job({ tealStatus: 'missing' }), loop('Researched'), opts).flag?.suggest, 'feedback Globex');
    assert.equal(loopAction(job({ tealStatus: 'applied' }), loop('Interviewing'), opts).flag?.suggest, null);
  });

  it('flags several matching loops', () => {
    const { flag } = loopAction(job(), null, { today: TODAY, dismissed: [], ambiguous: true });
    assert.equal(flag?.type, 'loop-ambiguous');
  });
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
