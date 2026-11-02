---
name: ia2-evidence-submit
description: Record, document, audit and package the IA#2 zero-downtime migration - the ledger entry after each step, MIGRATION.md, AI-LOG.md, docs/explain.md, the honest rubric audit, SELF_ASSESSMENT_REPORT.md, the replay check, cleanup and the <StudentID>_<total>.zip. Use during the official run to record each step, after S8 to write the documents, in Phase 4 before the zip, and whenever the human asks "what do I still have to hand in", "what score can I claim", "is the log good enough", or "how do I explain this at the oral", even if they do not name this skill.
---

# ia2-evidence-submit

The grade comes from what the repository can prove. The logs are evidence, not the grade; the documents say what the logs show; the self-assessment claims marks and points at evidence. A claim without an evidence line counts as "claimed and not done", and a claim far above the real mark costs extra. So: write only what the files support, and point at it.

Templates for every file below are in `templates/` next to this file. They contain only `<...>` placeholders that say how to fill them; copy one, replace every placeholder, and leave none behind.

## Who writes what

| File                               | Written by                                             | When                    | Comes from                                      |
| ---------------------------------- | ------------------------------------------------------ | ----------------------- | ----------------------------------------------- |
| `traffic-log.txt`, `check-log.txt` | the orchestrator only                                  | during the official run | command output; never typed or edited by anyone |
| `docs/ledger.md`                   | the orchestrator; the agent verifies and commits it    | after each step         | `templates/ledger-entry.template.md`            |
| `MIGRATION.md`                     | agent                                                  | after S8                | ledger, both logs, git, rehearsal summary       |
| `AI-LOG.md`                        | agent, as it works                                     | after every task        | the session itself and `git log`                |
| `docs/explain.md`                  | agent; the human reads it                              | Phase 4                 | the repository                                  |
| `SELF_ASSESSMENT_REPORT.md`        | agent drafts; the human fills ID and name and approves | Phase 4                 | the audit below                                 |
| the zip                            | agent builds it after G4; the human submits it         | last                    | the committed repository                        |

## 1. After each official step

Read the new block of `check-log.txt`, the new lines of `traffic-log.txt`, and the ledger entry the orchestrator wrote. Confirm the entry has the real command, the line range of the traffic log, the counters at the end, the check label with its verdict line, and a note for anything unusual (for example the expected `INCONSISTENT` at S2 and S6). If a field is wrong, say so; never fix it by editing a log. Commit only `docs/ledger.md`, by name.

## 2. After S8: write `MIGRATION.md`

Start from `templates/MIGRATION.template.md`. Fill each part from its source; every sentence must be checkable.

| Part                                       | Source                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legend and Start state                     | the orchestrator's deploy commands; the S0 ledger entry                                                                                                                                                                                                                         |
| Plan rows                                  | one row per step that changes schema, code or data (the expand migration, each code version, the backfill, the contract migration). Name the tag or migration file in the first cell. Take versions from the ledger `Instances` lines; include the mixed state of rolling steps |
| Undo cells                                 | the exact commands: `npm run migrate:down` run from the checkout that has the migration, or `DEPLOY <port> <ver>`. Use only commands that were actually run or tested (the down-tests, the S5 drill)                                                                            |
| Earlier versions that can still run safely | reason from what each version reads and writes (`ia2-code-versions`); add the condition where it is conditional, for example that v1 may serve after the backfill only if the backfill is run again                                                                             |
| Tags and files                             | `git rev-parse --short vN^{commit}` and `git log --format='%h %s' -- <path>`                                                                                                                                                                                                    |
| Point of no return                         | the deploy of v4. Reason, in your words: from v4 on `price` is no longer written and goes stale; v1 and v2 read `price` and would show wrong prices while answering 200; v3 still works; the later drop removes the column and its down is lossy                                |
| Rollback drill                             | the S5 ledger entry (line range, labels); safe because v3 keeps writing both columns, so v2 still reads correct `price`; not safe: v4 to v2, with the S6 `INCONSISTENT` check as evidence                                                                                       |
| Backfill                                   | the script header and the S3 output (`STOPPED`, `DONE`, `updated=0`); why the selection rule equals `check.js` (rows left behind by v1 during the rolling window); why it may only start when no instance runs v1                                                               |
| Failures                                   | `none` only if the final line says zero failed requests and no earlier run is hidden; otherwise each failure and its cause                                                                                                                                                      |
| Backup and restore                         | the S7 ledger notes: method `VACUUM INTO`, backup time, restore time                                                                                                                                                                                                            |
| How to replay                              | the real command sequence, in order; see section 6 for how it is verified                                                                                                                                                                                                       |
| PostgreSQL notes                           | the notes in `ia2-migration-backfill`                                                                                                                                                                                                                                           |
| Tooling changes                            | the `NEW_CLIENTS_FILE` patch to `scripts/traffic.js` and the orchestrator: what, why, commit                                                                                                                                                                                    |

Check before moving on: no `<` placeholder is left; every tag and file named in the plan table exists (`git tag`, `git ls-tree`); every number matches a log line.

## 3. `AI-LOG.md`

- One entry right after each task is done (Phase 0 setup and tooling, each build item, the rehearsal, the official-run guidance, the documents), using `templates/AI-LOG.entry.template.md`. Not one entry at the end.
- Fill from what actually happened: the instruction received, what was used as generated, what was revised after feedback and why, what was dropped and why, and what the human did without the agent (ran every official command, reviewed diffs, approved the gates, any edit made outside the chat). Run `git log` and `git diff` first to see edits the human made. Write `nothing` for an empty field.
- Say plainly that the rehearsal was run by the agent on scratch databases and that every official command was run by the human. Give the `traffic.js` patch its own entry.
- Never put secrets, keys or personal data in the log or in a prompt.
- Final review in Phase 4: compare the entries with `git log --format='%h %ad %s' --date=short`; every phase has an entry, nothing is claimed that did not happen, and the human has read it. The human is asked about this log at the oral; do not flatter or pad.

## 4. `docs/explain.md`

Anything the human cannot explain scores zero at the oral, even if it runs. Write 2 to 3 questions with short, plain answers per criterion (use `templates/docs.templates.md`), each answer pointing at a file or log line. Cover at least: why a column is not renamed in place; why dual write comes before the backfill; why the backfill waits until v1 is gone and why its rule equals `check.js`; why one instance is restarted at a time; what `check` sees that the traffic log cannot; why v3 to v2 is safe and v4 to v2 is not; what the point of no return is; why the backup uses `VACUUM INTO`; what the guard in 003 prevents; what was changed in `traffic.js` and why; and how the same plan changes on PostgreSQL. Ask the human to read it and to say one answer aloud in their own words.

## 5. Audit and `SELF_ASSESSMENT_REPORT.md`

Mechanical checks first (all from the repository root):

```
grep -c '=== traffic start' traffic-log.txt                     # exactly 1
tail -1 traffic-log.txt                                         # RESULT: zero failed requests
grep -n 'new clients →' traffic-log.txt                         # the line that raises NEW_CLIENTS
grep -c ' down (' traffic-log.txt; grep -c ' back$' traffic-log.txt    # equal; 10 expected
grep '^===== ' check-log.txt                                    # every label of the playbook, and DOWN-TEST 001, 002, 003
git tag -n; for t in v1 v2 v3 v4; do git cat-file -t $t; done   # four annotated tags
git ls-tree --name-only -r v1 migrations | cat                  # v1: 001; v2..v4: 001 and 002; main: also 003
```

Then score each criterion against `docs/ia2-requirements.md`: take the highest band whose every condition has an evidence line, and inside the band claim a point or two below the maximum unless nothing is missing.

| Criterion             | Conditions for the top band                                                                                                                                                                                                                            | Evidence                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| The plan              | every step has the four columns; point of no return named with its reason; table matches tags and migrations                                                                                                                                           | `MIGRATION.md`, `git tag`, `migrations/`                       |
| Expand and dual write | the new column in its own migration and v1 works on it; one version writes both columns on every write path; API offers `priceVnd` and returns `price`; every migration has a down and `migrate:down` ran once for each with output in `check-log.txt` | `migrations/002_*`, tag `v2` and its tests, `DOWN-TEST` blocks |
| Backfill              | small batches, each a short transaction, while traffic runs; stop and run again gives the same result; runs only when no instance runs v1; `CONSISTENT` right after                                                                                    | script, S3 labels, ledger                                      |
| Zero failed requests  | one continuous log ending in `RESULT: zero failed requests`; rolling restarts as one `down`/`back` per instance; `NEW_CLIENTS` above 0 after the API offered `priceVnd`                                                                                | `traffic-log.txt` line ranges, the `new clients →` line       |
| The way back          | v3 rolled back to v2 and forward again under traffic with zero failures; `CONSISTENT` before and after; `MIGRATION.md` explains why it is safe and which later rollback is not                                                                         | S5 ledger entry and labels                                     |
| Contract              | `price` dropped only after v4 is on every instance; old clients still get `price` in every response; log stays clean                                                                                                                                   | `migrations/003_*`, `S7-after-drop`, probe output, log range   |

The unmodified `traffic.js` cannot show `NEW_CLIENTS` above 0 inside one continuous run; the evidence here is the `new clients → <v>` line from the disclosed patch. Say so in "What I did not manage" if it is a weakness, not as an excuse.

Fill `templates/SELF_ASSESSMENT_REPORT.template.md`: one row per criterion, the marks claimed, an evidence cell that names a file, tag, migration, check-log label or traffic-log line range (take the ranges from the ledger). The total is the sum of the column. "What I did not manage" is scored as honesty: write what is really missing, or what you could not defend at the oral. Leave `<student ID>` and `<full name>` for the human to fill, and ask for them.

## 6. Replay check

Graders may check out the tags and replay the sequence; a log that the repository cannot reproduce scores 0 on criteria 4 and 5.

1. Clone the repository into a temporary directory (`git clone <repo> /tmp/replay`).
2. For each of `v1`..`v4` and for `main`: check out, then `npm test`. All pass.
3. Compare the plan table with reality: every tag named exists, `git ls-tree` shows the migrations the table says, the backfill script is where the table says.
4. Follow the "How to replay" section literally in a rehearsal-style environment (scratch database, other ports) up to at least S3, without the orchestrator. Where a command fails or is ambiguous, fix the section.
5. Confirm `traffic-log.txt` and `check-log.txt` are committed at the root and unchanged since S8.

## 7. Cleanup, G4 and the zip

1. `git worktree remove ../ia2-v1` .. `../ia2-v4`, `git worktree prune`; `.git/worktrees` must be absent or empty.
2. All documents committed (`docs: migration plan, AI-LOG, self-assessment`), `git status --short` empty, everything pushed.
3. **G4:** report to the human, listing: the claimed total, the zip name, any weakness. Wait for "go".
4. From the repository root, so that the files sit at the root of the zip and `.git` is included:
   `zip -qr ../<StudentID>_<total>.zip . -x ".ia2/*" "data/*" "node_modules/*"`
   The name must match `^[0-9]+_[0-9]{1,3}\.zip$` and `<total>` must equal the total in `SELF_ASSESSMENT_REPORT.md`.
5. Verify: `unzip -l ../<name>.zip` shows `SELF_ASSESSMENT_REPORT.md`, `MIGRATION.md`, `AI-LOG.md`, `traffic-log.txt`, `check-log.txt`, `migrations/`, `scripts/` and `.git/HEAD`, and shows no `.ia2/`, `data/` or `*.db`.
6. Tell the human to submit it from their `<StudentID>@student.hcmus.edu.vn` account before 2026-11-05 22:00 (Asia/Ho_Chi_Minh).

## Do not

Edit or reorder a log; claim marks without an evidence line; leave a placeholder in a handed-in file; invent entries in `AI-LOG.md`; write the student's ID or name for them; name the zip with a total that differs from the table; build the zip before G4.
