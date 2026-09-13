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
  pendingProposals: unknown[];
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
}

export interface SyncResult {
  exportRows: number;
  counts: Record<Route, number>;
  warnings: string[];
  vaults: VaultResult[];
}
