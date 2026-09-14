import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import YAML from 'yaml';
import { parseTealCsv } from './csv.ts';
import { companyLink, jobFolderName, normalizeName, uniqueJobName } from './naming.ts';
import { applyProps, ensureScaffold, joinNote, splitNote } from './note.ts';
import { routeJob } from './route.ts';
import type {
  Change, JobSummary, Route, SyncOptions, SyncResult, TealRow, Vault, VaultResult, VaultRoute,
} from './types.ts';

const KNOWN_STATUSES = new Set(['bookmarked', 'applying', 'applied', 'interviewing', 'negotiating', 'accepted']);
const PRE_APPLICATION_STATUSES = new Set(['bookmarked', 'applying']);
/** Written empty at creation, then owned by the teal-sync skill (loop mirror, Things3). */
const SKILL_OWNED_KEYS = ['loop_status', 'things_id'];
const MISSING_GUARD_RATIO = 0.5;
const IGNORED_FILES = new Set(['.DS_Store']);

type Location = 'jobs' | 'inbox';

interface ExistingJob {
  name: string;
  location: Location;
  notePath: string;
  props: Record<string, unknown>;
  frontmatter: string | null;
  body: string;
  text: string;
  tealId: string | null;
  otherFiles: string[];
}

type Op =
  | { kind: 'write'; path: string; content: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'remove'; path: string };

/** Route every Teal row and sync each vault's job folders. */
export function syncAll(csvText: string, vaults: Vault[], options: SyncOptions): SyncResult {
  if (vaults.length === 0) throw new Error('No vaults configured');
  const { rows, warnings } = parseTealCsv(csvText);
  const rules = vaults[0].config;

  for (const vault of vaults.slice(1)) {
    const { managerRegex, ambiguousRegex, peopleRegex } = vault.config;
    if (managerRegex !== rules.managerRegex || ambiguousRegex !== rules.ambiguousRegex || peopleRegex !== rules.peopleRegex) {
      warnings.push(`${vault.config.vaultName} routing regexes differ from ${rules.vaultName}; using ${rules.vaultName}'s`);
    }
  }

  const { overrides, conflicts } = mergeOverrides(vaults);
  for (const id of conflicts) warnings.push(`Vaults disagree on the override for ${id}; treating it as pending`);

  const routes = new Map<string, Route>();
  const counts: Record<Route, number> = { manager: 0, ic: 0, pending: 0 };
  for (const row of rows) {
    const route = conflicts.has(row.id) ? 'pending' : routeJob(row, rules, overrides);
    routes.set(row.id, route);
    counts[route] += 1;
    if (!KNOWN_STATUSES.has(row.statusName)) {
      warnings.push(`Unknown Teal status "${row.statusName}" for ${row.companyName} (${row.role}); passed through`);
    }
  }

  return {
    exportRows: rows.length,
    counts,
    warnings,
    vaults: vaults.map((vault) => syncVault(vault, rows, routes, options)),
    header: '',
    exports: [],
  };
}

function mergeOverrides(vaults: Vault[]) {
  const overrides: Record<string, VaultRoute> = {};
  const conflicts = new Set<string>();
  for (const { config } of vaults) {
    for (const [id, route] of Object.entries(config.overrides)) {
      if (Object.hasOwn(overrides, id) && overrides[id] !== route) conflicts.add(id);
      overrides[id] = route;
    }
  }
  for (const id of conflicts) delete overrides[id];
  return { overrides, conflicts };
}

function syncVault(vault: Vault, rows: TealRow[], routes: Map<string, Route>, options: SyncOptions): VaultResult {
  const { config } = vault;
  const warnings: string[] = [];
  const result = (partial: Partial<VaultResult>): VaultResult => ({
    vaultName: config.vaultName,
    vaultDir: vault.dir,
    route: config.route,
    aborted: false,
    abortReason: null,
    changes: [],
    jobs: [],
    warnings,
    feedback: [],
    things: { create: [], complete: [], offerComplete: [] },
    digest: [],
    summary: '',
    ...partial,
  });

  const { jobs: existing, taken } = scanJobs(vault, warnings);
  const exportIds = new Set(rows.map((row) => row.id));

  const known = existing.filter((job) => job.tealId && job.props.teal_status !== 'missing');
  const goingMissing = known.filter((job) => !exportIds.has(job.tealId!));
  if (!options.force && known.length > 0 && goingMissing.length / known.length > MISSING_GUARD_RATIO) {
    return result({
      aborted: true,
      abortReason: `${goingMissing.length} of ${known.length} known jobs are missing from the export; nothing written. Re-run with --force if that is expected.`,
    });
  }

  const byId = new Map<string, ExistingJob>();
  for (const job of existing) {
    if (!job.tealId) continue;
    if (byId.has(job.tealId)) warnings.push(`Duplicate teal_id ${job.tealId} in ${job.notePath}; ignoring this copy`);
    else byId.set(job.tealId, job);
  }
  const unlinked = existing.filter((job) => !job.tealId);

  const ops: Op[] = [];
  const changes: Change[] = [];
  const summaries: JobSummary[] = [];
  const abs = (relative: string) => join(vault.dir, relative);

  for (const row of rows) {
    const route = routes.get(row.id)!;
    const belongsHere = route === config.route || route === 'pending';
    const tealStatus = row.archivedAt ? 'archived' : row.statusName;
    const base = { tealId: row.id, company: row.companyName, role: row.role };

    let job = byId.get(row.id);
    let linked = false;
    if (!job && belongsHere) {
      job = unlinked.find((candidate) => sameJob(candidate, row));
      if (job) {
        unlinked.splice(unlinked.indexOf(job), 1);
        linked = true;
      }
    }

    if (!job) {
      if (!belongsHere) continue;
      const name = uniqueJobName(jobFolderName(row.companyName, row.role), row.id, taken);
      taken.add(name);
      const folder = route === 'pending' ? config.inboxFolder : config.jobsFolder;
      const notePath = posix.join(folder, name, `${name}.md`);
      const props = jobProps(row, route, vault, options.today);
      const body = PRE_APPLICATION_STATUSES.has(row.statusName) ? '' : ensureScaffold('');
      ops.push({ kind: 'write', path: abs(notePath), content: joinNote(applyProps(null, props, []).yaml, body) });
      changes.push({ type: 'new', ...base, path: notePath, route, to: tealStatus });
      summaries.push(summarize(props, notePath));
      continue;
    }

    if (!belongsHere) {
      if (job.location === 'jobs') {
        warnings.push(`${job.notePath} routes to ${route}; add an override to keep it in ${config.vaultName}`);
      } else {
        if (job.otherFiles.length === 0) {
          ops.push({ kind: 'remove', path: abs(posix.dirname(job.notePath)) });
          changes.push({ type: 'removed', ...base, path: job.notePath, route });
        } else {
          warnings.push(`Kept ${job.notePath}: ${row.companyName} routes to ${route}, but its folder has other files (${job.otherFiles.join(', ')}). Move or delete it by hand.`);
        }
        continue;
      }
    }

    let notePath = job.notePath;
    let location = job.location;
    if (job.location === 'inbox' && route !== 'pending') {
      const fromFolder = posix.dirname(job.notePath);
      const name = uniqueJobName(job.name, row.id, withoutName(taken, job.name));
      const toFolder = posix.join(config.jobsFolder, name);
      notePath = posix.join(toFolder, `${name}.md`);
      location = 'jobs';
      ops.push({ kind: 'move', from: abs(fromFolder), to: abs(toFolder) });
      if (name !== job.name) {
        ops.push({ kind: 'move', from: abs(posix.join(toFolder, `${job.name}.md`)), to: abs(notePath) });
        taken.add(name);
      }
      changes.push({ type: 'moved', ...base, path: notePath, route, from: job.notePath, to: notePath });
    } else if (job.location === 'jobs' && route === 'pending') {
      warnings.push(`${job.notePath} now has an ambiguous title; left in ${config.jobsFolder}`);
    }

    const props = jobProps(row, location === 'inbox' ? 'pending' : config.route, vault, options.today);
    const { yaml } = applyProps(job.frontmatter, props, SKILL_OWNED_KEYS);
    const body = PRE_APPLICATION_STATUSES.has(row.statusName) ? job.body : ensureScaffold(job.body);
    const content = joinNote(yaml, body);
    if (content !== job.text || notePath !== job.notePath) ops.push({ kind: 'write', path: abs(notePath), content });

    const previousStatus = stringOrNull(job.props.teal_status);
    const previousRole = stringOrNull(job.props.role);
    if (linked) {
      changes.push({ type: 'linked', ...base, path: notePath, route, to: tealStatus });
    } else {
      if (previousStatus !== tealStatus) {
        const type = tealStatus === 'archived' ? 'archived' : 'status';
        changes.push({ type, ...base, path: notePath, route, from: previousStatus ?? '', to: tealStatus });
      }
      if (previousRole !== row.role) {
        changes.push({ type: 'retitle', ...base, path: notePath, route, from: previousRole ?? '', to: row.role });
      }
    }
    summaries.push(summarize(YAML.parse(yaml) as Record<string, unknown>, notePath));
  }

  for (const job of goingMissing) {
    const { yaml } = applyProps(job.frontmatter, { teal_status: 'missing' }, []);
    ops.push({ kind: 'write', path: abs(job.notePath), content: joinNote(yaml, job.body) });
    const props = { ...job.props, teal_status: 'missing' };
    changes.push({
      type: 'missing',
      tealId: job.tealId!,
      company: stringOrNull(job.props.company_name) ?? job.name,
      role: stringOrNull(job.props.role) ?? '',
      path: job.notePath,
      route: job.location === 'inbox' ? 'pending' : config.route,
      from: stringOrNull(job.props.teal_status) ?? '',
      to: 'missing',
    });
    summaries.push(summarize(props, job.notePath));
  }
  for (const job of existing) {
    if (job.tealId && job.props.teal_status === 'missing' && !exportIds.has(job.tealId)) {
      summaries.push(summarize(job.props, job.notePath));
    }
  }

  if (!options.dryRun) applyOps(ops);
  return result({ changes, jobs: summaries });
}

function scanJobs(vault: Vault, warnings: string[]) {
  const { config } = vault;
  const jobs: ExistingJob[] = [];
  const taken = new Set<string>();
  const inboxFolder = posix.normalize(config.inboxFolder);
  const folders: [Location, string][] = [['jobs', posix.normalize(config.jobsFolder)], ['inbox', inboxFolder]];

  for (const [location, folder] of folders) {
    const folderPath = join(vault.dir, folder);
    if (!existsSync(folderPath)) continue;

    for (const entry of readdirSync(folderPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (location === 'jobs' && posix.join(folder, entry.name) === inboxFolder) continue;
      taken.add(entry.name);

      const noteFile = `${entry.name}.md`;
      const notePath = posix.join(folder, entry.name, noteFile);
      const fullPath = join(vault.dir, notePath);
      if (!existsSync(fullPath)) continue;

      const text = readFileSync(fullPath, 'utf8');
      const { frontmatter, body } = splitNote(text);
      let props: Record<string, unknown>;
      try {
        props = (frontmatter ? YAML.parse(frontmatter) : null) ?? {};
      } catch (error) {
        warnings.push(`Skipped ${notePath}: invalid frontmatter (${(error as Error).message})`);
        continue;
      }
      if (props.type !== 'job') continue;

      const otherFiles = readdirSync(join(folderPath, entry.name)).filter(
        (file) => file !== noteFile && !IGNORED_FILES.has(file),
      );
      jobs.push({
        name: entry.name,
        location,
        notePath,
        props,
        frontmatter,
        body,
        text,
        tealId: stringOrNull(props.teal_id),
        otherFiles,
      });
    }
  }
  return { jobs, taken };
}

function jobProps(row: TealRow, route: Route, vault: Vault, today: string): Record<string, unknown> {
  return {
    type: 'job',
    teal_id: row.id,
    route,
    company: companyLink(row.companyName, vault.config.aliases),
    company_name: row.companyName,
    role: row.role,
    teal_status: row.archivedAt ? 'archived' : row.statusName,
    loop_status: null,
    excitement: row.excitement,
    location: row.location,
    salary_min: row.minSalary,
    salary_max: row.maxSalary,
    salary_currency: row.salaryCurrency,
    salary_period: row.salaryPeriod,
    url: row.url,
    source: row.source,
    added_at: row.addedAt,
    applied_at: row.appliedAt,
    follow_up_at: row.followUpAt,
    updated_at: row.updatedAt,
    archived_at: row.archivedAt,
    teal_last_seen: today,
    things_id: null,
  };
}

function summarize(props: Record<string, unknown>, notePath: string): JobSummary {
  return {
    tealId: stringOrNull(props.teal_id) ?? '',
    company: stringOrNull(props.company_name) ?? '',
    role: stringOrNull(props.role) ?? '',
    route: (stringOrNull(props.route) ?? 'pending') as Route,
    tealStatus: stringOrNull(props.teal_status) ?? '',
    loopStatus: stringOrNull(props.loop_status),
    notePath,
    url: stringOrNull(props.url),
    appliedAt: stringOrNull(props.applied_at),
    followUpAt: stringOrNull(props.follow_up_at),
    thingsId: stringOrNull(props.things_id),
  };
}

/** Match a coach-created note (no teal_id) to a Teal row by company + role. */
function sameJob(job: ExistingJob, row: TealRow): boolean {
  const [folderCompany = '', ...folderRole] = job.name.split(' – ');
  const company = stringOrNull(job.props.company_name) ?? folderCompany;
  const role = stringOrNull(job.props.role) ?? folderRole.join(' – ');
  return normalizeName(company) === normalizeName(row.companyName) && normalizeName(role) === normalizeName(row.role);
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function withoutName(names: Set<string>, name: string): Set<string> {
  const copy = new Set(names);
  copy.delete(name);
  return copy;
}

function applyOps(ops: Op[]): void {
  for (const op of ops) {
    if (op.kind === 'write') {
      mkdirSync(dirname(op.path), { recursive: true });
      writeFileSync(op.path, op.content);
    } else if (op.kind === 'move') {
      mkdirSync(dirname(op.to), { recursive: true });
      renameSync(op.from, op.to);
    } else {
      rmSync(op.path, { recursive: true });
    }
  }
}
