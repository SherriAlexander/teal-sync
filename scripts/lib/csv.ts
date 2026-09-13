import { parse } from 'csv-parse/sync';
import type { TealRow } from './types.ts';

const REQUIRED_COLUMNS = ['id', 'company_name', 'role', 'statusName'];

/** Parse a Teal "Download Data" CSV. Throws on missing columns; skips rows without an id. */
export function parseTealCsv(text: string): { rows: TealRow[]; warnings: string[] } {
  const [header = [], ...lines] = parse(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`Teal CSV is missing column(s): ${missing.join(', ')}`);
  }

  const rows: TealRow[] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    const get = (column: string): string | null => {
      const value = line[header.indexOf(column)]?.trim();
      return value ? value : null;
    };

    const id = get('id');
    if (!id) {
      warnings.push(`CSV line ${index + 2} (${get('company_name') ?? 'unknown company'}) has no id; skipped`);
      return;
    }

    rows.push({
      id,
      companyName: get('company_name') ?? '',
      role: get('role') ?? '',
      location: get('location'),
      url: get('url'),
      excitement: toNumber(get('excitement')),
      source: get('source'),
      minSalary: toNumber(get('min_salary')),
      maxSalary: toNumber(get('max_salary')),
      salaryCurrency: get('salary_currency'),
      salaryPeriod: get('salary_pay_period'),
      addedAt: get('added_at'),
      appliedAt: get('applied_at'),
      followUpAt: get('follow_up_at'),
      updatedAt: get('updated_at'),
      archivedAt: get('archived_at'),
      statusName: get('statusName') ?? statusFromJson(get('status')) ?? '',
    });
  });

  return { rows, warnings };
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function statusFromJson(value: string | null): string | null {
  if (value === null) return null;
  try {
    const name = (JSON.parse(value) as { name?: unknown }).name;
    return typeof name === 'string' && name ? name : null;
  } catch {
    return null;
  }
}
