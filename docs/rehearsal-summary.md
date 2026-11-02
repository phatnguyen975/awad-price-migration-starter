# Rehearsal summary

## Scope and result

The agent ran the full S0–S8 rehearsal once after the human approved G1.
All nine steps passed without a code change or a retry. This is scratch evidence,
not the official submission run. No official command has run; the human must run
every official command. G2 has not been executed, no push has occurred, and the
repository is not frozen.

Run date: 2026-11-03 in Asia/Ho_Chi_Minh. UTC traffic start:
2026-11-02T20:38:12.851Z. Main code commit during the run: `ad35c1b`.
Database: `.ia2/rehearsal/app.db`; ports: 4001/4002; seed: 20000.
Raw traffic, checks, server output, backups and ledger are under
`.ia2/rehearsal/`; state is `.ia2/state-rehearsal.json`. These files are ignored
scratch artifacts and must not be substituted for official root evidence.

## Versions verified

Worktrees were recreated from these annotated tags before the run.

| Tag | Commit |
| --- | --- |
| v1 | `2b889bde433190c17744f30d3900d38ab333a756` |
| v2 | `717724874239e236f8d6ae3417286d82130c5411` |
| v3 | `10230e3b8d3804dcf9dae8e18612b55b3ae073b1` |
| v4 | `01f6a26479df3eaeda2adaaba3df234ae0816601` |

## Step results

Traffic ranges refer to `.ia2/rehearsal/traffic-log.txt`. Check label ranges
refer to `.ia2/rehearsal/check-log.txt`. Durations come from recorded step start
and finish times; traffic also continued during the gaps between commands.
A short step can fit within one five-second traffic tick.

| Step | Result | Duration (s) | Traffic lines | Check labels and lines |
| --- | --- | ---: | --- | --- |
| S0 Baseline | PASS | 7.388 | 1–3 | S0-baseline (1–5) |
| S1 Expand | PASS | 4.581 | 6–6 | S1-expand (6–13); S1-down-test-002 (38–42) |
| S2 Dual write | PASS | 25.692 | 10–19 | S2-A-v2 (43–50); S2-both-v2 (51–58) |
| S3 Backfill | PASS | 6.424 | 22–22 | S3-before-backfill (59–66); S3-partial (79–86); S3-after-backfill (117–124) |
| S4 Read price_vnd | PASS | 25.034 | 28–36 | S4-A-v3 (127–134); S4-both-v3 (135–142) |
| S5 Rollback drill | PASS | 48.900 | 40–57 | S5-before (143–150); S5-on-v2 (151–158); S5-after (159–166) |
| S6 Point of no return | PASS | 24.795 | 63–71 | S6-A-v4 (167–174); S6-both-v4 (175–182) |
| S7 Contract | PASS | 4.608 | 75–75 | S7-backup (183–190); S7-down-test-003 (201–208); S7-after-drop (209–215) |
| S8 Finish | PASS | 30.506 | 80–87 | none |

The raw ledger contains one entry per step in `.ia2/rehearsal/ledger.md`.

## Totals and independent audit

- Traffic header count: 1; runtime share-change lines: 1, raising NEW_CLIENTS to 0.3 after both instances reached v2.
- Successful requests: 130459; error=0, contract=0, stale=0, unavailable=0.
- Rerouted attempts: 86 (permitted during rolling restarts).
- Restarts: exactly 10 down and 10 back lines, paired one instance at a time: S2=2, S4=2, S5=4, S6=2.
- All 18 required check labels and all three down-test blocks are present exactly once; each strict/null-ok policy passed.
- Backfill: STOPPED updated=5000 batches=10, DONE updated=13946 batches=28, DONE updated=0 batches=0.
- Backup via VACUUM INTO: 395 ms. Restore copy plus check: 457 ms, on this machine for this database only.
- S7 old-client endpoint probes passed on both instances: GET item/list, POST item, PATCH item, POST order; numeric price remained available.
- S8 observed at least 30 clean seconds, stopped traffic with SIGINT, waited for RESULT, then stopped both servers with SIGTERM.
- Final state records no running traffic or server pid. Official root logs and data/app.db were not created.

Final raw output (traffic lines 86–87):

```text
 315.0s FINAL ok=130459 error=0 contract=0 stale=0 unavailable=0 rerouted=86
RESULT: zero failed requests
```

The official run must reproduce one continuous run, zero failure counters,
10 down/back pairs, the share-change line, all required check labels/down-tests,
and successful endpoint probes. Request totals, rerouted counts, batch totals,
and timings vary and must be taken from the actual official run.

## Expected unusual results

S1-expand reported NULL price_vnd values: v1 still writes price alone.
S2-A-v2, S2-both-v2 and S3-before-backfill reported INCONSISTENT, as expected
from the mixed v1/v2 writer window. S3-partial reported remaining NULLs;
S3-after-backfill was plain CONSISTENT. All S4/S5 checks were CONSISTENT,
including before, during and after the rollback drill.

S6-A-v4, S6-both-v4 and the restored-copy S7-backup check reported INCONSISTENT:
v4 no longer maintains price. These results are explicitly noted in the ledger.
The down-test of 003 reconstructed price and returned CONSISTENT; after dropping
price on the live scratch database, S7-after-drop returned CONSISTENT.
No unexpected check verdict or traffic failure was observed.

## Problems and fixes

No application, migration, backfill or orchestrator defect was encountered in
this full run. No history rewrite or tag movement was required.

The pre-existing Phase 0 negative smoke output was preserved intact under
`.ia2/phase0-smoke-before-phase2/` before reset. Its deliberately induced v1
new-client failures belong to that smoke test, not this full rehearsal.
The initial S0 used the documented rehearsal-only --again option because the
saved Phase 0 state already marked S0 PASS. It still reset the scratch database
and started a new traffic log. No full-rehearsal failure was discarded.

## Commands executed

Migration steps completed successfully in order; the next step ran only after the previous step passed.

```bash
node scripts/ia2/run.js rehearsal setup
node scripts/ia2/run.js rehearsal s0 --reset --again
node scripts/ia2/run.js rehearsal s1
node scripts/ia2/run.js rehearsal s2
node scripts/ia2/run.js rehearsal s3
node scripts/ia2/run.js rehearsal s4
node scripts/ia2/run.js rehearsal s5
node scripts/ia2/run.js rehearsal s6 --go
node scripts/ia2/run.js rehearsal s7 --go
node scripts/ia2/run.js rehearsal s8
```

The agent supplied --go only in rehearsal. Official gates and official commands
remain the human's responsibility. Stop here for review before G2.
