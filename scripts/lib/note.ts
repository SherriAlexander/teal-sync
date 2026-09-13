import YAML, { Document, YAMLMap, isMap, isNode } from 'yaml';

const FENCE = /^---[ \t]*(?:\r?\n|$)/;
const YAML_OUTPUT = { lineWidth: 0, nullStr: '', flowCollectionPadding: false } as const;
const SCAFFOLD_HEADINGS = ['Why this role', 'Application', 'Contacts'];
const SCAFFOLD = SCAFFOLD_HEADINGS.map((heading) => `## ${heading}\n`).join('\n');

export interface NoteParts {
  /** Raw YAML between the fences (ends with a newline), or null when the note has no frontmatter. */
  frontmatter: string | null;
  /** Everything after the closing fence, byte for byte. */
  body: string;
}

export function splitNote(text: string): NoteParts {
  const open = FENCE.exec(text);
  if (!open) return { frontmatter: null, body: text };

  let lineStart = open[0].length;
  while (lineStart <= text.length) {
    const close = FENCE.exec(text.slice(lineStart));
    if (close) {
      return {
        frontmatter: text.slice(open[0].length, lineStart),
        body: text.slice(lineStart + close[0].length),
      };
    }
    const newline = text.indexOf('\n', lineStart);
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  return { frontmatter: null, body: text };
}

export function joinNote(frontmatter: string | null, body: string): string {
  return frontmatter === null ? body : `---\n${frontmatter}---\n${body}`;
}

/**
 * Set `props` in existing frontmatter YAML, leaving other keys, order, and comments alone.
 * Keys in `createOnly` are only added when absent. Returns the original text when no value changed.
 */
export function applyProps(
  existing: string | null,
  props: Record<string, unknown>,
  createOnly: readonly string[],
): { yaml: string; changed: boolean } {
  const doc: Document = YAML.parseDocument(existing ?? '');
  if (doc.errors.length > 0) throw new Error(`Invalid frontmatter: ${doc.errors[0].message}`);
  if (doc.contents === null) doc.contents = new YAMLMap();
  if (!isMap(doc.contents)) throw new Error('Frontmatter is not a key/value map');

  let changed = false;
  for (const [key, value] of Object.entries(props)) {
    if (!doc.has(key)) {
      doc.set(key, value);
      changed = true;
      continue;
    }
    if (createOnly.includes(key) || doc.get(key) === value) continue;

    const current = doc.get(key, true);
    const replacement = doc.createNode(value);
    if (isNode(current)) {
      replacement.comment = current.comment;
      replacement.commentBefore = current.commentBefore;
    }
    doc.set(key, replacement);
    changed = true;
  }

  return changed ? { yaml: doc.toString(YAML_OUTPUT), changed } : { yaml: existing ?? '', changed };
}

/** Append the applied-stage sections unless any of them already exists. */
export function ensureScaffold(body: string): string {
  const hasHeading = SCAFFOLD_HEADINGS.some((heading) => new RegExp(`^## ${heading}\\s*$`, 'm').test(body));
  if (hasHeading) return body;
  if (body === '') return SCAFFOLD;
  const separator = body.endsWith('\n\n') ? '' : body.endsWith('\n') ? '\n' : '\n\n';
  return body + separator + SCAFFOLD;
}
