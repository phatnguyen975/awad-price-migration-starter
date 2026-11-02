# Rubric audit

Audited on 2026-11-03 against the unedited docs/ia2-requirements.md. Claims are
based on implementation at the frozen tags, the original checker/traffic
logic, human-run official evidence and an independent scratch replay.
Machine-readable results: docs/evidence-audit.json. This is a self-assessment,
not a statement of an awarded grade or an oral-exam result.

## Criterion-by-criterion findings

| Criterion | Highest evidenced band | Conditions checked against actual artifacts | Proposed claim |
| --- | --- | --- | ---: |
| 1. Plan | 17–20 | MIGRATION.md has S0–S8 rows, schemas, A/B mixed states, concrete undo procedures/explicit irreversibility and conditional compatibility. S6 is named as the direct v1/v2 rollback boundary, distinct from S7 drop. Tag/migration inventory matches Git. | 19/20 |
| 2. Expand/dual write | 17–20 | 002 is a separate commit from v2. v1 continues serving after expand (check 6–13; clean traffic before v2). v2 SQL and bound parameters write both columns on POST and PATCH, confirmed by its six tests. Responses retain price and add priceVnd. All three up/down pairs exist; actual down outputs are check 14–42 and 195–212. | 20/20 |
| 3. Backfill | 13–15 | Source limits batches to 500, commits each independently, pauses 50ms and retries busy locks. Selection repairs stale non-NULL values and NULLs. Both official instances are v2 before it runs (ledger 57–69). Actual stop/resume/zero-repeat and immediate CONSISTENT are check 67–130; traffic stays running at 80–81. | 15/15 |
| 4. Zero failures | 17–20 | One official header at traffic 2; NEW_CLIENTS rises to 0.3 at 63 after both v2 restarts; one continuous file through 003 and S8. Exactly ten paired down/back transitions, never simultaneous outages. All ticks/final have four zero failure counters. FINAL=421762 ok, RESULT zero at 199–200. The disclosed patch does not alter counters or validation. | 20/20 |
| 5. Way back | 13–15 | Actual v3→v2→v3 sequence is recorded in ledger 78–83, traffic 117–134 (four restarts), check 147–170 (all three strict verdicts). MIGRATION.md explains why v3 dual writing makes this safe and why v4→v2 is unsafe (check 171–186). | 15/15 |
| 6. Contract | 9–10 | Both instances reached v4 before 003 (ledger 85–97). All six v4 prepared SQL statements avoid the old price column. 003 drops only after a NULL guard. Post-drop original check lists id/name/price_vnd and CONSISTENT (213–219). Official probes passed; independent replay logs actual numeric-price responses for every item endpoint on both ports (752–761), and later traffic is clean. | 10/10 |
| **Total** | | **19+20+15+20+15+10** | **99/100** |

The one-point reserve on the plan is a conservative within-band judgment:
S2 reversal and S3 abandonment are specified using tested deployment/down
primitives, but not every combined undo path was separately executed under load.
The rubric does not require every combination to be exercised. No other
implementation requirement is knowingly absent, so there is no evidentiary basis
for deducting whole bands merely because AI helped or because logs are generated
by a real tool. A grader can reasonably choose another point within a band.

## Why the evidence is more than printed PASS text

1. The course scripts/check.js, seed.js, migrate.js, README and migration 001
   are byte-equivalent in Git to v1. The checker actually queries SQLite.
2. Official log bytes match their first committed versions at `3a682e3`.
   SHA256 traffic: `f87c7d1c28ff36a4fff33c66698d7043e193e4bc0eac530cf1d792f7f87bccdc`.
   SHA256 checks: `4feb4671d403a2ad8edc397262160f863669cd64492302725fc78d337d67a9fc`.
   Hashes prove stability since that commit, not authorship in isolation.
3. The human ran each official command and reported completion; the agent read
   new raw blocks and state before advancing. Per-step ledger/AI log commits
   preserve the sequence. G3a/G3b approvals were separate chat decisions.
4. Tagged test suites exercise HTTP responses and database contents, including
   both writes, new-column reads and v4 non-writing of the old column. They
   were run again from a fresh clone (replay log 12–129), not inferred from tags.
5. The independent replay ran actual migrations and servers on a separate DB,
   sent actual requests under load, checked exit codes and raw results, and
   printed ten actual post-drop HTTP responses. It bypassed the orchestrator.
   Its final 81009 successful requests and zero failures appear at 784–786;
   docs/replay-traffic-log.txt preserves that replay's raw traffic as well.

Official log locations are traffic-log.txt (200 lines), check-log.txt (219 lines)
and docs/ledger.md (S0–S8 at 43–104). Replay locations have a docs/ prefix and
are supplemental; they are not substituted into the official root logs.

## Limits, unusual results and rubric interpretation

- Expected INCONSISTENT at S2 and S6/S7-backup is disclosed, not removed. S3-before
  in the official run had NULLs but no remaining stale hot rows; the strict
  post-backfill check is what authorizes V readers.
- Runtime NEW_CLIENTS_FILE is a disclosed tooling extension. The supplied rubric
  neither explicitly bans nor approves modifications to traffic.js. It meets the
  stated continuous-run/client-share behavior, but final interpretation belongs
  to the course. This audit cannot promise acceptance of an unstated rule.
- The direct Node traffic invocation is the same program referenced by npm run
  traffic in package.json; it uses explicit LOG/TARGETS and unchanged failure
  logic. It is not a separate synthetic counter generator.
- Official probes assert responses but do not log their bodies; replay bodies
  supplement this. Logs do not cryptographically prove every action, nor does
  a finite randomized workload prove uptime under all possible loads.
- The 003 down is lossy. PostgreSQL was not tested. Backup/restore timings are
  machine-specific and restore means copy plus check, not production failover.
- Oral understanding and final human ownership are not machine-verifiable.
  docs/explain.md was provided and the human was asked for an explanation.
- At this audit, G4 and zip creation remain pending; do not claim the zip exists.

## AI-LOG review

The log has entries for instructions/preflight, traffic patch, inventory, each
migration/version/backfill, G0/G1/G2, rehearsal, each official step, and G3a/G3b.
It distinguishes human-run official commands from agent-run scratch checks.
Historical entries saying a gate/run had not yet happened are snapshots, not
current-status statements. Its early version evidence under .ia2 is ignored
scratch material; the committed official/replay evidence is the grading basis.

A supplemental Phase 4 entry records the S3 ad hoc audit parser error: it first
split the closing header delimiter incorrectly, then was corrected to read
through the exit line. The actual S3 checker and official run never failed and
no root log was edited. This avoids hiding an assistant verification mistake.
