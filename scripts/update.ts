#!/usr/bin/env node
// Small writes the teal-sync skill makes after the user answers: Things to-do ids, proposal decisions, routing overrides.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { configPaths, updateConfigFile } from './lib/config.ts';
import { applyProps, joinNote, splitNote } from './lib/note.ts';
import type { Proposal } from './lib/types.ts';

const USAGE = `Usage:
  node scripts/update.ts things-id --note <main note path> --value <Things uuid | none>
  node scripts/update.ts resolve-proposal --config <.teal-sync.json> --teal-id <id> [--dismiss]
  node scripts/update.ts override --teal-id <id> --route manager|ic [--vaults <vaults.json>]`;
const DEFAULT_VAULTS = fileURLToPath(new URL('../vaults.json', import.meta.url));

class UsageError extends Error {}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  try {
    const { values } = parseArgs({
      args: rest,
      options: {
        note: { type: 'string' },
        value: { type: 'string' },
        config: { type: 'string' },
        'teal-id': { type: 'string' },
        dismiss: { type: 'boolean', default: false },
        route: { type: 'string' },
        vaults: { type: 'string', default: DEFAULT_VAULTS },
      },
    });
    const need = (name: 'note' | 'value' | 'config' | 'teal-id' | 'route' | 'vaults') => {
      const value = values[name];
      if (!value) throw new UsageError(`Missing --${name}`);
      return value;
    };

    switch (command) {
      case 'things-id':
        setThingsId(need('note'), need('value'));
        break;
      case 'resolve-proposal':
        resolveProposal(need('config'), need('teal-id'), values.dismiss);
        break;
      case 'override':
        setOverride(need('vaults'), need('teal-id'), need('route'));
        break;
      default:
        throw new UsageError(command ? `Unknown command "${command}"` : 'Missing command');
    }
    return 0;
  } catch (error) {
    const message = (error as Error).message;
    console.error(error instanceof UsageError || error instanceof TypeError ? `${message}\n${USAGE}` : `teal-sync update: ${message}`);
    return 1;
  }
}

function setThingsId(notePath: string, value: string): void {
  const text = readFileSync(notePath, 'utf8');
  const { frontmatter, body } = splitNote(text);
  const props = frontmatter ? (YAML.parse(frontmatter) as Record<string, unknown> | null) : null;
  if (props?.type !== 'job') throw new Error(`${notePath} is not a job note`);
  const { yaml, changed } = applyProps(frontmatter, { things_id: value }, []);
  if (changed) writeFileSync(notePath, joinNote(yaml, body));
}

function resolveProposal(configPath: string, tealId: string, dismiss: boolean): void {
  updateConfigFile(configPath, (raw) => {
    const pending = (raw.pendingProposals ?? []) as Proposal[];
    const match = pending.find((proposal) => proposal.tealId === tealId);
    if (!match) throw new Error(`No pending proposal for ${tealId} in ${configPath}`);
    raw.pendingProposals = pending.filter((proposal) => proposal !== match);

    const dismissed = (raw.dismissedProposals ?? []) as string[];
    const key = `${tealId}:${match.to}`;
    raw.dismissedProposals = dismiss && !dismissed.includes(key) ? [...dismissed, key] : dismissed;
  });
}

function setOverride(vaultsJson: string, tealId: string, route: string): void {
  if (route !== 'manager' && route !== 'ic') throw new UsageError(`--route must be manager or ic, got "${route}"`);
  for (const path of configPaths(vaultsJson)) {
    updateConfigFile(path, (raw) => {
      raw.overrides = { ...(raw.overrides as Record<string, string> | undefined), [tealId]: route };
    });
  }
}

process.exitCode = main(process.argv.slice(2));
