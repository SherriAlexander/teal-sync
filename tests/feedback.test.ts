import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackItems, feedbackMessage, feedbackSentence, mergeFeedback } from '../scripts/lib/feedback.ts';
import type { Change, FeedbackItem, JobSummary } from '../scripts/lib/types.ts';
import { TODAY } from './helpers.ts';

const job = (over: Partial<JobSummary> = {}): JobSummary => ({
  tealId: 't1',
  company: 'Acme',
  role: 'Staff Frontend Engineer',
  route: 'ic',
  tealStatus: 'bookmarked',
  loopStatus: null,
  notePath: 'Jobs/Acme – Staff Frontend Engineer/Acme – Staff Frontend Engineer.md',
  url: 'https://example.com/jobs/1',
  appliedAt: null,
  followUpAt: null,
  thingsId: null,
  ...over,
});

const change = (type: Change['type'], over: Partial<Change> = {}): Change => ({
  type, tealId: 't1', company: 'Acme', role: 'Staff Frontend Engineer', path: 'x.md', route: 'ic', ...over,
});

const item = (over: Partial<FeedbackItem> = {}): FeedbackItem => ({
  tealId: 't1', company: 'Acme', role: 'Staff Frontend Engineer', url: 'https://example.com/jobs/1',
  from: null, to: 'bookmarked', seenOn: TODAY, ...over,
});

describe('feedbackItems', () => {
  it('turns new jobs, status moves, archiving, and routed inbox jobs into items', () => {
    const jobs = [
      job(),
      job({ tealId: 't2', company: 'Initech', tealStatus: 'applied', url: null }),
      job({ tealId: 't3', company: 'Hooli', tealStatus: 'archived' }),
      job({ tealId: 't4', company: 'Wonka', tealStatus: 'interviewing' }),
    ];
    const items = feedbackItems([
      change('new', { to: 'bookmarked' }),
      change('status', { tealId: 't2', company: 'Initech', from: 'bookmarked', to: 'applied' }),
      change('archived', { tealId: 't3', company: 'Hooli', from: 'applied', to: 'archived' }),
      change('moved', { tealId: 't4', company: 'Wonka' }),
    ], jobs, TODAY);
    assert.deepEqual(items.map((i) => [i.tealId, i.from, i.to]), [
      ['t1', null, 'bookmarked'],
      ['t2', 'bookmarked', 'applied'],
      ['t3', 'applied', 'archived'],
      ['t4', null, 'interviewing'],
    ]);
    assert.deepEqual(items[0], item());
    assert.equal(items[1].url, null);
  });

  it('skips missing jobs, linked coach folders, retitles, jobs still waiting for a route, and new archived jobs', () => {
    const jobs = [
      job({ tealStatus: 'missing' }),
      job({ tealId: 't2' }),
      job({ tealId: 't3', route: 'pending' }),
      job({ tealId: 't4', tealStatus: 'archived' }),
    ];
    assert.deepEqual(feedbackItems([
      change('missing', { from: 'applied', to: 'missing' }),
      change('linked', { tealId: 't2', to: 'bookmarked' }),
      change('retitle', { tealId: 't2', from: 'A', to: 'B' }),
      change('new', { tealId: 't3', route: 'pending', to: 'bookmarked' }),
      change('status', { tealId: 't3', route: 'pending', from: 'bookmarked', to: 'applied' }),
      change('new', { tealId: 't4', to: 'archived' }),
    ], jobs, TODAY), []);
  });

  it('treats an empty previous status as a new job', () => {
    const [only] = feedbackItems([change('status', { from: '', to: 'applied' })], [job({ tealStatus: 'applied' })], TODAY);
    assert.equal(only.from, null);
  });
});

describe('mergeFeedback', () => {
  it('appends new jobs and keeps the first from and seenOn for a job already queued', () => {
    const merged = mergeFeedback(
      [item({ from: 'bookmarked', to: 'applying', seenOn: '2026-09-10' })],
      [item({ to: 'applied', seenOn: TODAY }), item({ tealId: 't2', company: 'Initech' })],
    );
    assert.deepEqual(merged, [
      item({ from: 'bookmarked', to: 'applied', seenOn: '2026-09-10' }),
      item({ tealId: 't2', company: 'Initech' }),
    ]);
  });

  it('drops a job that moved back to where it started', () => {
    assert.deepEqual(mergeFeedback([item({ from: 'applied', to: 'interviewing' })], [item({ from: 'interviewing', to: 'applied' })]), []);
  });

  it('keeps a queued new job that was archived before feedback ran', () => {
    assert.deepEqual(mergeFeedback([item()], [item({ from: 'bookmarked', to: 'archived' })]), [item({ to: 'archived' })]);
  });

  it('does not change its inputs', () => {
    const pending = [item({ from: 'bookmarked', to: 'applying' })];
    mergeFeedback(pending, [item({ to: 'applied' })]);
    assert.equal(pending[0].to, 'applying');
  });
});

describe('feedbackSentence', () => {
  const cases: [from: string | null, to: string, expected: string][] = [
    [null, 'bookmarked', "I'm interested in a new job description: Acme – Staff Frontend Engineer (https://example.com/jobs/1)"],
    [null, 'applying', "I've started applying to Acme – Staff Frontend Engineer"],
    ['bookmarked', 'applied', "I've just applied to Acme – Staff Frontend Engineer"],
    ['applied', 'interviewing', "I've started interviewing for Acme – Staff Frontend Engineer"],
    ['interviewing', 'negotiating', "I'm negotiating an offer for Acme – Staff Frontend Engineer"],
    ['negotiating', 'accepted', "I've accepted the offer for Acme – Staff Frontend Engineer"],
    ['interviewing', 'archived', "I'm no longer pursuing Acme – Staff Frontend Engineer (archived in Teal)"],
    ['interviewing', 'applied', 'I moved Acme – Staff Frontend Engineer back from interviewing to applied in Teal'],
    ['applied', 'bookmarked', 'I moved Acme – Staff Frontend Engineer back from applied to bookmarked in Teal'],
    ['archived', 'applied', "I'm pursuing Acme – Staff Frontend Engineer again (applied in Teal)"],
    ['missing', 'bookmarked', "I'm pursuing Acme – Staff Frontend Engineer again (bookmarked in Teal)"],
    ['applied', 'on hold', 'Acme – Staff Frontend Engineer is now "on hold" in Teal'],
  ];
  for (const [from, to, expected] of cases) {
    it(`${from ?? '(new)'} → ${to}`, () => assert.equal(feedbackSentence(item({ from, to })), expected));
  }

  it('leaves out a missing URL', () => {
    assert.equal(feedbackSentence(item({ url: null })), "I'm interested in a new job description: Acme – Staff Frontend Engineer");
  });
});

describe('feedbackMessage', () => {
  it('is null with nothing queued', () => {
    assert.equal(feedbackMessage([]), null);
  });

  it('is the bare sentence for one item', () => {
    assert.equal(feedbackMessage([item({ from: 'bookmarked', to: 'applied' })]), "I've just applied to Acme – Staff Frontend Engineer");
  });

  it('groups new bookmarks and lists the rest', () => {
    const message = feedbackMessage([
      item(),
      item({ tealId: 't2', company: 'Initech', from: 'bookmarked', to: 'applied' }),
      item({ tealId: 't3', company: 'Hooli', role: 'Engineering Manager', url: null }),
    ]);
    assert.equal(message, [
      'Updates from Teal:',
      "- I'm interested in a few new job descriptions:",
      '  - Acme – Staff Frontend Engineer (https://example.com/jobs/1)',
      '  - Hooli – Engineering Manager',
      "- I've just applied to Initech – Staff Frontend Engineer",
    ].join('\n'));
  });
});
