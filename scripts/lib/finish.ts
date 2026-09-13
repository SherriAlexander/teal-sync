import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { updateConfigFile } from './config.ts';
import { syncHeader, vaultDigest, vaultSummary } from './digest.ts';
import { findLoop, loopLine, parseLoops, upsertLoopBlock } from './loops.ts';
import { applyProps, joinNote, splitNote } from './note.ts';
import { loopAction, thingsPlan } from './plan.ts';
import type { Flag, Loop, Proposal, SyncOptions, SyncResult, Vault, VaultResult } from './types.ts';

/**
 * Second pass after syncAll: mirror each root's Interview Loops into job notes (`loop_status`, DERIVED:loop),
 * compute Status proposals, flags, and the Things3 plan, render digests, and stamp `.teal-sync.json`.
 */
export function finishAll(result: SyncResult, vaults: Vault[], options: SyncOptions): SyncResult {
  const finished = result.vaults.map((vaultResult) => {
    const vault = vaults.find((candidate) => candidate.dir === vaultResult.vaultDir);
    if (!vault) throw new Error(`No config for ${vaultResult.vaultDir}`);
    return finishVault(vaultResult, vault, options);
  });
  const next = { ...result, vaults: finished };
  return { ...next, header: syncHeader(next) };
}

function finishVault(input: VaultResult, vault: Vault, options: SyncOptions): VaultResult {
  if (input.aborted) return { ...input, digest: vaultDigest(input), summary: vaultSummary(input) };

  const warnings = [...input.warnings];
  const statePath = resolve(vault.dir, vault.config.coachingState);
  const stateFound = existsSync(statePath);
  if (!stateFound) warnings.push(`No coaching state at ${statePath}; loop mirror and proposals skipped`);
  const loops = stateFound ? parseLoops(readFileSync(statePath, 'utf8')) : [];
  const writeLoops = stateFound && !options.dryRun;

  const proposals: Proposal[] = [];
  const flags: Flag[] = [];
  const jobs = input.jobs.map((job) => {
    const { loop, ambiguous } = findLoop(loops, job.company, job.role);
    if (writeLoops) mirrorLoop(vault, job.notePath, loop, options.today, warnings);
    const updated = stateFound ? { ...job, loopStatus: loop?.status ?? null } : job;
    const action = loopAction(updated, loop, { today: options.today, dismissed: vault.config.dismissedProposals, ambiguous });
    if (action.proposal) proposals.push(action.proposal);
    if (action.flag) flags.push(action.flag);
    return updated;
  });

  if (!options.dryRun) {
    updateConfigFile(join(vault.dir, '.teal-sync.json'), (raw) => {
      raw.lastSync = options.today;
      if (stateFound) raw.pendingProposals = proposals;
    });
  }

  const partial: VaultResult = {
    ...input,
    jobs,
    warnings,
    proposals,
    flags,
    things: thingsPlan(jobs, vault.config, options.today),
  };
  return { ...partial, digest: vaultDigest(partial), summary: vaultSummary(partial) };
}

function mirrorLoop(vault: Vault, notePath: string, loop: Loop | null, today: string, warnings: string[]): void {
  const path = join(vault.dir, notePath);
  if (!existsSync(path)) return;

  const text = readFileSync(path, 'utf8');
  const { frontmatter, body } = splitNote(text);
  let yaml: string;
  try {
    yaml = applyProps(frontmatter, { loop_status: loop?.status ?? null }, []).yaml;
  } catch (error) {
    warnings.push(`Skipped loop mirror for ${notePath}: ${(error as Error).message}`);
    return;
  }
  const next = joinNote(yaml, upsertLoopBlock(body, loop ? loopLine(loop) : null, today));
  if (next !== text) writeFileSync(path, next);
}
