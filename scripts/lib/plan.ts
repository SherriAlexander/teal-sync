import type {
  CheckIn, Flag, FlagType, JobSummary, Loop, Proposal, ThingsPlan, ThingsRef, VaultConfig,
} from './types.ts';

const STAGES = ['Decoded', 'Researched', 'Applied', 'Interviewing', 'Offer', 'Closed'] as const;
type Stage = (typeof STAGES)[number];

/** The loop Status a Teal status implies while Teal still owns the job (before interviews). */
const TEAL_TO_STAGE: Record<string, Stage> = {
  bookmarked: 'Researched',
  applying: 'Applied',
  applied: 'Applied',
  interviewing: 'Interviewing',
};
const PRE_INTERVIEW = new Set(['bookmarked', 'applying', 'applied']);
const GONE = new Set(['archived', 'missing']);
const CHECK_IN_DAYS = 7;

/** `things_id` value recording that the user declined a check-in to-do. */
export const DECLINED_THINGS_ID = 'none';

export function loopStage(status: string | null): Stage | null {
  const word = status?.trim().split(/[^A-Za-z]/)[0].toLowerCase();
  if (!word) return null;
  if (word === 'rejected' || word === 'withdrawn') return 'Closed';
  return STAGES.find((stage) => stage.toLowerCase() === word) ?? null;
}

export interface LoopActionOptions {
  today: string;
  /** `<teal id>:<target Status>` keys the user declined. */
  dismissed: readonly string[];
  /** Several loops match the company and the role doesn't pick one. */
  ambiguous?: boolean;
}

/** Compare a job's Teal status with its loop: a Status proposal (Teal owns), a flag (coach owns), or nothing. */
export function loopAction(
  job: JobSummary,
  loop: Loop | null,
  options: LoopActionOptions,
): { proposal: Proposal | null; flag: Flag | null } {
  const none = { proposal: null, flag: null };
  const flag = (type: FlagType, suggest: string | null = null) => ({
    proposal: null,
    flag: {
      type,
      tealId: job.tealId,
      company: job.company,
      role: job.role,
      notePath: job.notePath,
      tealStatus: job.tealStatus,
      loopStatus: loop?.status ?? null,
      suggest,
    },
  });
  const teal = job.tealStatus;
  const feedback = `feedback ${job.company}`;

  if (!loop) {
    if (options.ambiguous) return flag('loop-ambiguous');
    return teal === 'interviewing' ? flag('no-loop', `prep ${job.company}`) : none;
  }

  const stage = loopStage(loop.status);
  if (stage === null || stage === 'Closed') return none;
  if (stage === 'Interviewing' || stage === 'Offer') {
    if (PRE_INTERVIEW.has(teal)) return flag('teal-behind');
    if (teal === 'interviewing' || (stage === 'Offer' && !GONE.has(teal))) return none;
    return flag('loop-mismatch', feedback);
  }

  const target = Object.hasOwn(TEAL_TO_STAGE, teal) ? TEAL_TO_STAGE[teal] : null;
  if (target === null) return GONE.has(teal) ? flag('closed-in-teal', feedback) : flag('unmapped-status');
  if (target === stage || (target === 'Researched' && stage === 'Decoded')) return none;
  if (options.dismissed.includes(`${job.tealId}:${target}`)) return none;

  return {
    proposal: {
      tealId: job.tealId,
      company: job.company,
      role: job.role,
      notePath: job.notePath,
      loop: loop.heading,
      from: loop.status ?? '',
      to: target,
      tealStatus: teal,
      proposedOn: options.today,
    },
    flag: null,
  };
}

/** Check-in to-dos to create, complete, or offer to complete. Titles and notes follow the Homestuck wording rules. */
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
