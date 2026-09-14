import type { Change, FeedbackItem, JobSummary } from './types.ts';

/** Teal statuses in pipeline order; a move to an earlier one reads as a correction. */
const ORDER = ['bookmarked', 'applying', 'applied', 'interviewing', 'negotiating', 'accepted'];
const GONE = new Set(['archived', 'missing']);

/** Teal changes the coach should hear about: new jobs at any status, and every status change except `missing`. */
export function feedbackItems(changes: Change[], jobs: JobSummary[], today: string): FeedbackItem[] {
  const byId = new Map(jobs.map((job) => [job.tealId, job]));
  const items: FeedbackItem[] = [];
  for (const change of changes) {
    const job = byId.get(change.tealId);
    if (!job || job.route === 'pending') continue;

    let from: string | null;
    let to: string;
    switch (change.type) {
      case 'new':
      case 'moved':
        from = null;
        to = change.type === 'new' ? change.to ?? '' : job.tealStatus;
        if (GONE.has(to)) continue;
        break;
      case 'status':
      case 'archived':
        from = change.from || null;
        to = change.to ?? '';
        break;
      default:
        continue;
    }
    if (!to) continue;
    items.push({ tealId: job.tealId, company: job.company, role: job.role, url: job.url, from, to, seenOn: today });
  }
  return items;
}

/** Add this sync's items to the queue. A job already queued keeps its first `from` and `seenOn`. */
export function mergeFeedback(pending: readonly FeedbackItem[], items: readonly FeedbackItem[]): FeedbackItem[] {
  const queue = pending.map((item) => ({ ...item }));
  for (const item of items) {
    const index = queue.findIndex((queued) => queued.tealId === item.tealId);
    if (index === -1) {
      queue.push({ ...item });
      continue;
    }
    const merged = { ...item, from: queue[index].from, seenOn: queue[index].seenOn };
    if (merged.from === merged.to) queue.splice(index, 1);
    else queue[index] = merged;
  }
  return queue;
}

/** One first-person sentence for the coach's `feedback` command. */
export function feedbackSentence(item: FeedbackItem): string {
  const job = `${item.company} – ${item.role}`;
  const { from, to } = item;
  if (from === null && to === 'bookmarked') return `I'm interested in a new job description: ${withUrl(job, item.url)}`;
  if (from !== null && GONE.has(from) && !GONE.has(to)) return `I'm pursuing ${job} again (${to} in Teal)`;
  if (from !== null && ORDER.includes(from) && ORDER.indexOf(to) !== -1 && ORDER.indexOf(to) < ORDER.indexOf(from)) {
    return `I moved ${job} back from ${from} to ${to} in Teal`;
  }
  switch (to) {
    case 'bookmarked':
      return `I've bookmarked ${job} in Teal`;
    case 'applying':
      return `I've started applying to ${job}`;
    case 'applied':
      return `I've just applied to ${job}`;
    case 'interviewing':
      return `I've started interviewing for ${job}`;
    case 'negotiating':
      return `I'm negotiating an offer for ${job}`;
    case 'accepted':
      return `I've accepted the offer for ${job}`;
    case 'archived':
      return `I'm no longer pursuing ${job} (archived in Teal)`;
    default:
      return `${job} is now "${to}" in Teal`;
  }
}

/** The whole queue as one message for `feedback`, or null when nothing is queued. */
export function feedbackMessage(items: readonly FeedbackItem[]): string | null {
  if (items.length === 0) return null;
  if (items.length === 1) return feedbackSentence(items[0]);

  const bookmarks = items.filter((item) => item.from === null && item.to === 'bookmarked');
  const lines = ['Updates from Teal:'];
  if (bookmarks.length === 1) lines.push(`- ${feedbackSentence(bookmarks[0])}`);
  if (bookmarks.length > 1) {
    lines.push("- I'm interested in a few new job descriptions:");
    for (const item of bookmarks) lines.push(`  - ${withUrl(`${item.company} – ${item.role}`, item.url)}`);
  }
  for (const item of items) {
    if (!bookmarks.includes(item)) lines.push(`- ${feedbackSentence(item)}`);
  }
  return lines.join('\n');
}

function withUrl(text: string, url: string | null): string {
  return url ? `${text} (${url})` : text;
}
