import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyProps, ensureScaffold, joinNote, splitNote } from '../scripts/lib/note.ts';
import { SCAFFOLD } from './helpers.ts';

describe('splitNote / joinNote', () => {
  it('separates frontmatter from the body without altering body bytes', () => {
    const text = '---\ntype: job\n---\n\nHello\n---\nnot frontmatter\n';
    const { frontmatter, body } = splitNote(text);
    assert.equal(frontmatter, 'type: job\n');
    assert.equal(body, '\nHello\n---\nnot frontmatter\n');
    assert.equal(joinNote(frontmatter, body), text);
  });

  it('treats a note without a leading fence as body only', () => {
    assert.deepEqual(splitNote('Just text\n---\n'), { frontmatter: null, body: 'Just text\n---\n' });
  });

  it('handles empty frontmatter and empty body', () => {
    assert.deepEqual(splitNote('---\n---\n'), { frontmatter: '', body: '' });
  });
});

describe('applyProps', () => {
  it('creates frontmatter in prop order with bare nulls', () => {
    const { yaml, changed } = applyProps(null, { type: 'job', company: '[[Companies/X]]', archived_at: null }, []);
    assert.equal(changed, true);
    assert.equal(yaml, 'type: job\ncompany: "[[Companies/X]]"\narchived_at:\n');
  });

  it('keeps user keys, their order and formatting, and updates owned keys in place', () => {
    const existing = 'type: job\ntags:\n  - dream\nrole: Old # hand note\nmine: [a, b]\n';
    const { yaml, changed } = applyProps(existing, { type: 'job', role: 'New' }, []);
    assert.equal(changed, true);
    assert.equal(yaml, 'type: job\ntags:\n  - dream\nrole: New # hand note\nmine: [a, b]\n');
  });

  it('does not overwrite create-only keys that already exist', () => {
    const existing = 'type: job\nloop_status: Researched\n';
    const { yaml } = applyProps(existing, { type: 'job', loop_status: null, things_id: null }, ['loop_status', 'things_id']);
    assert.equal(yaml, 'type: job\nloop_status: Researched\nthings_id:\n');
  });

  it('returns the original text untouched when nothing changed', () => {
    const existing = 'type: job\nmine: [ a,b ]\nsalary_max: 150000\n';
    const { yaml, changed } = applyProps(existing, { type: 'job', salary_max: 150000 }, []);
    assert.equal(changed, false);
    assert.equal(yaml, existing);
  });
});

describe('ensureScaffold', () => {
  it('fills an empty body with the scaffold', () => {
    assert.equal(ensureScaffold(''), SCAFFOLD);
  });

  it('appends after existing content, keeping it byte for byte', () => {
    assert.equal(ensureScaffold('My notes\n'), `My notes\n\n${SCAFFOLD}`);
    assert.equal(ensureScaffold('My notes'), `My notes\n\n${SCAFFOLD}`);
    assert.equal(ensureScaffold('My notes\n\n'), `My notes\n\n${SCAFFOLD}`);
  });

  it('leaves the body alone when any scaffold heading already exists', () => {
    const body = 'Intro\n\n## Contacts\n- Pat\n';
    assert.equal(ensureScaffold(body), body);
  });
});
