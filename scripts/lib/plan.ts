import type { CheckIn, JobSummary, ThingsPlan, ThingsRef, VaultConfig } from './types.ts';

const GONE = new Set(['archived', 'missing']);
const CHECK_IN_DAYS = 7;

/** `things_id` value recording that the user declined a check-in to-do. */
export const DECLINED_THINGS_ID = 'none';

/** Check-in to-dos to create, complete, or offer to complete. Titles and notes follow the neutral wording rules. */
export function thingsPlan(jobs: JobSummary[], config: VaultConfig, today: string): ThingsPlan {
  const plan: ThingsPlan = { create: [], complete: [], offerComplete: [] };
  for (const job of jobs) {
    if (job.thingsId === null) {
      if (job.tealStatus === 'applied' && job.route !== 'pending') plan.create.push(checkIn(job, config, today));
      continue;
    }
    if (job.thingsId === DECLINED_THINGS_ID || job.tealStatus === 'applied') continue;

    const ref: ThingsRef = {
      tealId: job.tealId,
      company: job.company,
      notePath: job.notePath,
      thingsId: job.thingsId,
      tealStatus: job.tealStatus,
    };
    (GONE.has(job.tealStatus) ? plan.offerComplete : plan.complete).push(ref);
  }
  return plan;
}

function checkIn(job: JobSummary, config: VaultConfig, today: string): CheckIn {
  return {
    tealId: job.tealId,
    company: job.company,
    notePath: job.notePath,
    title: `Check in: ${job.company}`,
    notes: obsidianUrl(config.vaultName, job.notePath),
    due: checkInDue(job, today),
    area: config.things.area,
    project: config.things.project,
  };
}

/** `follow_up_at`, else `applied_at` + 7 days, else today + 7 days (local dates). */
export function checkInDue(job: JobSummary, today: string): string {
  const followUp = job.followUpAt ? localDate(job.followUpAt) : null;
  if (followUp) return followUp;
  const applied = job.appliedAt ? localDate(job.appliedAt) : null;
  return addDays(applied ?? today, CHECK_IN_DAYS);
}

export function obsidianUrl(vaultName: string, notePath: string): string {
  const encode = (value: string) =>
    encodeURIComponent(value).replace(/[()!'*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `obsidian://open?vault=${encode(vaultName)}&file=${encode(notePath.replace(/\.md$/, ''))}`;
}

export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** An ISO timestamp as a local YYYY-MM-DD, or null when it doesn't parse. */
export function localDate(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formatLocalDate(date);
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return formatLocalDate(new Date(year, month - 1, day + days));
}
