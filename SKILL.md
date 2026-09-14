---
name: teal-sync
description: Sync the Teal job tracker into the job-search Obsidian vaults (manager-job-search and ic-web-dev-search). Downloads Teal's CSV through Claude in Chrome, updates job folders in both vaults, mirrors Interview Loop status, prints a "what's next" digest, queues Teal changes for the coach, and handles vault routing questions and check-in to-dos in Things3. Use when the user says "sync teal", "teal sync", "/teal-sync", or hands over a Teal job-tracker CSV.
---

# teal-sync

Repo (this skill's folder): `~/Documents/Projects/teal-sync`. Run every script from there with `node scripts/<name>.ts` (Node 24 runs TypeScript directly).

**Hard rules**
- Sync runs no coach commands and never writes coach files (`coaching_state.md`, `storybank.md`, `coaching_state_archive.md`, `COACH:` blocks in vault notes). Teal changes reach the coach only through the `pendingFeedback` queue, which the coach handles at session start (the root's `CLAUDE.local.md`).
- Automatic: job folders, main-note frontmatter, `DERIVED:loop` blocks, `.teal-exports/` filing, `lastSync`, the `pendingFeedback` queue, completing a check-in to-do once its job has moved past `applied`.
- Needs the user's yes: routing overrides, creating Things projects or to-dos, completing to-dos of archived/missing jobs.
- Browser: Claude in Chrome, **"Claude Chrome" profile only**.
- Things3 is visible to the user's employer. Use only the title, notes, area, and project strings the script outputs. No tags, checklists, or extra words. Never write job, interview, apply, application, recruiter, hiring, offer, salary, or role titles to Things.

## 0. Where am I

Current root = the search root that contains the working directory:

| Working directory under | Current vault | Config |
|---|---|---|
| `~/Documents/Projects/job-search-mgr` | `manager-job-search` | `job-search-mgr/manager-job-search/.teal-sync.json` |
| `~/Documents/Projects/job-search-dev` | `ic-web-dev-search` | `job-search-dev/ic-web-dev-search/.teal-sync.json` |
| anywhere else | none | show both digests in full; skip steps 4–5 and tell the user to open a root to act on them |

## 1. Get the CSV

If the user gave a CSV path, use it and skip to step 2.

Otherwise download it with Claude in Chrome:

1. If browser tools aren't available this session, tell the user to run `/chrome` (or restart Claude Code and accept the prompt), or to give a CSV path. Stop until they do.
2. Confirm the browser is the **"Claude Chrome"** profile. If it isn't, stop and ask the user to switch.
3. Record the click time: `node -e 'console.log(Date.now())'`.
4. Open the Teal Job Tracker (`https://app.tealhq.com/job-tracker`; if that URL has moved, navigate from Teal's nav). If Teal asks to log in, stop and let the user log in within that profile.
5. Click **Download Data** (not "Export Report").
6. Wait for the file: `node scripts/wait-download.ts --dir <downloadsDir from vaults.json> --since <click time>`.
   - Exit 0: stdout is the CSV path.
   - Exit 2 (timed out): check Chrome for a save dialog or blocked download; ask the user for the path if needed.
   - Exit 1 with `Operation not permitted`: macOS is blocking this terminal from the Downloads folder. Ask the user to either grant the terminal app access (System Settings → Privacy & Security → Files and Folders) or point the Claude Chrome profile's download location at a folder under `~/Documents`, and update `downloadsDir` in `vaults.json` to match.

## 2. Run the sync

```bash
node scripts/import.ts --csv "<csv>" --json-out "<scratchpad>/teal-sync-result.json"
```

stdout is the text digest for every vault; the JSON file has the full `SyncResult` (`scripts/lib/types.ts`).

- Exit 1: show the error and stop.
- Exit 2: a vault hit the missing-jobs guard (more than half its known jobs vanished from the export), so that vault wrote nothing. Show the `ABORT` line and ask whether that's expected (for example, a filtered Teal view). Only on a clear yes, re-run with `--force`.

The script also filed the CSV into each root's `.teal-exports/` (newest 3 kept), wrote `lastSync`, and added this sync's Teal changes to each vault's `pendingFeedback` queue. If the CSV came from step 1, delete the copy in the downloads folder (it holds salary data; the filed copies remain).

## 3. Show the digest

Print, in this order:

1. The header line (`Teal sync: …`).
2. Top-level `WARN` lines.
3. The current vault's digest lines as they are, then its `WARN` lines.
4. The other vault's `summary:` line, followed by `Open <other root> to act on them.` when it has anything.

Digest line tags: `NEW` / `LINK` (new or coach-created folder linked), `MOVE` (Teal status change), `GONE` (archived or missing in Teal), `ROUTE` / `RENAME`, `FEED` (queued for the coach), `ASK` (which vault?), `DUE` (check-in to-do to offer), `DONE` (to-do being completed), `TODO` (to-do to offer completing).

Also check the JSON for Teal `statusName` values other than bookmarked / applying / applied / interviewing / negotiating / accepted (they show as warnings). Mention any new ones so the handoff's unknowns list can be updated.

## 4. Routing for the current vault

Work from the current vault's entry in the JSON (`vaults[]` where `vaultDir` is the current vault). Batch related yes/no questions into one prompt where it reads cleanly.

**Routing (`ASK` lines, jobs with `route: "pending"`)**: ask manager or IC. Then:
```bash
node scripts/update.ts override --teal-id <id> --route manager|ic
```
This writes the override into both vaults' configs. Re-run step 2's command with the filed CSV (`<root>/.teal-exports/<csv name>`) so the job moves out of `_Inbox`, the other vault's copy is removed, and the job joins the right vault's `pendingFeedback` (jobs waiting for a route are left out of the queue).

## 5. Things3 (current vault only)

Use the `things-cli` skill for command details. `things.create`, `things.complete`, and `things.offerComplete` in the JSON drive everything.

**Setup, once, before the first write:**
Area and project names come from the vault's `.teal-sync.json` (`things.area`, `things.project`; also in each `things.create` entry). Never write them into this repo.
- `things areas -j` must list `<area>`. The CLI can't create areas: if it's missing, ask the user to create an area with exactly that name in Things, and skip the rest of this step until they have.
- `things projects --area "<area>" -j` must list `<project>` (match exactly, including any en dash). If missing, ask, then `things project add "<project>" --area "<area>"`. It prints nothing and can take a few seconds to appear in `things projects`.
- Things → Settings → General → **Enable Things URLs** must be on. `things edit` fails without it (`update: auth token is required`), so a misfiled to-do can't be fixed. The CLI reads the auth token from Things itself; never ask for it, pass it, or write it anywhere.

**Create (`DUE` lines)**: ask per to-do (`Create check-in for <company>, due <due>?`).
- Yes:
  ```bash
  things add "<title>" --project "<project>" --notes "<notes>" --when <due> --deadline <due> -j
  ```
  `--project` takes the project **name** exactly as above. A project UUID is ignored and the to-do lands in the Inbox. A past `<due>` is fine: it shows in Today as overdue.

  `add` prints nothing. Find the UUID with `things search "<title>" -j` (open). `search` and `show` don't report the project, so confirm it with `things list inbox -j` (it must **not** be there). Then `node scripts/update.ts things-id --note "<vaultDir>/<notePath>" --value <uuid>`.
- No: `node scripts/update.ts things-id --note "<vaultDir>/<notePath>" --value none` so it isn't offered again.

**Complete (`DONE` lines)**: no question needed. For each, `things show <thingsId> -j`. If its status is `open`, `things complete <thingsId>` and report it. If it's already completed or cancelled, or can't be found, do nothing.

**Offer to complete (`TODO` lines)**: ask. On yes, same check-then-complete as above.

## 6. Wrap up

End with a short recap: what was written automatically, what the user confirmed, and what is still waiting (the other vault's to-dos).

Then hand the queue to the coach. Counts are `feedback.length` per vault in the JSON (after any routing re-run). Never run `feedback` or clear the queue yourself.
- Current vault has items: end with `N Teal updates queued for the coach. Type /clear, then any message, to hand them over.`
- Other vault has items: `M Teal updates queued in <other vault>. Open <other root> and send any message to hand them over.`
- No current vault: one line per vault with items, `N Teal updates queued in <vault>. Open <root> and send any message to hand them over.` (`/clear` here won't load the coach.)
