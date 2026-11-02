---
name: ia2-migration-backfill
description: Write and verify the database side of the IA#2 zero-downtime migration - migration 002 (add price_vnd), migration 003 (drop price, with a guard), their .down.sql files, the re-runnable batch backfill script scripts/backfill-price-vnd.js, and the down-tests. Use in Phase 1 whenever a migration or the backfill script must be created, reviewed, changed or debugged, when a migrate or migrate:down fails, when check reports INCONSISTENT or rows without price_vnd, and when the human asks how the backfill works or why it may only run after v1 is gone, even if they do not name this skill.
---

# ia2-migration-backfill

The schema change is split into small steps, each safe on its own: `002` adds a nullable column (expand), the backfill fills it (migrate data), `003` removes the old column (contract). Code versions change in between (`ia2-code-versions`). Nothing here renames a column or changes a type in place: that would break every instance still running the previous version.

Commits follow `ia2-git-flow`: `002` is commit 5, the backfill script commit 7, `003` commit 10. Run each migration from the checkout named in the git-flow table (`002` from `../ia2-v2`, `003` from `main`, backfill from `../ia2-v3`), because `npm run migrate` applies every pending file in the checkout it runs from.

## Rules for every migration file

- Name `NNN_name.up.sql` and `NNN_name.down.sql`; every `up` has a `down`. Never edit a migration that has been applied anywhere; a change is a new file.
- No `BEGIN` or `COMMIT` inside the file: `scripts/migrate.js` wraps each file in `BEGIN IMMEDIATE ... COMMIT` and rolls back on any error.
- One schema step per file. The new column is nullable with no default until the very end.
- A `down` states in a comment what it cannot restore.
- Ask three questions before handing a migration over, and write the answers in the AI-LOG entry: which lock does it take, for how long, and what do the versions that are running at that moment expect from the schema?

## Migration 002 - expand

`migrations/002_add_price_vnd.up.sql`:

```sql
ALTER TABLE menu_items ADD COLUMN price_vnd INTEGER CHECK (price_vnd > 0);
```

`migrations/002_add_price_vnd.down.sql`:

```sql
ALTER TABLE menu_items DROP COLUMN price_vnd;
```

Nullable, no default, constraint declared in the database like the one on `price`. v1 does not mention the column, so v1 keeps working after this migration; that is the property to demonstrate. SQLite refuses to add a `NOT NULL` column without a default, which is one more reason the column starts nullable.

## Migration 003 - contract

`migrations/003_drop_price.up.sql`:

```sql
-- Guard: refuse to drop price while any row has no price_vnd. A NOT NULL violation here aborts the whole
-- migration (the runner wraps it in a transaction and rolls back).
CREATE TABLE _guard_price_vnd (x INTEGER NOT NULL);
INSERT INTO _guard_price_vnd SELECT NULL WHERE EXISTS (SELECT 1 FROM menu_items WHERE price_vnd IS NULL);
DROP TABLE _guard_price_vnd;

ALTER TABLE menu_items DROP COLUMN price;
```

`migrations/003_drop_price.down.sql`:

```sql
-- Lossy: price is re-derived from price_vnd, the original float values are gone.
ALTER TABLE menu_items ADD COLUMN price REAL CHECK (price > 0);
UPDATE menu_items SET price = price_vnd / 1000.0 WHERE price_vnd IS NOT NULL;
```

Notes:

- The guard makes the migration fail safe. If any row still has no `price_vnd`, the `INSERT` violates `NOT NULL`, the runner rolls the transaction back and prints `NOT NULL constraint failed: _guard_price_vnd.x`; `migrate:status` then still shows 003 as pending. Without the guard a forgotten backfill would silently delete the only copy of those prices.
- SQLite allows `DROP COLUMN` here because the `CHECK (price > 0)` belongs to the column being dropped itself.
- The `down` is lossy: it recreates `price` from `price_vnd / 1000.0`, so the original float values (for example the sub-dong digits) are not recovered. Say so in `MIGRATION.md`.
- 003 may only be applied after v4 runs on every instance: v1 to v3 mention `price` in their SQL and would fail on a database without it.

## The backfill script

Requirements:

- Small batches, each its own short transaction (`BEGIN IMMEDIATE` ... `COMMIT`), with a pause between batches so live traffic is never starved. Retry a batch when the lock is busy.
- Re-runnable and resumable: a row is selected only while `price_vnd` is missing or disagrees with `price`, using **the same predicate as `scripts/check.js`**. Why this predicate and not just `price_vnd IS NULL`: during the rolling deploy an instance on v2 and an instance on v1 run together; v1 writes `price` only, so a row last written by v1 keeps an old, non-NULL `price_vnd` that is wrong. A NULL-only filter never repairs it, and `check` reports it as `disagree`.
- `price IS NOT NULL` in the selection: the column allows NULL, and without this a row with no price would match forever and the loop would never end. A row with no price cannot be filled; if one exists, stop and report it to the human instead of inventing a price.
- It refuses to run without `--i-confirm-no-v1-writers`. The database cannot tell which versions are serving, so the human or the orchestrator confirms it, and only after `status` shows every instance on v2 or later: while v1 still writes `price` alone, the backfill races it and rows go wrong again behind the backfill.
- Output contract with the orchestrator (`ia2-tooling`): progress lines per batch, and a last stdout line `DONE updated=<n> batches=<m>`, or `STOPPED updated=<n> batches=<m>` when `--stop-after N` ended the run. Exit code 2 when it refuses.
- It uses `open()` from `src/db.js`, so it inherits WAL and `busy_timeout`.

`scripts/backfill-price-vnd.js` (tested: stop and resume, repeat runs, stale rows, and live traffic):

```js
// Fill menu_items.price_vnd (dong) from menu_items.price (thousands of dong), in small batches.
//   node scripts/backfill-price-vnd.js --i-confirm-no-v1-writers [--stop-after N]
// Safe to stop and to run again: a row is selected only while price_vnd is missing or disagrees with price,
// the same rule scripts/check.js uses, so the result is the same however many times it runs.
// Run it only when no instance runs a version that writes `price` alone (v1).
// Last stdout line: `DONE updated=<n> batches=<m>`, or `STOPPED updated=<n> batches=<m>` when --stop-after ended it.
import { open } from "../src/db.js";

const args = process.argv.slice(2);
if (!args.includes("--i-confirm-no-v1-writers")) {
  console.error(
    "refusing to run: pass --i-confirm-no-v1-writers once every instance runs v2 or later",
  );
  process.exit(2);
}
const i = args.indexOf("--stop-after");
const stopAfter = i >= 0 ? Number(args[i + 1]) : 0;
const BATCH = Number(process.env.BATCH ?? 500);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 50);

const db = open();
const cols = new Set(
  db
    .prepare("PRAGMA table_info(menu_items)")
    .all()
    .map((c) => c.name),
);
if (!cols.has("price") || !cols.has("price_vnd")) {
  console.error("needs both price and price_vnd columns");
  process.exit(2);
}

const WRONG =
  "price_vnd IS NULL OR price_vnd <> CAST(round(price * 1000) AS INTEGER)";
const step = db.prepare(`
  UPDATE menu_items SET price_vnd = CAST(round(price * 1000) AS INTEGER)
  WHERE id IN (SELECT id FROM menu_items WHERE price IS NOT NULL AND (${WRONG}) ORDER BY id LIMIT ?)`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function batch() {
  // one short transaction; retry when another writer holds the lock
  for (let attempt = 1; ; attempt++) {
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        const { changes } = step.run(BATCH);
        db.exec("COMMIT");
        return Number(changes);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } catch (e) {
      if (attempt >= 5 || !/locked|busy/i.test(e.message)) throw e;
    }
  }
}

let updated = 0,
  batches = 0;
for (;;) {
  const n = batch();
  if (n === 0) break;
  updated += n;
  batches++;
  console.log(`batch ${batches}: ${n} rows (total ${updated})`);
  if (stopAfter && batches >= stopAfter) {
    console.log(`STOPPED updated=${updated} batches=${batches}`);
    process.exit(0);
  }
  await sleep(PAUSE_MS);
}
console.log(`DONE updated=${updated} batches=${batches}`);
```

## Verify before committing

Use scratch databases (`DB_PATH` absolute, under a scratch directory); never `data/app.db`. Seed at least 2000 rows when traffic will run.

1. **Migrations.** `migrate` applies `001` and `002`; `migrate:down` reverts `002` and `check` ends with `CONSISTENT`; `migrate` again, then `003` from a database whose `price_vnd` is filled: applies; `check` ends with `CONSISTENT`; `migrate:down` reverts it, `price` is back and `check` ends with `CONSISTENT`.
2. **Guard.** On a database where some `price_vnd` is NULL, `migrate` fails with the `_guard_price_vnd.x` error and `migrate:status` still lists 003 as pending.
3. **Refusal.** Without the flag the script prints the refusal and exits 2.
4. **Stop and resume.** Make some rows wrong on purpose: `UPDATE menu_items SET price_vnd = 1 WHERE id % 997 = 0` (the row left behind by v1) and set some to NULL. `check` says `INCONSISTENT`. Run with `--stop-after 3`: last line `STOPPED updated=1500 batches=3` (with the default batch of 500). Run again to the end: `DONE ...`. Run a third time: `DONE updated=0 batches=0`. `check` ends with plain `CONSISTENT`, and no row is left at 1.
5. **Under traffic.** Start a v2 server on a scratch database and `DURATION=14 NEW_CLIENTS=0.3 npm run traffic` (scratch `LOG`, `TARGETS`); start the backfill after a few seconds. Expected: `RESULT: zero failed requests` and `check` ends with `CONSISTENT`.
6. **No price.** A row with a NULL `price` is skipped; the script ends instead of looping, and `check` reports "rows have no price_vnd yet".

Record the outputs of 1 to 5 in the AI-LOG entry. The official run repeats the same scenario on the real database (`S3`).

## PostgreSQL notes (for `MIGRATION.md` and the exam)

The plan is identical; the locks are what change.

- `ADD COLUMN` nullable with no default is a catalog change, but it still needs a brief `ACCESS EXCLUSIVE` lock. If a long transaction holds the table, the DDL waits and every query queues behind it. Set `lock_timeout` (for example `2s`) and retry the DDL.
- Add constraints later without a long lock: `ADD CONSTRAINT ... CHECK (...) NOT VALID`, then `VALIDATE CONSTRAINT` (it does not block writes).
- Backfill in batches with a commit after each, using keyset paging (`WHERE id > $last ORDER BY id LIMIT n`); one giant `UPDATE` holds locks for long, bloats the table and lags replicas. Re-run until a pass updates nothing.
- Indexes on the new column: `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction block.
- `DROP COLUMN` is a catalog change with a brief `ACCESS EXCLUSIVE` lock; space is reclaimed later. Make sure no running code still names the column (cached plans fail otherwise).
- `ALTER COLUMN ... TYPE` rewrites the whole table under `ACCESS EXCLUSIVE`. That rewrite is exactly what expand and contract avoids.

## Do not

Edit `scripts/migrate.js`, `check.js` or `seed.js`; apply a migration from a checkout that holds later ones; run the backfill before every instance is on v2 or later; select rows in the backfill with a rule other than the one in `check.js`; put `BEGIN`/`COMMIT` in a migration file; touch `data/app.db` from this skill.
