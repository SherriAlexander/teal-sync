import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { updateConfigFile } from './config.ts';
import { syncHeader, vaultDigest, vaultSummary } from './digest.ts';
import { findLoop, loopLine, parseLoops, upsertLoopBlock } from './loops.ts';
import { feedbackItems, feedbackMessage, mergeFeedback } from './feedback.ts';
import { applyProps, joinNote, splitNote } from './note.ts';
import { thingsPlan } from './plan.ts';
import type { FeedbackItem, Loop, SyncOptions, SyncResult, Vault, VaultResult } from './types.ts';

/**
 * Second pass after syncAll: mirror each root's Interview Loops into job notes (`loop_status`, DERIVED:loop),
 * queue Teal changes for the coach's `feedback`, plan Things3 to-dos, render digests, and stamp `.teal-sync.json`.
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
  if (!stateFound) warnings.push(`No coaching state at ${statePath}; loop mirror skipped`);
  const loops = stateFound ? parseLoops(readFileSync(statePath, 'utf8')) : [];
  const writeLoops = stateFound && !options.dryRun;

  const jobs = input.jobs.map((job) => {
    const { loop, ambiguous } = findLoop(loops, job.company, job.role);
    if (ambiguous) warnings.push(`Several loops match ${job.company} (${job.role}); name the role in the loop heading`);
    if (writeLoops) mirrorLoop(vault, job.notePath, loop, options.today, warnings);
    return stateFound ? { ...job, loopStatus: loop?.status ?? null } : job;
  });

  // Read the queue from disk, not the loaded config: the skill clears it between runs.
  const configPath = join(vault.dir, '.teal-sync.json');
  const queued = (JSON.parse(readFileSync(configPath, 'utf8')).pendingFeedback ?? []) as FeedbackItem[];
  const feedback = mergeFeedback(queued, feedbackItems(input.changes, jobs, options.today));
  if (!options.dryRun) {
    updateConfigFile(configPath, (raw) => {
      raw.lastSync = options.today;
      raw.pendingFeedback = feedback;
      delete raw.pendingProposals;
      delete raw.dismissedProposals;
    });
  }

  const partial: VaultResult = {
    ...input,
    jobs,
    warnings,
    feedback,
    feedbackMessage: feedbackMessage(feedback),
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
