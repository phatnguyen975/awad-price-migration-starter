---
name: ia2-run-steps
description: The step playbook (S0 to S8) for running the IA#2 zero-downtime migration, in rehearsal by the agent and in the official run by the human - what each step does, the exact command, the check labels and their policies, the pass rules, the guidance text the human gets before each step, and what to do when a step fails. Use in Phase 2 (rehearsal) and Phase 3 (official run), whenever the human asks "what do I run next", "is this step done", "why is check INCONSISTENT here", or reports an error, and before the freeze is lifted or a run is repeated, even if they do not name this skill.
---

# ia2-run-steps

The migration is run as nine steps, S0 to S8, by the orchestrator (`scripts/ia2/run.js`, built per `ia2-tooling`). The same steps run twice: the agent runs them in **rehearsal** to prove the code and the playbook, then the human runs them in **official** mode to produce the evidence that is handed in. The official run is one continuous traffic run; any failed request voids it, so rehearsal exists to make the official run boring.

Authoritative for: step order, check labels and policies, pass rules, guidance. `ia2-tooling` implements this list and must use identical labels; if the two differ, stop and ask.

## Ground rules

- **Who runs what.** Rehearsal: the agent runs every command, passing `--go` itself. Official: the agent never runs a command; it gives the command, the human types it in a terminal and says "done", and the agent reads the results. Gates S6 and S7 need the human's explicit "go" in chat, and the human types `--go`.
- **Before the first official step:** the freeze (G2) is done, the four tags exist and are pushed, `main` is clean, the rehearsal passed end to end, and the worktrees were recreated and verified (`setup`). Official `s0` deletes the database and both log files and therefore needs `--reset`.
- **One step at a time, in order.** Never start a step while the previous one has not PASSed. Never edit code, migrations or scripts during a run. Never touch `data/app.db` directly: no SQL by hand, no manual restart of an instance.
- **After every step**, the agent: reads the orchestrator's block (`PASS`/`FAIL`), opens the new part of `check-log.txt` and `traffic-log.txt`, compares with the pass rules below, reads the new ledger entry, and tells the human the result and the next command. In official mode it then commits `docs/ledger.md` by name (`docs(ledger): <step>`) and nothing else.
- **Expected-but-odd results are written into the ledger notes** (see "Check policies"), not hidden.

## What the agent tells the human before each step

Use these five headings, in the human's language, short and concrete.

1. **Purpose** - what this step changes and which idea it demonstrates.
2. **Command** - the exact line to type, from the repo root.
3. **Expect** - what will print, which log lines will appear (`down`/`back`, `new clients → 0.3`, the check verdicts), and roughly how long it takes.
4. **Done when** - the pass rules below, in plain words.
5. **If it goes wrong** - stop, do not retry, tell the agent what printed.

Example for S3:

- Purpose: fill `price_vnd` for the old rows while traffic keeps running, in small batches, so the new column can later be read.
- Command: `node scripts/ia2/run.js official s3`
- Expect: three check blocks and three backfill runs. The first run stops after 10 batches (`STOPPED updated=5000 batches=10`), the second finishes (`DONE updated=<n> ...`), the third does nothing (`DONE updated=0 batches=0`). The check before may say `INCONSISTENT`; the last one must say exactly `CONSISTENT`. About 30 seconds.
- Done when: the last check is plain `CONSISTENT`, the third run updated 0 rows, and no failure line appeared in the traffic log.
- If it goes wrong: stop and paste the output; do not run the backfill by hand.

## The playbook

Commands are `node scripts/ia2/run.js <rehearsal|official> <step>`. Durations are for the official settle time of 10 seconds per restart.

| Step          | Command      | What happens                                                                                                                                   | Pass rules                                                                                                                                                        | About |
| ------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **S0**        | `s0 --reset` | Clean start: database created and seeded (20000 rows) from `../ia2-v1`, instances A and B on v1, traffic starts with `NEW_CLIENTS` at 0        | `/health` is 200 on both; exactly one `=== traffic start ... new clients 0` header; first tick has all failure counters 0                                         | 30 s  |
| **S1**        | `s1`         | Migration 002 applied to the live database from `../ia2-v2`; then the down-tests of 001 and 002 on scratch databases                           | `migrate` printed `applied 002_add_price_vnd`; log clean; check-log has the `DOWN-TEST 001` and `DOWN-TEST 002` blocks                                            | 40 s  |
| **S2**        | `s2`         | A restarted on v2, then B on v2; then `NEW_CLIENTS` raised to 0.3                                                                              | each restart: exactly one `down` and one `back` line for that instance; no failure lines; counters 0; a `new clients → 0.3` line appears                         | 50 s  |
| **S3**        | `s3`         | Backfill as in the example above                                                                                                               | last check plain `CONSISTENT`; third run `updated=0`; log clean                                                                                                   | 30 s  |
| **S4**        | `s4`         | A then B restarted on v3 (they now read `price_vnd`)                                                                                           | one `down`/`back` pair each; `CONSISTENT` after each; log clean                                                                                                   | 50 s  |
| **S5**        | `s5`         | The rollback drill: check; A and B back to v2; check; A and B forward to v3; check                                                             | `CONSISTENT` in all three checks; four `down`/`back` pairs; log clean for the whole stretch                                                                       | 110 s |
| **S6** (gate) | `s6 --go`    | A then B restarted on v4: the point of no return, `price` is no longer written                                                                 | one pair each; log clean; `INCONSISTENT` is expected (below)                                                                                                      | 50 s  |
| **S7** (gate) | `s7 --go`    | Backup (`VACUUM INTO`) and restore test; down-test of 003 on the backup copy; migration 003 on the live database; probe of every item endpoint | the guard in 003 did not fire; `applied 003_drop_price`; `S7-after-drop` plain `CONSISTENT`; every probe reply has a numeric `price`; log clean                   | 50 s  |
| **S8**        | `s8`         | 30 s of clean traffic, then traffic is stopped with SIGINT, then both servers                                                                  | last log line `RESULT: zero failed requests`; exactly one traffic header in the file; 10 `down` and 10 `back` lines in total (2 in S2, 2 in S4, 4 in S5, 2 in S6) | 50 s  |

A full official run takes about 8 minutes of traffic. After S8, tell the human the totals (requests ok, restarts seen, backup and restore times from S7) for `MIGRATION.md`.

## Check policies and expected results

The orchestrator applies these per label. `strict` = verdict exactly `CONSISTENT`; `null-ok` = verdict starts with `CONSISTENT`; `any` = record only (the verdict is the last line of the check output).

| Label                                  | Policy  | What to expect                                                                                                                                                                                         |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `S0-baseline`                          | strict  | `CONSISTENT`                                                                                                                                                                                           |
| `S1-expand`                            | null-ok | `CONSISTENT, but N rows have no price_vnd yet ...`                                                                                                                                                     |
| `S2-A-v2`, `S2-both-v2`                | any     | `INCONSISTENT` is normal: while B still ran v1 it wrote `price` alone over rows v2 had already written; the backfill repairs them                                                                      |
| `S3-before-backfill`, `S3-partial`     | any     | `INCONSISTENT` or `CONSISTENT, but ...`                                                                                                                                                                |
| `S3-after-backfill`                    | strict  | `CONSISTENT`                                                                                                                                                                                           |
| `S4-A-v3`, `S4-both-v3`                | strict  | `CONSISTENT`                                                                                                                                                                                           |
| `S5-before`, `S5-on-v2`, `S5-after`    | strict  | `CONSISTENT`: v3 kept writing both columns, so v2 can take over                                                                                                                                        |
| `S6-A-v4`, `S6-both-v4`                | any     | `INCONSISTENT` is the expected effect of the point of no return: v4 stops writing `price`, so any repriced row disagrees. Note it in the ledger; it is the evidence for why v2 and v1 cannot come back |
| `S7-backup`                            | any     | check of the restored copy; same state as S6, so `INCONSISTENT`                                                                                                                                        |
| `S1-down-test-002`, `S7-down-test-003` | strict  | `CONSISTENT` after the down                                                                                                                                                                            |
| `S7-after-drop`                        | strict  | `CONSISTENT`                                                                                                                                                                                           |

`DOWN-TEST 001` has no check (the tables are gone); its evidence is the `migrate`, `migrate:down` and `migrate:status` outputs. A strict label that is not met is a FAIL; an `any` label never fails by itself.

## Failures

Stop at the first sign of trouble; do not try to repair a run in place.

- **Orchestrator exit code 2** (a precondition did not hold, nothing changed): fix the precondition (worktree not matching its tag, port taken, previous step not PASS) and run the same command again.
- **Any other FAIL, a failure line in the traffic log, a strict check not met, or an interrupted command:** the official run is void. Run `status`, move `traffic-log.txt` and `check-log.txt` into `.ia2/failed-<n>/` (ignored by git) so they can be diagnosed, and reproduce in rehearsal. Never edit a log, never "continue anyway".
- **If the cause is the environment or the way the step was run** (a terminal closed, a port in use): redo the official run from `s0 --reset` with the same tags.
- **If the cause is a defect in the code, a migration or a script:** do not push on. Tell the human, and only with the human's explicit approval reopen the freeze: fix per `ia2-git-flow` section 5, recreate the tags, force-push only the moved tags, repeat the whole rehearsal until it passes, freeze again (G2), then redo the official run from `s0 --reset`.
- If `migrate` for 003 stops with `NOT NULL constraint failed: _guard_price_vnd.x`, some row still has no `price_vnd`: that is a defect in the backfill or in the order of steps, not a transient error. The migration was rolled back and the database is unchanged; treat it as the previous case.

## Rehearsal

The agent runs `setup`, then either `all` or each step with `--go` and `--reset` where needed, in the rehearsal environment (scratch database, ports 4001/4002, logs under `.ia2/rehearsal/`). It repeats the whole sequence after every fix. It then writes `docs/rehearsal-summary.md`: a table of steps with result, key log lines and timing; the counts to expect in the official run (the S8 totals); every problem found and how it was fixed. Only after a clean full pass does it ask for the freeze (G2).

## Do not

Run `official` commands as the agent; run a step twice; skip a step; pass `--go` for the human; edit `traffic-log.txt` or `check-log.txt`; restart an instance by hand during a run; commit anything except `docs/ledger.md` during the official run (the logs are committed once, after S8).
