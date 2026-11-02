---
name: ia2-tooling
description: Build the two pieces of tooling the IA#2 zero-downtime migration needs before any migration code exists - the small NEW_CLIENTS_FILE patch to scripts/traffic.js, and the step orchestrator scripts/ia2/run.js that deploys versions, runs the migration steps, labels check runs and writes the ledger. Use in Phase 0, whenever the orchestrator or the traffic patch must be created, changed, debugged or smoke-tested, and when the human mentions orchestrator, run.js, NEW_CLIENTS_FILE, "tooling", or "how do I run step S3", even if they do not name this skill.
---

# ia2-tooling

Two things are built here, once, before any migration code is written.

1. **A patch to `scripts/traffic.js`.** The rubric wants one continuous traffic log in which `NEW_CLIENTS` is above 0 for the part after the API offers `priceVnd`. The starter reads `NEW_CLIENTS` once at startup, and v1 cannot serve new clients (it rejects `priceVnd`), so with the unmodified script both conditions cannot hold in one run. The patch lets the value change while the run continues.
2. **An orchestrator, `scripts/ia2/run.js`.** The official run is long and easy to get subtly wrong: one instance at a time, wait for recovery, label every check, record line ranges, never touch the wrong checkout. Encoding the procedure in a script makes the human's job "run one command per step" and makes the rehearsal and the official run identical.

Work in this order: read `ia2-run-steps` and `ia2-git-flow` (they define the step list and the checkout table this tooling implements) → patch traffic → write the orchestrator → smoke test → commit as `chore(tooling)` per `ia2-git-flow` → add an `AI-LOG.md` entry. Record both changes for `MIGRATION.md` ("Tooling changes"): what, why, commit.

## Part 1 - the `traffic.js` patch

Change only what is needed. Against the starter, the diff is about 12 lines added and 2 changed:

1. Import `readFileSync` next to `appendFileSync`.
2. Make `NEW_CLIENTS` a `let` instead of a `const`.
3. Right after the `=== traffic start` header is logged, add this block:

```js
// IA#2 tooling: optional runtime control of NEW_CLIENTS. If NEW_CLIENTS_FILE is set, the number (0..1)
// in that file replaces NEW_CLIENTS whenever it changes, and the change is logged. Without it nothing changes.
const NEW_CLIENTS_FILE = process.env.NEW_CLIENTS_FILE;
if (NEW_CLIENTS_FILE)
  setInterval(() => {
    try {
      const v = Number(readFileSync(NEW_CLIENTS_FILE, "utf8").trim());
      if (Number.isFinite(v) && v >= 0 && v <= 1 && v !== NEW_CLIENTS) {
        NEW_CLIENTS = v;
        log(`${ts()} new clients → ${v}`);
      }
    } catch {
      /* missing or half-written file: keep the current value */
    }
  }, 1000).unref();
```

Rules: with `NEW_CLIENTS_FILE` unset the script must behave exactly as the original; the header line keeps its original text (the value at startup); the change is visible in the log as a `new clients → <v>` line, which is the evidence for the rubric. Touch nothing else in the file (counters, log lines and the `RESULT` line are read by graders and by the orchestrator).

Test it: run a v1 server on a scratch database, start the script with `NEW_CLIENTS_FILE` pointing at a file containing `0`, write `0.3` into the file a few seconds later, and confirm one `new clients → 0.3` line appears. Failures after the change are expected in this test, because v1 cannot serve new clients; that is exactly why the orchestrator only raises the value once both instances run v2. When testing against a small database, set `IDS` to no more than the number of seeded rows (default is 2000), otherwise missing ids are counted as `contract` failures.

## Part 2 - the orchestrator `scripts/ia2/run.js`

Node ES module, no dependencies, Node >= 22.13, may be split into a few files under `scripts/ia2/`. Start with `--help`.

### Interface

```
node scripts/ia2/run.js <rehearsal|official> <command> [options]
```

| Command                     | What it does                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`                     | Recreate the worktrees `../ia2-v1` .. `../ia2-v4` from the tags that exist and verify each HEAD equals `git rev-parse vN^{commit}`; check Node version and free ports |
| `s0` .. `s8`                | The steps of the playbook in `ia2-run-steps`, in order                                                                                                                |
| `down-test <001\|002\|003>` | Standalone down-test (also run inside `s1` and `s7`)                                                                                                                  |
| `status`                    | Print versions and pids of instances A and B, whether traffic runs, the state of each step                                                                            |
| `teardown`                  | Stop servers; stop traffic only with `--force` (it ends the run); worktrees are removed only with `--worktrees`                                                       |
| `all`                       | Rehearsal only: `setup`, then `s0 --reset` .. `s8` with `--go`, stopping at the first FAIL                                                                            |

Exit codes: `0` step PASS, `1` step FAIL, `2` a precondition did not hold and nothing was changed.

### Guards (they exist so the rules in `AGENTS.md` cannot be broken by accident)

- `official` refuses to run unless stdin is a TTY, so an agent shell cannot run it; the human types the commands. An explicit `IA2_ALLOW_NON_TTY=1` override exists for the human only.
- `s0` refuses to start if the database, `traffic-log.txt` or `check-log.txt` already exist, unless `--reset` is given; with `--reset` it deletes `data/app.db*` and the two log files (official) or the rehearsal directory (rehearsal). In official mode it also requires `git status --short` to be empty.
- `s6` and `s7` refuse to run without `--go`. In official mode only the human types it.
- A step runs only if the previous step PASSed; a step that already PASSed does not run again (rehearsal accepts `--again`).
- Every step re-verifies that the worktrees it will use match their tags.

### Configuration per mode

|                     | rehearsal                        | official                   |
| ------------------- | -------------------------------- | -------------------------- |
| work directory      | `.ia2/rehearsal/`                | `.ia2/`                    |
| database            | `.ia2/rehearsal/app.db`          | `data/app.db`              |
| ports A / B         | 4001 / 4002                      | 3001 / 3002                |
| traffic log (`LOG`) | `.ia2/rehearsal/traffic-log.txt` | `traffic-log.txt`          |
| check log           | `.ia2/rehearsal/check-log.txt`   | `check-log.txt`            |
| ledger              | `.ia2/rehearsal/ledger.md`       | `docs/ledger.md`           |
| `NEW_CLIENTS_FILE`  | `.ia2/rehearsal/new-clients`     | `.ia2/new-clients`         |
| `TARGETS`           | the two rehearsal ports          | the starter default        |
| state file          | `.ia2/state-rehearsal.json`      | `.ia2/state-official.json` |

Always pass `DB_PATH` as an absolute path. Rehearsal output never goes to the root log files.

State file: mode, paths, instances A and B (`port`, `pid`, `version`), traffic (`pid`, first line), and per step `status`, start time, first and last line of the traffic log.

### Primitives

**deploy(port, version)** - restart one instance on a version:

1. Verify the worktree HEAD equals the tag. Remember the current number of lines in the traffic log.
2. `SIGTERM` the old process and wait up to 15 seconds for it to exit. If it is still alive, FAIL. Never use `SIGKILL`: in-flight requests must finish.
3. Wait 1 second (so the traffic script notices the instance is gone), then start `node src/server.js` from `../ia2-<version>` with `PORT` and `DB_PATH` set, detached, output to `server-<port>.log` in the work directory; save the pid.
4. Wait for `GET /health` to return 200 (up to 15 seconds).
5. If traffic is running: wait for a `<target> back` line after the remembered line, then wait 10 more seconds. Then require, in the new lines: exactly one `<target> down (...)` and one `<target> back` line for this target, no failure lines, and counters of the latest tick all zero. The first start of an instance in `s0` (no traffic yet) skips this part.

**check(label, policy)** - run `npm run --silent check` from `main` with `DB_PATH` set and append to the check log:

```
===== CHECK <label> | <ISO time> | A=<ver> B=<ver> | git <short sha> =====
<stdout of the check>
exit=<code>
```

The check prints a small table (columns, rows, counters) and ends with one verdict line; the verdict is the **last non-empty stdout line**. Policies: `strict` = exit 0 and the verdict is exactly `CONSISTENT`; `null-ok` = exit 0 and the verdict starts with `CONSISTENT`; `any` = record only. The policy of every label is fixed in `ia2-run-steps`; keep it identical here. An exit code of 1 is data, not a crash.

**scan(from)** - read the traffic log from a line number; failure lines match `^\s*[\d.]+s\s+(ERROR|CONTRACT|STALE|UNAVAILABLE)\b`; the counters come from the newest `ok=... error=... contract=... stale=... unavailable=... rerouted=...` tick line. A step is clean when there are no failure lines and the four failure counters are 0 (`rerouted` is not a failure).

**ledger(step)** - append one entry per step to the ledger:

```
## <step id> <step name> — <time>
- Instances: <version on A> / <version on B> | git <tag or sha>
- Command (run by the human): <the exact command line that was run>
- traffic-log.txt lines: <first>–<last> | counters at the end: <error / contract / stale / unavailable>
- check-log label: "<label>" → <verdict line of the check output>
- Notes: <expected-but-unusual results, or "none">
```

**backup()** - `VACUUM INTO '<work dir>/backup-s7.db'` through `open()` from `src/db.js` (a plain file copy of a live WAL database is not safe). Time it. Then copy the backup to a scratch file and run the check on the copy; time that as the restore time. Print both times; they go into `MIGRATION.md`.

**probe()** - with `fetch`, against both ports: `GET /menu/1`, `GET /menu?limit=5`, `POST /menu` and `PATCH /menu/<id>` with `{price}` bodies (old-client shape), `POST /orders` (check status and `total` only). Assert every item reply has a numeric `price`.

**down-test(NNN)** - on a scratch database under the work directory, never the live one:

- `001`: from `../ia2-v1`: `migrate`, `migrate:status`, `migrate:down`, `migrate:status`. No check afterwards (the tables are gone). Record the outputs.
- `002`: from `../ia2-v1` migrate and seed 1000 rows; from `../ia2-v2` `migrate` (applies 002), `migrate:down`, `migrate:status`, then the check (`strict`, label `S1-down-test-002`).
- `003`: requires `--from <db file>`, a copy of the database as it was before 003; from `main` `migrate` (applies 003), `migrate:down`, `migrate:status`, then the check (`strict`, label `S7-down-test-003`).
  Append to the check log as:

```
===== DOWN-TEST <NNN> | DB_PATH=<scratch file> =====
<outputs of migrate / migrate:down / migrate:status / check, in that order, each preceded by the command>
```

**backfill(options)** - from `../ia2-v3`: `node scripts/backfill-price-vnd.js --i-confirm-no-v1-writers [--stop-after N]` with `DB_PATH` set. Contract with the backfill script (also stated in `ia2-migration-backfill`): its last stdout line is `DONE updated=<n> batches=<m>`, or `STOPPED updated=<n> batches=<m>` when `--stop-after` ended the run. The orchestrator parses `updated=`. It adds the confirm flag only after `status` shows A and B both on v2 or later.

**traffic** - start: `node scripts/traffic.js` from `main`, detached, with `TARGETS`, `LOG`, `NEW_CLIENTS=0` and `NEW_CLIENTS_FILE` set, after writing `0` into the file; stop: `SIGINT`, then wait for the `RESULT` line. Raise the share by writing `0.3` into the file and wait up to 3 seconds for the `new clients → 0.3` line.

### Commands to actions

Labels, check policies, pass rules and the guidance text for the human are defined in `ia2-run-steps`; implement exactly that list. Summary of the actions:

| Step | Actions                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s0` | guards; migrate + seed from `../ia2-v1` (20000 rows; `IA2_SEED` may lower it for smoke tests); deploy A and B on v1; start traffic; check `S0-baseline`           |
| `s1` | migrate from `../ia2-v2` on the live database; check `S1-expand`; `down-test 001`; `down-test 002`                                                                |
| `s2` | deploy A v2; check; deploy B v2; check; set `NEW_CLIENTS_FILE` to 0.3                                                                                             |
| `s3` | check; backfill with `--stop-after 10`; check; backfill to the end; check; backfill a third time and require `updated=0`                                          |
| `s4` | deploy A v3; check; deploy B v3; check                                                                                                                            |
| `s5` | check; deploy A and B on v2; check; deploy A and B on v3; check                                                                                                   |
| `s6` | (`--go`) deploy A v4; check; deploy B v4; check                                                                                                                   |
| `s7` | (`--go`) require A and B on v4; `backup`; check of the restored copy; `down-test 003 --from` the backup; migrate from `main` on the live database; check; `probe` |
| `s8` | wait 30 clean seconds; stop traffic and require `RESULT: zero failed requests` and exactly one `=== traffic start` header; then stop both servers                 |

Stop the servers only after traffic has ended, so that no `down` line appears after the `FINAL` and `RESULT` lines.

### What every command prints

```
STEP <id> <PASS|FAIL>
<one line per failed rule, or "all rules passed">
traffic-log.txt lines <first>–<last>   |   check-log labels written: <labels>
NEXT: <the exact command for the next step>
```

A FAIL ends with the cause and "do not continue; follow ia2-run-steps, section on failures".

## Smoke test (Phase 0)

Only `v1` exists at this point, so only part of the tooling can be exercised; the full sequence is the rehearsal's job.

1. `rehearsal setup`: the `v1` worktree is created and verified; missing tags are reported, not fatal.
2. `rehearsal down-test 001`: the outputs are recorded.
3. `rehearsal s0 --reset` with `IA2_SEED=2000` (so `IDS` is covered): two v1 instances run and traffic starts; after about 15 seconds the log shows the header, ticks and no `down` or failure lines.
4. Write `0.3` into the rehearsal `new-clients` file: exactly one `new clients → 0.3` line appears (failures after it are expected on v1).
5. `rehearsal teardown --force`: processes stop, the log ends with `FINAL` and `RESULT`.
6. `npm test` still passes, and `git diff` shows only `scripts/traffic.js` and `scripts/ia2/`.

## Do not

Edit `scripts/migrate.js`, `check.js` or `seed.js`; change any other part of `traffic.js`; kill an instance with `SIGKILL`; write to the root log files in rehearsal mode; run `official` from an agent shell; run `migrate` from a checkout that holds later migrations than the step.
