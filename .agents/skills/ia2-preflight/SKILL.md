---
name: ia2-preflight
description: Preflight for the IA#2 zero-downtime migration (menu_items.price → price_vnd) in the smart-restaurant starter. Verifies the machine, the git remotes and the starter code, then writes docs/inventory.md before any code or migration is created. Use in two parts that steps 1 and 2 (machine and repository state) at the start of Phase 0, before tag `v1` is created; steps 3 to 6 (reading the starter, the inventory) at the start of Phase 1. Use it again whenever the Node version, the OS, the fork state or the starter code is in doubt. Also use when the human says "preflight", "inventory", "check the starter", "before building v2", or asks whether the environment is ready, even if they do not name this skill.
---

# ia2-preflight

Every later step (v2/v3/v4 code, migrations, backfill, the official run) rests on facts about the machine and the starter. A wrong assumption found halfway through the official run costs a full redo, so confirm the facts first, write them down, and stop on any surprise.

This skill changes nothing in the repository except creating `docs/inventory.md`. It does not tag, commit scaffolding, or start servers on the official ports.

## Procedure

Work through the steps in order. Steps 1 and 2 belong to Phase 0 and must pass before `ia2-git-flow` creates tag `v1`; steps 3 to 6 belong to Phase 1. Record each result for the inventory.

### 1. Machine

| Check        | Command                                                                                                                                                     | Pass                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Node version | `node -v`                                                                                                                                                   | >= 22.13. `package.json` says >= 22.5, but `node:sqlite` only runs without a flag from 22.13; below that, `npm test` and every script fail |
| OS           | `uname -s`                                                                                                                                                  | Linux, macOS, or WSL. Not native Windows: `scripts/migrate.js` builds its path from `URL.pathname`, which breaks there                     |
| git          | `git --version`                                                                                                                                             | present                                                                                                                                    |
| GitHub CLI   | `gh auth status`                                                                                                                                            | logged in                                                                                                                                  |
| Free ports   | try to bind 3001, 3002, 4001, 4002                                                                                                                          | all free (3001/3002 official, 4001/4002 rehearsal)                                                                                         |
| Sandbox      | start `node src/server.js` with `PORT=4001 DB_PATH=<scratch>.db` after migrating the scratch DB, `curl -s localhost:4001/health`, then stop it with SIGTERM | prints `{"ok":true}` and the process exits cleanly                                                                                         |
| Worktrees    | `git worktree add --detach ../ia2-probe HEAD`, then `git worktree remove ../ia2-probe`                                                                      | both succeed (the agent may write outside the repo directory)                                                                              |

Use a scratch database for the sandbox probe, never `data/app.db`. If a check fails, stop and tell the human what is missing; do not work around it.

### 2. Repository state

1. `git remote -v`: `origin` must be the human's fork. If `upstream` is missing, add it: `git remote add upstream https://github.com/fithcmus/awad-price-migration-starter`.
2. `git fetch upstream`, then compare `git rev-parse HEAD` with `git rev-parse upstream/main`. They must be equal: tag `v1` is "the starter" and must be exactly the commit the course provided. If they differ, stop and ask; do not tag.
3. `git status --short`: the only changes allowed are the scaffolding files the human copied in (`AGENTS.md`, `.agents/`, `docs/`, `.gitignore`). Any change under `src/`, `scripts/`, `migrations/`, `test/` or `package.json` means the starter was edited: stop and ask.
4. `git tag`: no `v*` tags yet, or `v1` already sits on the starter commit.
5. `npm test` passes on the untouched starter (expected: 4 tests pass).

### 3. Read the starter

Read these files in full before asserting anything about them: `README.md`, `package.json`, `.gitignore`, `migrations/001_init.up.sql`, `migrations/001_init.down.sql`, `src/app.js`, `src/db.js`, `src/server.js`, `test/app.test.js`, `scripts/migrate.js`, `scripts/seed.js`, `scripts/check.js`, `scripts/traffic.js`.

### 4. Confirm the expected facts

These were verified on the starter commit `2b889bd`. Confirm each one against the files; any difference goes into the "Differences" section of the inventory and is reported to the human before Phase 1 continues.

**Schema (`001_init.up.sql`)**

- `menu_items.price` is `REAL CHECK (price > 0)` and **nullable**.
- `order_items.unit_price` is `REAL NOT NULL`, same unit as `price` (thousands of dong); it is out of scope for the migration.
- `order_items.menu_item_id` references `menu_items(id)`.

**Application (`src/app.js`, `src/server.js`, `src/db.js`)**

- All SQL is prepared once at startup in `createApp`; a version may therefore only reference columns that already exist when it starts.
- `menu_items` has exactly two writers: `insert` (`POST /menu`) and `setPrice` (`PATCH /menu/:id`).
- `price` is read by `list`, `get` (shared by `GET /menu/:id` and the replies of `POST` and `PATCH`) and by `POST /orders`, which copies `item.price` into `order_items.unit_price` and sums the total. Every item reply goes through one `view(row)` returning `{id, name, price}`.
- `GET /health` returns 200 `{"ok":true}`.
- `SIGINT` and `SIGTERM` call `server.close()` and then exit 0: in-flight requests finish.
- `open()` sets WAL, `busy_timeout = 5000`, `foreign_keys = ON`. `DB_PATH` is resolved against the current directory, so use an absolute path when running from a worktree.

**Tests (`test/app.test.js`)**

- Run with `node --test`. The `before` hook applies **every** file in `migrations/` to an in-memory database, then seeds with `INSERT INTO menu_items (name, price)`.
- `GET /menu/:id` is compared with `deepEqual` against `{id, name, price}`, so any new field in item replies breaks the original test.

**Scripts**

- `migrate.js`: `up` applies **all** pending files, each inside `BEGIN IMMEDIATE`; `down` reverts only the last applied version and fails if its `.down.sql` is missing. SQL files must not contain their own `BEGIN`/`COMMIT`.
- `seed.js`: inserts 20000 items with prices in 0.5-thousand steps (`npm run seed -- <n>` changes the count).
- `check.js`: prints `INCONSISTENT` (exit 1) when `price_vnd` is not an integer or disagrees with `round(price*1000)`; prints `CONSISTENT, but N rows have no price_vnd yet ...` while NULLs remain; prints a plain `CONSISTENT` only when there are no NULLs and no disagreement. It works on any schema, including after `price` is dropped.
- `traffic.js`:
  - Environment variables: `TARGETS` (default `http://localhost:3001,http://localhost:3002`), `DURATION` (0 = until SIGINT), `NEW_CLIENTS`, `IDS` (default 2000), `LOG` (default `traffic-log.txt`, appended to).
  - `NEW_CLIENTS` is read once at startup; new clients send `priceVnd` and require every reply to carry a `priceVnd` consistent with `price`.
  - Counters: `ok`, `error`, `contract`, `stale`, `rerouted`, `unavailable`. Failures are `error + contract + stale + unavailable`; `rerouted` (one instance down while another answers) is not a failure.
  - Log lines: `=== traffic start ... · new clients <n>`, `<target> down (<code>)`, `<target> back`, a tick every 5 seconds, `FINAL ...`, and `RESULT: zero failed requests` (or `RESULT: <n> failed requests`). `SIGINT` produces the last two.

**Repository**

- `.gitignore` covers `node_modules/`, `data/`, `*.db`, `*.db-*`; the two log files are not ignored.
- There are no runtime dependencies.

### 5. Write `docs/inventory.md`

Use exactly this structure. Every `<...>` is filled from what you actually saw; write "not checked" rather than guessing.

```md
# Inventory

Checked on <date>, starter commit <sha>, Node <version>, OS <name>.

## Machine

| Check   | Result              |
| ------- | ------------------- |
| <check> | <what you observed> |

## Repository state

<remotes, whether HEAD equals upstream/main, uncommitted files, tags, npm test result>

## Facts confirmed

| Area                                    | Fact   | Where seen             |
| --------------------------------------- | ------ | ---------------------- |
| <schema / app / tests / scripts / repo> | <fact> | <file:line or command> |

## Write paths and read paths of price

- Writers of menu_items: <statement, endpoint, file:line>
- Readers of price: <statement or code path, endpoint, file:line>

## Differences from the expected list

<each difference and why it matters, or "none">
```

### 6. Report and stop

Tell the human, in their language: which checks passed, which failed, what the inventory says, and whether Phase 1 can start. Commit nothing in this skill; the inventory is committed later under the commit sequence in `ia2-git-flow`. Add an `AI-LOG.md` entry as `AGENTS.md` requires.

## Stop conditions

Stop and ask the human instead of continuing when: Node is below 22.13 or the OS is native Windows; `HEAD` differs from `upstream/main`; the starter files were modified; `npm test` fails on the starter; a port is taken; the sandbox cannot start a server or create a worktree; or any fact in section 4 differs from what the files show.
