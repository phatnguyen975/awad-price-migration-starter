# Self-assessment — IA#2

**Submitted by:** 23127449 — Nguyễn Tấn Phát

**Total I claim:** 99/100

Identity was confirmed by the human in chat on 2026-11-03. This is an
assessment of the supplied rubric's six criteria, not a guaranteed awarded mark.
The independent audit and limitations are in docs/rubric-audit.md.

| Criterion | Max | I claim | Evidence |
| --- | ---: | ---: | --- |
| The plan | 20 | 19 | MIGRATION.md, Plan (S0–S8 schema, A/B and mixed versions, concrete undo/limits, compatibility); Point of no return; four annotated tags; docs/ledger.md 43–104. One point reserved because some reverse combinations are reasoned from the schema and tested primitives rather than all individually demonstrated under traffic. |
| Expand and dual write | 20 | 20 | 002 up/down, commit 1cf0c07 separate from v2; v2:src/app.js 44–45,69,84 dual-writes POST/PATCH; v2:test/app.test.js storage assertions; check-log.txt 6–42 (v1 on expand and down-tests 001/002), 195–212 (down-test 003); traffic-log.txt 54–63. |
| Backfill | 15 | 15 | scripts/backfill-price-vnd.js 6–9,23–55 (guard, stale/NULL predicate, short batches, pause); docs/ledger.md 57–69 (both v2 before backfill); check-log.txt 67–130 (5000 stopped, 15585 resumed, CONSISTENT immediately, zero on repeat); traffic-log.txt 80–81. |
| Zero failed requests | 20 | 20 | traffic-log.txt 1–200: one header at 2, share 0.3 at 63, ten visible down/back pairs, FINAL/RESULT at 199–200; error/contract/stale/unavailable all zero. Original failure logic unchanged. The NEW_CLIENTS_FILE extension is disclosed in MIGRATION.md and AI-LOG.md. Independent replay: docs/replay-check.log 784–786 and docs/replay-traffic-log.txt. |
| The way back | 15 | 15 | docs/ledger.md 78–83; traffic-log.txt 117–134 (v3→v2→v3, four restarts under traffic); check-log.txt 147–170 (CONSISTENT before/during/after); MIGRATION.md, Rollback drill and Point of no return explain safe/unsafe rollbacks. |
| Contract | 10 | 10 | v4:src/app.js 42–50,69–85,100–105 names no legacy price column in SQL; docs/ledger.md 85–97 shows v4/v4 before drop; 003 guard/drop; check-log.txt 213–219 lists only id/name/price_vnd and CONSISTENT; traffic-log.txt 182–200 stays clean; actual post-drop legacy HTTP responses in docs/replay-check.log 752–761. |
| **Total** | **100** | **99** | Sum of the six claims above. |

### What I did not manage

I have not demonstrated every possible undo combination under traffic. The
measured rollback is v3→v2→v3, not a generic guarantee of any version rollback.
The 003 down is deliberately lossy. Official S7 records successful response
assertions in the ledger rather than every response body; the independent
scratch replay supplies actual bodies as supplementary evidence. The workload
is sampled and bounded, not a proof of uptime under all loads. PostgreSQL was
not run; its lock discussion is a design comparison.

The traffic generator has a disclosed minimal NEW_CLIENTS_FILE extension to
change the client share without restarting the continuous process. No counter,
validation, RESULT logic or raw official log was changed. The supplied rubric
does not explicitly prohibit or authorize this extension; the grader decides
its acceptability. I do not claim unmodified traffic tooling or official
approval of that patch by the course.

No listed implementation criterion is knowingly absent. Human review and oral
understanding remain the student's responsibility. G4 approval and zip creation
are pending; the submission artifact has not been created yet.

### What I would do differently

Agree on the runtime client-share control interface with the course before the
run, and keep structured response-probe transcripts alongside the step ledger.
