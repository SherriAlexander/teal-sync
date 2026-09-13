import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import YAML from 'yaml';
import type { RoutingRules, Vault, VaultConfig, VaultRoute } from '../scripts/lib/types.ts';

export const TODAY = '2026-09-12';
export const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/teal-export.csv', import.meta.url));
export const SCAFFOLD = '## Why this role\n\n## Application\n\n## Contacts\n';

export const COLUMNS = [
  'company_name', 'location', 'role', 'url', 'excitement', 'source', 'resume_uuid',
  'availability_status', 'min_salary', 'max_salary', 'salary_currency', 'salary_pay_period',
  'added_at', 'application_deadline', 'applied_at', 'checked_availability_at', 'created_at',
  'follow_up_at', 'posted_at', 'updated_at', 'archived_at', 'id', 'status', 'statusName',
];

export const RULES: RoutingRules = {
  managerRegex: '\\b(manager|director|head of|vp|vice president)\\b',
  ambiguousRegex: '\\b(lead|principal|architect)\\b',
  peopleRegex: 'people|leadership|team|manag',
};

export type CsvRecord = Record<string, string>;

export function fixtureText(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

export function fixtureRecords(): CsvRecord[] {
  return parse(fixtureText(), { columns: true });
}

/** Build a CSV record with sensible defaults; `status` JSON follows `statusName` unless given. */
export function row(over: CsvRecord): CsvRecord {
  const record: CsvRecord = {
    ...Object.fromEntries(COLUMNS.map((c) => [c, ''])),
    company_name: 'Acme',
    role: 'Staff Frontend Engineer',
    statusName: 'bookmarked',
    ...over,
  };
  if (!('status' in over)) {
    record.status = JSON.stringify({ name: record.statusName, archived_at: '', id: 'status-id' });
  }
  return record;
}

function cell(value = ''): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function csvOf(records: CsvRecord[]): string {
  const lines = records.map((r) => COLUMNS.map((c) => cell(r[c])).join(','));
  return [COLUMNS.join(','), ...lines].join('\n') + '\n';
}

export function makeConfig(route: VaultRoute, over: Partial<VaultConfig> = {}): VaultConfig {
  return {
    vaultName: route === 'manager' ? 'manager-job-search' : 'ic-web-dev-search',
    route,
    ...RULES,
    jobsFolder: 'Jobs',
    inboxFolder: 'Jobs/_Inbox',
    coachingState: '../coaching_state.md',
    exportsDir: '../.teal-exports',
    overrides: {},
    aliases: {},
    things: { area: 'Example', project: route === 'manager' ? 'Example – M' : 'Example – Dev' },
    lastSync: null,
    pendingProposals: [],
    dismissedProposals: [],
    ...over,
  };
}

export function makeVaults(over: { manager?: Partial<VaultConfig>; ic?: Partial<VaultConfig> } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'teal-sync-'));
  const make = (route: VaultRoute): Vault => {
    const dir = join(root, route === 'manager' ? 'mgr/manager-job-search' : 'dev/ic-web-dev-search');
    mkdirSync(dir, { recursive: true });
    const config = makeConfig(route, over[route]);
    writeFileSync(join(dir, '.teal-sync.json'), JSON.stringify(config, null, 2));
    return { dir, config };
  };
  const manager = make('manager');
  const ic = make('ic');
  return { root, manager, ic, all: [manager, ic] };
}

export function jobPath(vault: Vault, name: string, inbox = false): string {
  const folder = inbox ? vault.config.inboxFolder : vault.config.jobsFolder;
  return join(vault.dir, folder, name, `${name}.md`);
}

export function readJob(vault: Vault, name: string, inbox = false) {
  const text = readFileSync(jobPath(vault, name, inbox), 'utf8');
  const match = /^---\n([\s\S]*?\n)---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`No frontmatter in ${name}`);
  return { text, fm: YAML.parse(match[1]) as Record<string, unknown>, body: match[2] };
}

export function writeJob(vault: Vault, name: string, text: string, inbox = false): void {
  const path = jobPath(vault, name, inbox);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

/** Every file under `dir` as relative path → content. */
export function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[relative(dir, full)] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}
