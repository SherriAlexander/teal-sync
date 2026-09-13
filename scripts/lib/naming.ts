const MAX_NAME_LENGTH = 80;

/** Make text safe for an Obsidian file name and wikilink: `/` → `-`, drop link-breaking characters. */
export function sanitizeSegment(value: string): string {
  return value
    .replaceAll('/', '-')
    .replace(/[|#^[\]:\\*"<>?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `<Company> – <Role>`, sanitized and trimmed to 80 characters. */
export function jobFolderName(company: string, role: string): string {
  const name = sanitizeSegment(`${company} – ${role}`);
  if (name.length <= MAX_NAME_LENGTH) return name;
  return name.slice(0, MAX_NAME_LENGTH).replace(/[\s–-]+$/, '');
}

/** Return `base`, or `base (<teal id prefix>)` when the name is taken (case-insensitive, like macOS). */
export function uniqueJobName(base: string, tealId: string, taken: Set<string>): string {
  const lowerTaken = new Set([...taken].map((name) => name.toLowerCase()));
  const idChars = tealId.replace(/[^a-z0-9]/gi, '');
  const candidates = [base, `${base} (${idChars.slice(0, 4)})`, `${base} (${idChars.slice(0, 8)})`, `${base} (${idChars})`];
  const free = candidates.find((candidate) => !lowerTaken.has(candidate.toLowerCase()));
  if (!free) throw new Error(`No free job folder name for "${base}" (${tealId})`);
  return free;
}

/** Lowercase letters and digits only, for matching company and role names loosely. */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function companyLink(company: string, aliases: Record<string, string>): string {
  const target = Object.hasOwn(aliases, company) ? aliases[company] : `Companies/${sanitizeSegment(company)}`;
  return `[[${target}]]`;
}
