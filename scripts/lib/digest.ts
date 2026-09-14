import { feedbackSentence } from './feedback.ts';
import { localDate } from './plan.ts';
import type { ChangeType, SyncResult, VaultResult } from './types.ts';

const SUGGEST = '   suggest: ';

/** `Teal sync: 10 jobs (3 manager, 7 IC); 2 new, 1 status change` */
export function syncHeader(result: SyncResult): string {
  const unique = (types: ChangeType[]) =>
    new Set(result.vaults.flatMap((vault) => vault.changes.filter((c) => types.includes(c.type)).map((c) => c.tealId))).size;
  const { manager, ic, pending } = result.counts;
  const routed = `${manager} manager, ${ic} IC${pending > 0 ? `, ${pending} pending` : ''}`;
  const moves = unique(['status', 'archived', 'missing']);
  return `Teal sync: ${plural(result.exportRows, 'job', 'jobs')} (${routed}); ${unique(['new'])} new, ${plural(moves, 'status change', 'status changes')}`;
}

/** Full digest for the vault's own root. */
export function vaultDigest(vault: VaultResult): string[] {
  if (vault.aborted) return [`ABORT ${vault.vaultName}: ${vault.abortReason}`];

  const jobs = new Map(vault.jobs.map((job) => [job.tealId, job]));
  const lines: string[] = [];

  for (const change of vault.changes) {
    switch (change.type) {
      case 'new':
      case 'linked':
        lines.push(`${change.type === 'new' ? 'NEW ' : 'LINK'} ${change.company} (${change.role}) → ${change.to}`);
        break;
      case 'status':
        lines.push(`MOVE ${change.company} ${change.from} → ${change.to}`);
        break;
      case 'archived':
      case 'missing':
        lines.push(`GONE ${change.company} (last: ${change.from || 'unknown'}) → ${change.to} in Teal`);
        break;
      case 'moved':
        lines.push(`ROUTE ${change.company} (${change.role}) → ${vault.vaultName}`);
        break;
      case 'removed':
        lines.push(`ROUTE ${change.company} (${change.role}) → other vault; Inbox copy removed`);
        break;
      case 'retitle':
        lines.push(`RENAME ${change.company}: ${change.from} → ${change.to}`);
        break;
    }
  }

  for (const item of vault.feedback) {
    lines.push(`FEED ${feedbackSentence(item)}`);
  }
  for (const job of vault.jobs) {
    if (job.route === 'pending') lines.push(`ASK  ${job.company} (${job.role}) → which vault: manager or IC?`);
  }
  for (const todo of vault.things.create) {
    const applied = jobs.get(todo.tealId)?.appliedAt;
    const appliedText = applied ? ` (applied ${monthDay(applied)})` : '';
    lines.push(withSuggest(`DUE  ${todo.company}${appliedText}, check-in ${todo.due.slice(5)}`, 'create Things to-do?'));
  }
  for (const ref of vault.things.complete) {
    lines.push(`DONE ${ref.company}: check-in to-do gets completed (Teal: ${ref.tealStatus})`);
  }
  for (const ref of vault.things.offerComplete) {
    lines.push(withSuggest(`TODO ${ref.company}: check-in to-do still open (Teal: ${ref.tealStatus})`, 'complete it?'));
  }
  return lines;
}

/** One line for the other root: `ic-web-dev-search: 2 new, 1 moved`. */
export function vaultSummary(vault: VaultResult): string {
  if (vault.aborted) return `${vault.vaultName}: aborted, nothing written (${vault.abortReason})`;
  const count = (types: ChangeType[]) => vault.changes.filter((change) => types.includes(change.type)).length;
  const parts = [
    countText(count(['new', 'linked']), 'new', 'new'),
    countText(count(['status']), 'moved', 'moved'),
    countText(count(['archived', 'missing']), 'gone', 'gone'),
    countText(count(['moved', 'removed']), 'rerouted', 'rerouted'),
    countText(vault.feedback.length, 'for feedback', 'for feedback'),
    countText(vault.jobs.filter((job) => job.route === 'pending').length, 'to route', 'to route'),
    countText(vault.things.create.length, 'check-in due', 'check-ins due'),
  ].filter(Boolean);
  return `${vault.vaultName}: ${parts.length > 0 ? parts.join(', ') : 'no changes'}`;
}

function withSuggest(text: string, suggest: string | null): string {
  return suggest ? `${text}${SUGGEST}${suggest}` : text;
}

function monthDay(iso: string): string {
  return localDate(iso)?.slice(5) ?? iso;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function countText(count: number, one: string, many: string): string | null {
  return count > 0 ? plural(count, one, many) : null;
}

/** Plain-text view of a whole sync: header, then each vault's digest, warnings, and summary. */
export function renderText(result: SyncResult): string {
  const lines = [result.header, ...result.warnings.map((warning) => `WARN ${warning}`)];
  for (const vault of result.vaults) {
    lines.push(
      '',
      `== ${vault.vaultName} ==`,
      ...(vault.digest.length > 0 ? vault.digest : ['(no changes)']),
      ...vault.warnings.map((warning) => `WARN ${warning}`),
      `summary: ${vault.summary}`,
    );
  }
  if (result.exports.length > 0) {
    const pruned = result.exports.reduce((sum, filing) => sum + filing.pruned.length, 0);
    lines.push('', `Export filed in ${result.exports.map((filing) => filing.dir).join(', ')}${pruned > 0 ? ` (pruned ${pruned} old)` : ''}`);
  }
  return lines.join('\n');
}
