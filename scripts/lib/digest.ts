import { localDate } from './plan.ts';
import type { ChangeType, Flag, JobSummary, SyncResult, VaultResult } from './types.ts';

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
  const flags = new Map(vault.flags.map((flag) => [flag.tealId, flag]));
  const shownFlags = new Set<string>();
  const lines: string[] = [];
  const takeFlag = (tealId: string) => {
    const flag = flags.get(tealId);
    if (flag) shownFlags.add(tealId);
    return flag;
  };

  for (const change of vault.changes) {
    const job = jobs.get(change.tealId);
    switch (change.type) {
      case 'new':
      case 'linked':
      case 'status': {
        const flag = takeFlag(change.tealId);
        const head = change.type === 'status'
          ? `MOVE ${change.company} ${change.from} → ${change.to}`
          : `${change.type === 'new' ? 'NEW ' : 'LINK'} ${change.company} (${change.role}) → ${change.to}`;
        lines.push(flag
          ? withSuggest(`${head}, ${flagText(flag)}`, flag.suggest)
          : withSuggest(head, statusSuggestion(change.to ?? '', change.company, job)));
        break;
      }
      case 'archived':
      case 'missing': {
        const flag = takeFlag(change.tealId);
        const suggest = flag?.suggest ?? (job?.loopStatus ? `feedback ${change.company}` : null);
        lines.push(withSuggest(`GONE ${change.company} (last: ${change.from || 'unknown'}) → ${change.to} in Teal`, suggest));
        break;
      }
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

  for (const flag of vault.flags) {
    if (shownFlags.has(flag.tealId)) continue;
    lines.push(withSuggest(`FLAG ${flag.company} (${flag.role}): Teal ${flag.tealStatus}, ${flagText(flag)}`, flag.suggest));
  }
  for (const proposal of vault.proposals) {
    lines.push(`LOOP ${proposal.company}: ${proposal.from} → ${proposal.to}? (Teal: ${proposal.tealStatus})`);
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
    countText(vault.proposals.length, 'proposal', 'proposals'),
    countText(vault.flags.length, 'flag', 'flags'),
    countText(vault.jobs.filter((job) => job.route === 'pending').length, 'to route', 'to route'),
    countText(vault.things.create.length, 'check-in due', 'check-ins due'),
  ].filter(Boolean);
  return `${vault.vaultName}: ${parts.length > 0 ? parts.join(', ') : 'no changes'}`;
}

function statusSuggestion(status: string, company: string, job: JobSummary | undefined): string | null {
  const hasLoop = Boolean(job?.loopStatus);
  switch (status) {
    case 'bookmarked':
      return hasLoop ? null : `research ${company}`;
    case 'applying':
      return `outreach ${company}, resume, apply`;
    case 'interviewing':
      return hasLoop ? null : `prep ${company}`;
    default:
      return null;
  }
}

function flagText(flag: Flag): string {
  switch (flag.type) {
    case 'no-loop':
      return 'no loop';
    case 'teal-behind':
      return `loop says ${flag.loopStatus}; update Teal?`;
    case 'loop-mismatch':
      return `loop says ${flag.loopStatus}`;
    case 'closed-in-teal':
      return `loop still ${flag.loopStatus}`;
    case 'unmapped-status':
      return `unknown Teal status, loop ${flag.loopStatus}`;
    case 'loop-ambiguous':
      return 'several loops match; name the role in the loop heading';
  }
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
