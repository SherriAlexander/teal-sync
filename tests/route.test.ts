import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeJob, routeTitle } from '../scripts/lib/route.ts';
import { RULES } from './helpers.ts';

describe('routeTitle', () => {
  const manager = [
    'Sr. Manager, Digital Experience',
    'Engineering Manager - Front-End (UI/UX)',
    'Engineering Manager, Frontend Platform & Mobile',
    'Director of Engineering',
    'Head of Frontend',
    'VP, Engineering',
  ];
  const ic = [
    'Senior/Staff Software Engineer, Front End',
    'Staff Frontend Engineer',
    'Sr/Staff Frontend Engineer | Web Products',
    'Senior Software Engineer – Marketing',
    'Staff Software Engineer (Frontend / UI)',
    'Principal Software Engineer, Front End Web UI Platform',
    'Senior Frontend Engineer - Design Systems',
    'Frontend Architect',
  ];
  const pending = [
    'Lead Engineer, Frontend Team',
    'Principal Engineer, People Platform',
    'Engineering Management Lead',
    'Frontend Architect & Technical Leadership',
  ];

  for (const title of manager) {
    it(`routes "${title}" to manager`, () => assert.equal(routeTitle(title, RULES), 'manager'));
  }
  for (const title of ic) {
    it(`routes "${title}" to ic`, () => assert.equal(routeTitle(title, RULES), 'ic'));
  }
  for (const title of pending) {
    it(`routes "${title}" to pending`, () => assert.equal(routeTitle(title, RULES), 'pending'));
  }

  it('lets the manager regex win over ambiguous wording', () => {
    assert.equal(routeTitle('Engineering Manager, Team Lead', RULES), 'manager');
  });

  it('is case-insensitive', () => {
    assert.equal(routeTitle('ENGINEERING MANAGER', RULES), 'manager');
  });
});

describe('routeJob', () => {
  it('uses an override before the title', () => {
    assert.equal(routeJob({ id: 'a', role: 'Engineering Manager' }, RULES, { a: 'ic' }), 'ic');
    assert.equal(routeJob({ id: 'b', role: 'Lead Engineer, Frontend Team' }, RULES, { b: 'manager' }), 'manager');
  });

  it('falls back to the title without an override', () => {
    assert.equal(routeJob({ id: 'c', role: 'Staff Frontend Engineer' }, RULES, { a: 'manager' }), 'ic');
  });
});
