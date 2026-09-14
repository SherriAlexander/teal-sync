export type VaultRoute = 'manager' | 'ic';
export type Route = VaultRoute | 'pending';

/** One job from a Teal "Download Data" CSV, normalized. Empty cells are null. */
export interface TealRow {
  id: string;
  companyName: string;
  role: string;
  location: string | null;
  url: string | null;
  excitement: number | null;
  source: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  addedAt: string | null;
  appliedAt: string | null;
  followUpAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  statusName: string;
}

export interface RoutingRules {
  managerRegex: string;
  ambiguousRegex: string;
  peopleRegex: string;
}

/** Contents of `<vault>/.teal-sync.json`. */
export interface VaultConfig extends RoutingRules {
  vaultName: string;
  route: VaultRoute;
  jobsFolder: string;
  inboxFolder: string;
  coachingState: string;
  exportsDir: string;
  overrides: Record<string, VaultRoute>;
  aliases: Record<string, string>;
  things: { area: string; project: string };
  lastSync: string | null;
  /** Teal changes waiting for this root's coach `feedback` command; cleared after it runs. */
  pendingFeedback: FeedbackItem[];
}

export interface Vault {
  /** Absolute path to the vault folder (the directory holding `.teal-sync.json`). */
  dir: string;
  config: VaultConfig;
}

export interface SyncOptions {
  /** YYYY-MM-DD, written to `teal_last_seen`. */
  today: string;
  /** Skip the >50% missing guard. */
  force?: boolean;
  /** Compute changes without writing anything. */
  dryRun?: boolean;
}

export type ChangeType =
  | 'new'
  | 'linked'
  | 'status'
  | 'retitle'
  | 'archived'
  | 'missing'
  | 'moved'
  | 'removed';

export interface Change {
  type: ChangeType;
  tealId: string;
  company: string;
  role: string;
  /** Vault-relative path of the main note (for `removed`, the path that was removed). */
  path: string;
  route: Route;
  from?: string;
  to?: string;
}

export interface JobSummary {
  tealId: string;
  company: string;
  role: string;
  route: Route;
  tealStatus: string;
  loopStatus: string | null;
  notePath: string;
  url: string | null;
  appliedAt: string | null;
  followUpAt: string | null;
  thingsId: string | null;
}

export interface VaultResult {
  vaultName: string;
  vaultDir: string;
  route: VaultRoute;
  aborted: boolean;
  abortReason: string | null;
  changes: Change[];
  jobs: JobSummary[];
  warnings: string[];
  /** This vault's feedback queue after this sync (earlier unsent items included). */
  feedback: FeedbackItem[];
  things: ThingsPlan;
  /** Digest lines for this vault (full view, shown in its own root). */
  digest: string[];
  /** One-line summary (shown from the other root). */
  summary: string;
}

export interface SyncResult {
  exportRows: number;
  counts: Record<Route, number>;
  warnings: string[];
  vaults: VaultResult[];
  /** `Teal sync: N jobs (…); X new, Y status changes` */
  header: string;
  exports: ExportFiling[];
}

/** One `### <Company>` entry from coaching_state.md Interview Loops (or Past Interview Loops). */
export interface Loop {
  heading: string;
  /** Heading text before a role qualifier (` — Role`, ` (Role)`, `: Role`). */
  company: string;
  qualifier: string | null;
  status: string | null;
  rounds: string | null;
  nextRound: string | null;
  stories: string | null;
  past: boolean;
}

/** A Teal change to tell the coach about through its `feedback` command. */
export interface FeedbackItem {
  tealId: string;
  company: string;
  role: string;
  url: string | null;
  /** Teal status before the change; null for a job new to this vault. */
  from: string | null;
  to: string;
  /** YYYY-MM-DD of the sync that first saw the change. */
  seenOn: string;
}

/** A Things3 check-in to-do to offer. Wording is already neutral. */
export interface CheckIn {
  tealId: string;
  company: string;
  notePath: string;
  title: string;
  notes: string;
  /** YYYY-MM-DD, local time. */
  due: string;
  area: string;
  project: string;
}

export interface ThingsRef {
  tealId: string;
  company: string;
  notePath: string;
  thingsId: string;
  tealStatus: string;
}

export interface ThingsPlan {
  /** `applied` jobs with no `things_id`: offer to create. */
  create: CheckIn[];
  /** Jobs past `applied` with a to-do: complete it if still open. */
  complete: ThingsRef[];
  /** Archived/missing jobs with a to-do: offer to complete it. */
  offerComplete: ThingsRef[];
}

export interface ExportFiling {
  dir: string;
  filed: string | null;
  pruned: string[];
}
