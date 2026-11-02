# Migration ledger

## G2 Freeze — 2026-11-03

The human explicitly approved G2 and authorized pushing main and v1–v4 in chat.
The agent completed the freeze checks at main commit
`9363c8262da8528eb9fd593249f63bc4d8ebe89d` before pushing.

- Result: PASS; working tree was clean and the local branch was main.
- Exactly four annotated tags exist; v1 equals the freshly fetched upstream/main.
- History follows the required commit sequence; v1 → v2 → v3 → v4 ancestry passed.
- S0–S8 rehearsal passed with zero failed requests; see docs/rehearsal-summary.md.
- All four sibling worktrees were recreated and their HEADs verified against their tags.
- Tests passed: v1=4, v2=6, v3=7, v4=7, main=7.
- Raw freeze verification: `.ia2/freeze-check.txt` (local, ignored scratch evidence).

Frozen tag commits:

| Tag | Commit |
| --- | --- |
| v1 | `2b889bde433190c17744f30d3900d38ab333a756` |
| v2 | `717724874239e236f8d6ae3417286d82130c5411` |
| v3 | `10230e3b8d3804dcf9dae8e18612b55b3ae073b1` |
| v4 | `01f6a26479df3eaeda2adaaba3df234ae0816601` |

The agent ran these authorized Git commands after the freeze checks passed:

```bash
git push origin main
git push origin v1 v2 v3 v4
```

Both succeeded against the human's fork,
`git@github.com:phatnguyen975/awad-price-migration-starter.git`.
No tag was moved and no history was rewritten. Application code, scripts,
migrations and tests are frozen; later ledger and evidence commits may advance
main without moving the version tags.

Official run: not started. Official instances, traffic counters and check labels
are not applicable to this gate entry. Every official command must be run by the
human; the agent has run no official-mode command and created no root log file.

## S0 Baseline — 2026-11-02T21:53:56.469Z
- Instances: v1 / v1 | git 3ca58e0
- Command (run by the human): node scripts/ia2/run.js official s0 --reset
- traffic-log.txt lines: 1–3 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S0-baseline → CONSISTENT
- Notes: none

## S1 Expand — 2026-11-02T21:55:57.208Z
- Instances: v1 / v1 | git 2acf595
- Command (run by the human): node scripts/ia2/run.js official s1
- traffic-log.txt lines: 26–26 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S1-expand → CONSISTENT, but 21127 rows have no price_vnd yet — nothing may read price_vnd until they do; S1-down-test-002 → CONSISTENT
- Notes: none

## S2 Dual write — 2026-11-02T21:58:36.995Z
- Instances: v2 / v2 | git fb29bf9
- Command (run by the human): node scripts/ia2/run.js official s2
- traffic-log.txt lines: 54–63 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S2-A-v2 → INCONSISTENT; S2-both-v2 → INCONSISTENT
- Notes: S2-A-v2: INCONSISTENT (expected by playbook); S2-both-v2: INCONSISTENT (expected by playbook)

## S3 Backfill — 2026-11-02T22:00:07.628Z
- Instances: v2 / v2 | git abe1cd0
- Command (run by the human): node scripts/ia2/run.js official s3
- traffic-log.txt lines: 80–81 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S3-before-backfill → CONSISTENT, but 20585 rows have no price_vnd yet — nothing may read price_vnd until they do; S3-partial → CONSISTENT, but 15585 rows have no price_vnd yet — nothing may read price_vnd until they do; S3-after-backfill → CONSISTENT
- Notes: none

## S4 Read price_vnd — 2026-11-02T22:01:53.172Z
- Instances: v3 / v3 | git 29173be
- Command (run by the human): node scripts/ia2/run.js official s4
- traffic-log.txt lines: 97–105 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S4-A-v3 → CONSISTENT; S4-both-v3 → CONSISTENT
- Notes: none

## S5 Rollback drill — 2026-11-02T22:03:38.335Z
- Instances: v3 / v3 | git 24f661c
- Command (run by the human): node scripts/ia2/run.js official s5
- traffic-log.txt lines: 117–134 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S5-before → CONSISTENT; S5-on-v2 → CONSISTENT; S5-after → CONSISTENT
- Notes: none

## S6 Point of no return — 2026-11-02T22:06:12.467Z
- Instances: v4 / v4 | git c880370
- Command (run by the human): node scripts/ia2/run.js official s6 --go
- traffic-log.txt lines: 160–168 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S6-A-v4 → INCONSISTENT; S6-both-v4 → INCONSISTENT
- Notes: S6-A-v4: INCONSISTENT (expected by playbook); S6-both-v4: INCONSISTENT (expected by playbook)

## S7 Contract — 2026-11-02T22:07:23.836Z
- Instances: v4 / v4 | git 9495f68
- Command (run by the human): node scripts/ia2/run.js official s7 --go
- traffic-log.txt lines: 182–182 | counters at the end: 0 / 0 / 0 / 0
- check-log label: S7-backup → INCONSISTENT; S7-down-test-003 → CONSISTENT; S7-after-drop → CONSISTENT
- Notes: S7-backup: INCONSISTENT (expected by playbook); VACUUM INTO backup=881ms; restore copy and check=564ms; file=/mnt/c/Users/Admin/Projects/awad-price-migration-starter/.ia2/backup-s7-1793657238486.db; Old-client probe passed on both instances: GET item/list, POST item, PATCH item, POST order

## S8 Finish — 2026-11-02T22:08:45.059Z
- Instances: v4 / v4 | git 36c623c
- Command (run by the human): node scripts/ia2/run.js official s8
- traffic-log.txt lines: 193–200 | counters at the end: 0 / 0 / 0 / 0
- check-log label: none
- Notes: none

## G4 Packaging approval — 2026-11-03

The human reported that a separate session review still supported 100/100 and
explicitly instructed proceeding to the next step after the earlier packaging
hold. The repository contains that independent review at commit 0153a0d.
This instruction approves finalizing the self-assessment at 100 and packaging
23127449_100.zip. The agent communicated that interpretation before proceeding.

Pre-package checks passed: score arithmetic, unchanged original official log
hashes, unchanged frozen source, four annotated version tags, clean initial
working tree, local main equal to origin/main, and only the main worktree.
No official command was run. Archive validation is recorded in AI-LOG.md.
