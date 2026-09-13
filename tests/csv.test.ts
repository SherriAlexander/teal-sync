import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTealCsv } from '../scripts/lib/csv.ts';
import { csvOf, fixtureText, row } from './helpers.ts';

describe('parseTealCsv', () => {
  it('parses every fixture row, including quoted commas and the JSON status column', () => {
    const { rows, warnings } = parseTealCsv(fixtureText());
    assert.equal(rows.length, 10);
    assert.deepEqual(warnings, []);
    assert.equal(rows[0].id, '00000000-0000-4000-8000-000000000001');
    assert.equal(rows[0].role, 'Senior/Staff Software Engineer, Front End');
    assert.equal(rows[0].statusName, 'bookmarked');
  });

  it('maps empty cells to null and numeric cells to numbers', () => {
    const globex = parseTealCsv(fixtureText()).rows.find((r) => r.companyName === 'Globex');
    assert.ok(globex);
    assert.equal(globex.minSalary, null);
    assert.equal(globex.maxSalary, 150000);
    assert.equal(globex.salaryCurrency, null);
    assert.equal(globex.salaryPeriod, null);
    assert.equal(globex.excitement, 4);
    assert.equal(globex.location, 'Waltham, MA');
    assert.equal(globex.appliedAt, '2026-09-08T03:28:49Z');
    assert.equal(globex.followUpAt, '2026-09-14T04:00:00Z');
    assert.equal(globex.archivedAt, null);
    assert.equal(globex.statusName, 'interviewing');
  });

  it('keeps non-USD currencies', () => {
    const tyrell = parseTealCsv(fixtureText()).rows.find((r) => r.companyName === 'Tyrell');
    assert.equal(tyrell?.salaryCurrency, 'CAD');
    assert.equal(tyrell?.minSalary, 120000);
  });

  it('falls back to the status JSON name when statusName is empty', () => {
    const text = csvOf([row({ id: 'x1', statusName: '', status: '{"name":"applying","archived_at":""}' })]);
    assert.equal(parseTealCsv(text).rows[0].statusName, 'applying');
  });

  it('skips rows without an id and warns', () => {
    const text = csvOf([row({ id: '', company_name: 'NoId' }), row({ id: 'x2' })]);
    const { rows, warnings } = parseTealCsv(text);
    assert.deepEqual(rows.map((r) => r.id), ['x2']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /NoId/);
  });

  it('throws when a required column is missing', () => {
    assert.throws(() => parseTealCsv('company_name,role\nAcme,Engineer\n'), /missing column.*id/i);
  });
});
