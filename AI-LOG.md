# AI log

## 2026-11-03 — Phase 0 preflight and instructions

```
Tool: Codex
Asked for: Read the IA2 instructions, complete Phase 0 setup and tooling, smoke test, and stop at G0.
Kept: Machine and repository checks; upstream remote configuration; this log entry.
Changed: The scaffolding allowlist includes .gitattributes after the human explicitly confirmed it.
Rejected: nothing
By hand: The human supplied the instruction files and confirmed the additional .gitattributes file. No official command has been run.
```

HEAD equals upstream/main at 2b889bde433190c17744f30d3900d38ab333a756.
Node v24.16.0, Linux, Git 2.43.0, GitHub authentication, four free ports,
scratch migration and health probe, clean SIGTERM shutdown, sibling worktree
creation/removal, and all four starter tests passed. HTTP tests require execution
outside the restricted sandbox. No rehearsal or official run has occurred yet.

## 2026-11-03 — Runtime traffic control

```
Tool: Codex
Asked for: Apply the exact NEW_CLIENTS_FILE patch described in ia2-tooling.
Kept: The readFileSync import, mutable NEW_CLIENTS value, and the prescribed runtime polling block.
Changed: nothing
Rejected: nothing
By hand: nothing
```

The scratch smoke test logged exactly one `new clients → 0.3` change.
Before that change, all failure counters were zero through 20.3 seconds.
After the change, v1 rejected the new-client contract as expected by the skill:
711 contract failures, with error/stale/unavailable all zero. This is a deliberate
negative smoke test, not a successful full migration rehearsal or official run.
Raw evidence: `.ia2/rehearsal/traffic-log.txt`, lines 2–15.

## 2026-11-03 — Orchestrator and Phase 0 smoke test

```
Tool: Codex
Asked for: Implement the orchestrator, smoke test Phase 0, and stop at G0.
Kept: scripts/ia2/run.js with mode isolation, worktree checks, ordered steps, rolling deployment, check policies, ledger, backups, down-tests, and probes.
Changed: During review, port binding errors were classified as precondition failures; step names and command summaries were added to output.
Rejected: nothing
By hand: The human approved sandbox escalation requests. No official command has been run.
```

The agent ran the smoke rehearsal on a scratch database, using ports 4001/4002
and output under `.ia2/`. Setup verified v1 and reported missing v2–v4.
Down-test 001 applied and reverted the schema; raw output was copied to
`.ia2/preflight/down-test-001.txt` (lines 1–11) before the required S0 reset.
S0 used IA2_SEED=2000 and passed; `S0-baseline` was CONSISTENT
(`.ia2/rehearsal/check-log.txt`, lines 1–5). Teardown stopped traffic with SIGINT
before stopping both servers with SIGTERM. A missing-v2 guard returned exit 2.
S1–S8 have not been exercised because v2–v4 do not exist yet.
Every official command must be run by the human; none has been run so far.

Tooling disclosure for the later MIGRATION.md: the traffic patch allows the
new-client share to change during one continuous run; the orchestrator encodes
the playbook and records raw checks and per-step ledger evidence. Both belong
to the `chore(tooling): add orchestrator and traffic control` commit.

Final verification: all four original tests passed again, syntax and whitespace
checks passed, and status reported traffic and both rehearsal servers stopped.
Only the prescribed traffic patch and the new scripts/ia2 directory change
executable code. Phase 0 is ready for G0 review; no G0 approval has been given,
no push has occurred, and Phase 1 has not started.

## 2026-11-03 — G0 approval and Phase 1 inventory

```
Tool: Codex
Asked for: Complete inventory, build migrations and v2/v3/v4 with tests and smoke runs, and stop at G1.
Kept: docs/inventory.md based on the starter files, git history, and observed Phase 0 checks.
Changed: nothing
Rejected: nothing
By hand: The human approved G0 and authorized Phase 1 in chat.
```

All required starter files were read. No unexpected difference was found.
The earlier smoke rehearsal used scratch databases; no official command has run.

## 2026-11-03 — Expand migration 002

```
Tool: Codex
Asked for: Add migration 002 with its down migration and verify it before committing.
Kept: Nullable INTEGER price_vnd with positive CHECK and no default; down drops only the new column.
Changed: nothing
Rejected: nothing
By hand: nothing
```

On scratch expand.db, migrate applied 001 and 002, seed inserted 2000 rows,
down reverted 002, status showed 002 pending, and check ended CONSISTENT.
All four original tests passed with 002 present, demonstrating v1 compatibility.
Lock: the runner takes SQLite BEGIN IMMEDIATE, reserving the writer; readers
continue under WAL. Duration: one ALTER statement and constraint validation
(proportional to existing rows), not an assumed fixed time. Running v1 expects
only price, which remains available. The down loses price_vnd data.

## 2026-11-03 — v2 dual write

```
Tool: Codex
Asked for: Build v2 and pass tests and smoke traffic before tagging.
Kept: Shared money helpers, input validation for both client shapes, dual writes on POST/PATCH, price-based reads, and six tests retaining the original price assertions.
Changed: nothing
Rejected: nothing
By hand: nothing
```

Six tests passed. Eight seconds of scratch traffic at NEW_CLIENTS=0.3 completed
4115 requests with zero failures. The check reported 1341 NULLs and zero
disagreement, expected before backfill. Evidence: `.ia2/build/v2-traffic.txt`
and `.ia2/build/v2-commands.txt`. Only src/ and test/ change application behavior.

## 2026-11-03 — Resumable backfill

```
Tool: Codex
Asked for: Implement and verify batched backfill before building v3.
Kept: 500-row transactions, 50ms pauses, busy retries, explicit no-v1 flag, check.js selection predicate, progress and DONE/STOPPED summaries.
Changed: The stored value uses the shared toVnd helper registered as a SQLite function. NULL source prices cause an explicit refusal, following the skill's stop-and-report requirement, rather than a silent skip.
Rejected: nothing
By hand: nothing
```

Scratch tests passed: missing confirm flag exits 2; intentional stale values
produce INCONSISTENT; stop-after 3 reports STOPPED updated=1500 batches=3;
resume completes; third run reports DONE updated=0 batches=0; check is CONSISTENT.
A deliberately inserted NULL-source row caused exit 2 and remained visible to
check, without looping. Under v2 traffic for 14 seconds, backfill completed and
6336 requests succeeded with zero failures; final check was CONSISTENT.
Evidence: `.ia2/build/backfill-checks.txt`, `.ia2/build/backfill-traffic.txt`.
No v1 process was running. All databases and logs were scratch artifacts.

## 2026-11-03 — v3 reads price_vnd

```
Tool: Codex
Asked for: Build v3 with tests and smoke traffic before tagging.
Kept: price_vnd SELECTs and derived legacy replies; orders remain in thousands; writes still maintain both columns. A disagreement test proves item/list/order reads use price_vnd.
Changed: nothing
Rejected: nothing
By hand: nothing
```

Seven tests passed, including the original total=97 assertion. Eight seconds
of scratch traffic at NEW_CLIENTS=0.3 completed 3636 requests with zero failures.
The backfilled scratch database ended CONSISTENT. Evidence:
`.ia2/build/v3-commands.txt`, `.ia2/build/v3-traffic.txt`.

## 2026-11-03 — v4 new-column storage only

```
Tool: Codex
Asked for: Build v4 with tests and smoke traffic before tagging.
Kept: INSERT/UPDATE use only price_vnd; legacy API price is derived. Tests check NULL or unchanged legacy storage when that column exists and work after it is dropped.
Changed: The v3 disagreement fixture now conditionally creates legacy disagreement so the test also works without the old column.
Rejected: nothing
By hand: nothing
```

Seven tests passed with 001+002. Both eight-second scratch smoke runs at 30%
new clients had zero failures: 4012 requests before drop and 3802 after drop.
Before drop, check deliberately returned INCONSISTENT (676 stale legacy rows),
the expected point-of-no-return behavior. After a one-off drop on a separate
scratch database, check was CONSISTENT and the unchanged v4 served traffic.
Migration 003 did not exist yet and was not added to this version commit.
Evidence: `.ia2/build/v4-commands.txt`, `.ia2/build/v4-traffic.txt`,
`.ia2/build/v4-dropped-commands.txt`, `.ia2/build/v4-dropped-traffic.txt`.

## 2026-11-03 — Contract migration 003 and build matrix

```
Tool: Codex
Asked for: Add guarded migration 003 and down migration, verify every version and stop at G1.
Kept: Transactional NULL guard, drop of price, and explicitly lossy down SQL reconstructing thousands from price_vnd.
Changed: nothing
Rejected: nothing
By hand: The human approved the required sandbox escalation requests. No official command has run.
```

On scratch contract.db, the intentional missing-backfill case failed with
NOT NULL constraint failed: _guard_price_vnd.x; the whole transaction rolled
back, price remained present, the guard table was absent, and 003 remained
pending. After backfill from the v3 worktree, up/check/down/check/up all passed.
The down restored price and check returned CONSISTENT. Actual 003 traffic on v4
completed 3764 requests with zero failures and a final CONSISTENT verdict.
Evidence: `.ia2/build/contract-checks.txt` lines 1–92 and
`.ia2/build/contract-traffic.txt` lines 2–5.

Lock: BEGIN IMMEDIATE reserves the SQLite writer for the guard and ALTER.
Duration: the transaction includes the NULL scan and table rewrite for DROP
COLUMN, so it scales with row count; no fixed production duration is claimed.
WAL readers can continue; concurrent writes may wait within busy_timeout.
Every running instance must be v4, which expects only price_vnd. The down is
lossy and does not recover original sub-dong float digits.

All four worktrees were recreated and verified against their tags. Final test
matrix passed: v1=4, v2=6, v3=7, v4=7 (001+002), main=7 (001+002+003).
Raw matrix evidence: `.ia2/build/matrix.txt` lines 1–101. Down-test 002 was also
repeated through the orchestrator using its designated worktrees; its labeled
check was CONSISTENT. No application file was changed in this migration commit.
Phase 1 is ready for G1 review; G1 has not been approved. The full S0–S8
rehearsal, freeze, push, and official run have not started. All verification in
this phase was performed by the agent on scratch databases and ports.

## 2026-11-03 — G1 approval and rehearsal start

```
Tool: Codex
Asked for: Run rehearsal S0–S8, fix and repeat until clean, write the rehearsal summary, and stop before G2.
Kept: Worktree recreation and verification; a fresh scratch rehearsal seeded with 20000 items.
Changed: nothing
Rejected: nothing
By hand: The human approved G1 and authorized Phase 2 in chat.
```

The old Phase 0 scratch smoke output was copied intact to
`.ia2/phase0-smoke-before-phase2/` before reset. S0 used the rehearsal-only
--again option because the previous smoke state already marked S0 PASS.
No official command has run; all official commands remain the human's role.

## 2026-11-03 — Full rehearsal S0–S8 and summary

```
Tool: Codex
Asked for: Complete rehearsal, fix and repeat until clean, document the result, and stop before G2.
Kept: The first full S0–S8 rehearsal, raw scratch logs and ledger, independent log audit, and docs/rehearsal-summary.md.
Changed: nothing
Rejected: nothing
By hand: The human approved the required sandbox escalation requests; every rehearsal command was run by the agent.
```

All nine steps passed on the first full rehearsal; no defect, code fix, retry,
history rewrite or tag movement was needed. The agent used a scratch database,
ports 4001/4002, and logs only under `.ia2/rehearsal/`. All official commands
remain for the human; none has been run. No root evidence logs or data/app.db
were created.

Independent audit verified 18 check labels, three down-tests, one continuous
traffic header, one share-change line, 10 sequential down/back pairs and zero
failure counters. Final traffic: 130459 successful requests, rerouted=86,
RESULT: zero failed requests. The traffic ran about 315 seconds; step timestamps
span 317.130 seconds including command gaps. Backup took 395ms; restore copy
and check took 457ms. Expected INCONSISTENT checks at S2/S3-before/S6/S7-backup
are preserved and explained in the raw ledger and summary. All strict checks
passed. Traffic stopped with SIGINT before both servers stopped with SIGTERM.

Evidence: `.ia2/rehearsal/traffic-log.txt` lines 1–87 (FINAL/RESULT at 86–87),
`.ia2/rehearsal/check-log.txt` lines 1–215, `.ia2/rehearsal/ledger.md`, and
`.ia2/state-rehearsal.json`. The summary records per-step durations and ranges,
actual command sequence, tag SHAs, expected official counts, and the preserved
Phase 0 negative smoke output. G2 has not been performed; no push has occurred.

## 2026-11-03 — G2 freeze and initial push

```
Tool: Codex
Asked for: Perform the ia2-git-flow freeze checks, then push main and annotated tags v1–v4 to the fork.
Kept: Freeze verification, fresh worktree recreation, complete test matrix, authorized pushes and the G2 ledger entry with all four tag SHAs.
Changed: nothing
Rejected: nothing
By hand: The human explicitly approved G2 and pushing in chat, and approved required sandbox escalation requests.
```

At clean main 9363c8262da8528eb9fd593249f63bc4d8ebe89d, all freeze conditions
passed. Upstream was fetched; v1 still equals upstream/main. No version tag was
already present on the fork before these authorized pushes. Exactly four local
tags are annotated; their subjects, ancestry and the commit sequence passed.
The four worktrees were recreated and verified, and tests passed with counts
4/6/7/7/7 for v1/v2/v3/v4/main. Raw verification is in `.ia2/freeze-check.txt`.
The previous rehearsal was run by the agent only on scratch databases and ports.

The agent ran git push origin main successfully (2b889bd..9363c82), followed by
git push origin v1 v2 v3 v4 successfully (four new tags). docs/ledger.md records
the frozen tag SHAs and the human's gate approval. Code, scripts, migrations,
tests and version tags are now frozen. No official command has run; all official
commands will be run by the human. No force-push or history rewrite was used.

## 2026-11-03 — Official setup and S0 validation

```
Tool: Codex
Asked for: Guide the official run step by step and verify the human's completed setup and S0.
Kept: The setup/S0 guidance, read-only validation of state, raw logs and the orchestrator's S0 ledger entry.
Changed: nothing
Rejected: nothing
By hand: The human ran official setup and node scripts/ia2/run.js official s0 --reset, then reported completion.
```

S0 PASS: A/B run v1 on 3001/3002, one traffic header starts with new clients 0,
S0-baseline is CONSISTENT with exit 0, and all failure counters are zero.
Step evidence: traffic-log.txt lines 1–3, check-log.txt lines 1–5,
docs/ledger.md lines 43–48. Subsequent traffic remained clean when inspected.
The agent ran no official command, did not touch the live database, and did not
write or edit either root log. The rehearsal was run earlier on scratch data.

## 2026-11-03 — Official S1 validation

```
Tool: Codex
Asked for: Verify the human's completed S1 and provide the next official step.
Kept: Read-only audit of official state, expand check, down-tests 001/002, traffic and the S1 ledger entry.
Changed: nothing
Rejected: nothing
By hand: The human ran node scripts/ia2/run.js official s1 and reported completion.
```

S1 PASS: both instances remain v1. S1-expand reports CONSISTENT with remaining
NULL price_vnd values, as expected before backfill. Both down-tests reverted
their migrations on separate scratch databases; S1-down-test-002 is CONSISTENT.
Evidence: traffic-log.txt line 26, check-log.txt lines 6–42,
docs/ledger.md lines 50–55. All traffic failure counters remained zero through
the read-only audit. The checker reads counts in separate queries under live
traffic, so the rows count and NULL count may differ by a concurrent insertion.
The agent ran no official command and did not write either raw log or touch the
live database. The earlier rehearsal ran on scratch databases.

## 2026-11-03 — Official S2 validation

```
Tool: Codex
Asked for: Verify the human's completed S2 and guide the next step.
Kept: Read-only audit of the two rolling restarts, runtime share change, check results and S2 ledger entry.
Changed: nothing
Rejected: nothing
By hand: The human ran node scripts/ia2/run.js official s2 and reported completion.
```

S2 PASS: both instances run v2. Traffic lines 54–63 contain exactly one down/back
pair for each instance and the share change to 0.3 after both recovered.
Check-log.txt lines 43–58 contain the two expected INCONSISTENT verdicts;
docs/ledger.md lines 57–62 explicitly explain them. All traffic failure counters
remained zero through the audit. The agent ran no official command and changed
neither the raw logs nor the live database. Rehearsal was on scratch databases.
