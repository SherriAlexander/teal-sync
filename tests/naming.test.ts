import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { companyLink, jobFolderName, uniqueJobName } from '../scripts/lib/naming.ts';

describe('jobFolderName', () => {
  it('joins company and role with an en dash', () => {
    assert.equal(
      jobFolderName('Umbrella', 'Senior Software Engineer – Marketing'),
      'Umbrella – Senior Software Engineer – Marketing',
    );
  });

  it('replaces slashes and strips link-breaking characters', () => {
    assert.equal(
      jobFolderName('Hooli', 'Sr/Staff Frontend Engineer | Web Products'),
      'Hooli – Sr-Staff Frontend Engineer Web Products',
    );
    assert.equal(jobFolderName('Acme', 'Eng: [UI] #1 ^core'), 'Acme – Eng UI 1 core');
  });

  it('keeps dots in company names', () => {
    assert.equal(
      jobFolderName('stark.io', 'Engineering Manager - Front-End (UI/UX)'),
      'stark.io – Engineering Manager - Front-End (UI-UX)',
    );
  });

  it('trims to 80 characters without trailing whitespace or dashes', () => {
    const name = jobFolderName('Acme', `Senior Engineer ${'word '.repeat(30)}`);
    assert.ok(name.length <= 80, `length ${name.length}`);
    assert.doesNotMatch(name, /[\s–-]$/);
  });
});

describe('uniqueJobName', () => {
  it('returns the base name when free', () => {
    assert.equal(uniqueJobName('Acme – Engineer', 'beef1234-0000', new Set(['Other'])), 'Acme – Engineer');
  });

  it('appends the first 4 characters of the teal id on a collision (case-insensitive)', () => {
    assert.equal(
      uniqueJobName('Acme – Engineer', 'beef1234-0000', new Set(['acme – engineer'])),
      'Acme – Engineer (beef)',
    );
  });

  it('falls back to a longer id prefix when the short suffix is also taken', () => {
    const taken = new Set(['Acme – Engineer', 'Acme – Engineer (beef)']);
    assert.equal(uniqueJobName('Acme – Engineer', 'beef1234-0000', taken), 'Acme – Engineer (beef1234)');
  });
});

describe('companyLink', () => {
  it('links to Companies/<name> by default', () => {
    assert.equal(companyLink('Umbrella', {}), '[[Companies/Umbrella]]');
  });

  it('uses an alias when one exists', () => {
    assert.equal(companyLink('Globex', { Globex: 'Interviewing/Globex' }), '[[Interviewing/Globex]]');
  });

  it('sanitizes the company name', () => {
    assert.equal(companyLink('A/B | C', {}), '[[Companies/A-B C]]');
  });
});
