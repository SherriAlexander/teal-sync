# teal-sync

Sync Teal job tracker CSV exports into the job-search Obsidian vaults. Also a Claude Code skill (`SKILL.md`, symlinked at `~/.claude/skills/teal-sync`).

## Setup

`vaults.json` holds machine-specific absolute paths and is gitignored. Create it from the template, then fill in the paths to each vault's `.teal-sync.json` and the folder Chrome downloads into:

```bash
cp vaults.example.json vaults.json
```

## Usage

```bash
npm test            # node:test
npm run typecheck

# Sync every vault in vaults.json (files the CSV, mirrors loops, stamps lastSync)
node scripts/import.ts --csv <job-tracker-*.csv> [--dry-run] [--force] [--today YYYY-MM-DD] [--json-out result.json]

# Wait for a Chrome download
node scripts/wait-download.ts --dir <downloads folder> --since <epoch ms> [--timeout 60]

# Writes after the user answers, and the feedback queue
node scripts/update.ts things-id --note <main note> --value <Things uuid | none>
node scripts/update.ts feedback-message --config <.teal-sync.json>   # prints the queued message for the coach's feedback
node scripts/update.ts clear-feedback --config <.teal-sync.json>
node scripts/update.ts override --teal-id <id> --route manager|ic
```

`import.ts` exit codes: 0 ok, 1 error, 2 a vault hit the missing-jobs guard. Without `--json-out` it prints the `SyncResult` JSON (`scripts/lib/types.ts`); with it, the JSON goes to the file and stdout gets the text digest.

Real exports contain salary data and are gitignored. Only `tests/fixtures/teal-export.csv` (scrubbed) is committed.
