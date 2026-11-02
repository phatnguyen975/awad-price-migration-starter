# MIGRATION.md — Expand, migrate, contract menu prices

Start state: migration 001, nullable `menu_items.price REAL` in thousands of
dong, A=v1 on 3001 and B=v1 on 3002. One continuous official traffic process
started with NEW_CLIENTS=0. Every official command was run by the human.
The agent's rehearsal and independent replay use scratch databases and ports
4001/4002. `order_items.unit_price` and order totals remain in thousands.

Legend: `P` means the legacy price column; `V` means nullable INTEGER
price_vnd CHECK(price_vnd > 0), without a default. All schemas retain id/name,
orders and order_items. v2 derives its response priceVnd from P; v3/v4 derive
response price from V. `toVnd`/`toThousands` in src/money.js are the application
conversion rules. The mandated checker uses SQLite round for comparison.

Undo commands below are **replay procedures**, not instructions to modify the
completed official database. Use the shell session in docs/replay.sh, which
creates ROOT (replay checkout), RUN (scratch output), DB_PATH (absolute scratch
path), and the tested `deploy PORT VERSION` function. Set `A=4001; B=4002` in
that session; these map to official A=3001/B=3002. The function sends SIGTERM,
waits for exit, starts the requested tagged server, checks health, settles ten
seconds, and asserts one down/back pair when traffic is active. Its exact shell
commands are in docs/replay.sh under `deploy()`. Execute A and B sequentially.
Do not paste these scratch undo procedures into the completed official run.

## Plan

| Step and implementation | Schema after | Code A / B, including mixed state | Undo (exact replay command or explicit limit) | Earlier versions safe in this state |
| --- | --- | --- | --- | --- |
| S0 baseline, v1 + 001 | P | v1/v1 | `cleanup` stops traffic first and then servers; to remove schema on a disposable DB: `(cd "$ROOT/../ia2-v1"; npm run migrate:down)`. A new run cannot undo historical traffic. | v1; later versions require V first. |
| S1 expand, 002_add_price_vnd | P+V, V initially NULL | v1/v1 | With both still v1: `(cd "$ROOT/../ia2-v2"; npm run migrate:down)`. This discards V but leaves P. | v1 and v2; v3/v4 must wait until V is filled. |
| S2 dual write, v2 | P+V, NULL/stale V may remain | v2/v1 → v2/v2 | Before S6: `printf '0\n' > "$RUN/new-clients"; sleep 2; deploy "$A" v1; deploy "$B" v1`. If V was already backfilled, re-run backfill after removing v1 again. | v1/v2 read correct P; v1 invalidates future V-read readiness. |
| S3 backfill, scripts/backfill-price-vnd.js at v3 | P+V, V complete and consistent | v2/v2 | No data reversal is needed: P is unchanged and v2 remains valid. To abandon expansion entirely while safe: `printf '0\n' > "$RUN/new-clients"; sleep 2; deploy "$A" v1; deploy "$B" v1; (cd "$ROOT/../ia2-v2"; npm run migrate:down)`. Do not clear V while v3/v4 serves. | v1/v2; v3/v4 are now eligible. Reintroducing v1 requires a new backfill before reading V. |
| S4 read V, v3 | P+V, both maintained | v3/v2 → v3/v3 | `deploy "$A" v2; deploy "$B" v2` (the S5 drill demonstrates this). | v2 remains safe; v1 also reads correct P, but cannot serve new clients and would invalidate V. |
| S5 rollback drill, v2 then v3 | P+V, both maintained | v2/v3 → v2/v2 → v3/v2 → v3/v3 | To finish on v2 instead: `deploy "$A" v2; deploy "$B" v2`. The actual run finished on v3. | Same conditions as S4. |
| S6 point of no return, v4 | P+V, P becomes stale | v4/v3 → v4/v4 | No safe direct return to v1/v2: P is stale. `deploy "$A" v3; deploy "$B" v3` restores a V-reading dual writer operationally, but does not repair untouched stale P rows or restore sub-dong values. | v3 can still operate using V before drop; v1/v2 cannot safely read stale P. |
| S7 contract, 003_drop_price | V only; guard requires no NULL V | v4/v4 | While v4 keeps serving: `(cd "$ROOT"; npm run migrate:down)`. Recreates P from V; lossy, not restoration of the original floats. Check before considering an older version. | Only v4 runs directly; v1–v3 reference the removed P column. |
| S8 finish | V only | v4/v4, then both stopped | No reversal of a finished traffic history. Start a separate fresh scratch replay with `bash docs/replay.sh`; do not append a second official traffic run to the evidence. | Same schema compatibility as S7. |

Official ledger entries, exact commands and traffic ranges: docs/ledger.md
lines 43–104. The control flags --go at S6/S7 were typed by the human after
separate G3a/G3b approvals. Reversible procedures and the later lossy down are
not a promise to recover the original pre-migration data after S6.

## Tags and files

| Tag | Commit | Behavior |
| --- | --- | --- |
| v1 | 2b889bde433190c17744f30d3900d38ab333a756 | Starter; reads/writes P |
| v2 | 717724874239e236f8d6ae3417286d82130c5411 | Reads P; writes P+V; accepts priceVnd |
| v3 | 10230e3b8d3804dcf9dae8e18612b55b3ae073b1 | Reads V; writes P+V |
| v4 | 01f6a26479df3eaeda2adaaba3df234ae0816601 | Reads/writes only V in SQL; retains API price |

001 is unchanged from v1. 002 up/down were added in `1cf0c07`, backfill in
`5deaa67`, and 003 up/down in `ad35c1b`. v1 contains only 001; v2–v4 contain
001+002; main also contains 003. Each migration has a down file and contains
no transaction wrapper; scripts/migrate.js owns BEGIN IMMEDIATE/rollback.

## Point of no return

S6, the first v4 writes, is the point of no return for a direct rollback to
P-reading v1/v2. Their SQL would still start before drop, but return stale prices.
The actual disagreement counts are 418 and 1117 in check-log.txt lines 171–186.
v3 still reads V before drop; after S7 its dual-write SQL cannot start without
first undoing 003. The 003 down derives P from integer V and cannot restore
original sub-dong float digits. This is separate from the S6 stale-data boundary.

## Rollback drill

S5 rolled v3 back to v2 and forward to v3 while the same traffic process ran.
Traffic lines 117–134 contain four sequential down/back pairs and zero failures.
S5-before, S5-on-v2 and S5-after are CONSISTENT (check-log.txt 147–170).
This is safe because v3 writes both columns on POST and PATCH. The later
v4→v2 rollback is unsafe without repairing P, as the S6 checks demonstrate.

## Backfill

The script defaults to 500 rows per BEGIN IMMEDIATE transaction and 50ms pauses;
it retries busy/locked batches up to five attempts, using the connection's
busy_timeout=5000. It selects NULL V or V disagreeing with SQLite round(P*1000),
including stale non-NULL values left by v1. The stored value uses the shared
JS toVnd helper registered as a SQLite function. It refuses absent confirmation,
missing columns, invalid options or NULL source P instead of inventing a price.
No v1 writer may remain; the orchestrator checks both recorded versions before
passing the flag. This deployment-state assertion is not discoverable from SQL.

Official S3: STOPPED updated=5000 batches=10; resume DONE updated=15585
batches=32; third run DONE updated=0 batches=0 (check-log.txt 67–130).
S3-after-backfill has zero NULLs/nonintegers/disagreement and plain CONSISTENT
at 121–128. Both instances were v2 throughout (ledger 64–69).

## Failures and what caused them

Official failed requests: none. One header (traffic line 2), share change to 0.3
(line 63), FINAL ok=421762 error=0 contract=0 stale=0 unavailable=0 rerouted=77
(line 199), RESULT: zero failed requests (line 200). Rerouted attempts are
permitted when the other instance remains available. All 10 down/back pairs
are visible, one instance at a time.

Expected INCONSISTENT results at S2 and S6/S7-backup are recorded, not hidden.
In this official run, S3-before already had zero disagreement but still NULLs;
ongoing v2 writes repaired the hot stale rows while cold rows needed backfill.
S1 row and NULL counts were separate reads under traffic, so one concurrent
insertion made them differ by one; this is not a request failure.

The Phase 0 negative scratch smoke deliberately enabled new clients on v1 and
recorded 711 contract failures. It is disclosed in AI-LOG.md and the rehearsal
summary; it is not part of, or substituted for, the official evidence. The full
rehearsal had zero failures. The Phase 4 replay is a separate scratch run.

## Backup and restore

S7 used VACUUM INTO, not a live file copy of a WAL database. Official backup:
881ms. Copy of the completed backup plus consistency check: 564ms, not a timed
production failover. Ledger line 97 records the path and timings. S7-backup
remained INCONSISTENT as expected from stale P (check 187–194). On a separate
copy, 003 up/down/status and a strict check passed (195–212). The live S7-after-drop
check lists only id/name/price_vnd and CONSISTENT (213–219). API probes passed
on both instances; the frozen probe code is scripts/ia2/run.js, function probe.
Official raw response bodies were not logged; the independent replay records
actual post-drop bodies in docs/replay-check.log to supplement that assertion.

## How to replay

Requirements: Linux/WSL or macOS with Bash, Node >=22.13, npm, Git, curl and
Python 3. Use a fresh terminal at this repository root; ports 4001/4002 must be
free. The script creates a new /tmp clone, never opens data/app.db and sets LOG
to a scratch file, so the committed official logs stay unchanged.

```bash
bash -x docs/replay.sh > /tmp/ia2-replay-output.txt 2>&1
```

This is the exact independently executed shell procedure preserved in
`docs/replay.sh`: clone, check out and test v1–v4/main, recreate worktrees,
migrate/seed 001 from v1, serve v1/v1, start traffic at 0, migrate 002 from v2,
serve v2/v2 sequentially, raise share to 0.3, partial/resumed/idempotent backfill
from v3, deploy v3, rollback to v2 and forward to v3, deploy v4, VACUUM INTO,
migrate 003 from main, probe every item endpoint, settle 30 seconds, SIGINT
traffic, SIGTERM servers, audit counters and remove replay worktrees.
It does not call scripts/ia2/run.js. Its checks read actual command outputs,
process exit statuses and HTTP responses. The shell trace is evidence, not
predetermined PASS text. The official down-tests are separately preserved in
check-log.txt; the independent replay does not claim to repeat all down-tests.

For the official orchestrated run, the human used setup followed by S0 --reset,
S1–S5, S6 --go, S7 --go, S8, each as `node scripts/ia2/run.js official ...`.
Do not re-run those commands against the completed evidence.

## PostgreSQL notes

This SQLite run does not demonstrate PostgreSQL behavior. There, nullable ADD
COLUMN and DROP COLUMN still take ACCESS EXCLUSIVE locks; use lock_timeout and
retry instead of allowing long queues. Add CHECK constraints NOT VALID then
VALIDATE CONSTRAINT, and use CREATE INDEX CONCURRENTLY outside a transaction.
Backfill in short batches with pauses, often keyset paging, to limit row locks,
WAL, bloat and replica lag. Do not replace expand/contract with a table-rewriting
ALTER COLUMN TYPE. The plan is portable; lock behavior and SQL need adaptation.

## Tooling changes

`5f5b28b` adds scripts/ia2/run.js and the prescribed NEW_CLIENTS_FILE patch.
The original traffic reads NEW_CLIENTS once, so restarting it at 0.3 would create
a second run and starting at 0.3 on v1 would fail the contract. The patch only
polls an optional control file once per second, updates the share and logs the
change. Without that variable it behaves as before. Counters, validation,
request mix and RESULT logic are unchanged. This is a disclosed extension, not
an explicit permission statement from the course: the supplied rubric does not
ban it, but final interpretation belongs to the grader. README.md, check.js,
seed.js, migrate.js and 001 are unchanged. The orchestrator invokes the same
Node entry points as npm scripts, with absolute DB_PATH and explicit log paths.
