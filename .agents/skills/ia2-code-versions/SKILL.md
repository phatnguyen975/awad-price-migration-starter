---
name: ia2-code-versions
description: Write the three application versions of the IA#2 zero-downtime migration (menu_items.price → price_vnd) - v2 (dual write, API accepts priceVnd, still reads price), v3 (reads price_vnd, still writes both columns) and v4 (reads and writes price_vnd only, never mentions price) - together with their tests. Use in Phase 1 whenever src/app.js, src/money.js or test/app.test.js must be created or changed, when a version fails npm test or the traffic checks, and when the human asks what a version reads, writes or returns, even if they do not name this skill.
---

# ia2-code-versions

Three versions of `src/app.js` run side by side during the migration, each against a database that is mid-change. Each one must be correct for the columns that exist and hold data at the moment it serves traffic, and must keep answering old clients exactly as v1 did. The versions are small on purpose: a human has to explain every line of the diff at the oral, and a small diff is also what makes rollback reasoning (v3 to v2 is safe, v4 to v2 is not) easy to state.

Prerequisites: `ia2-preflight` done, migration `002` committed (see `ia2-migration-backfill`). Commits and tags follow `ia2-git-flow`: v2 is commit 6, the backfill script is commit 7, v3 is commit 8, v4 is commit 9. Tag only after the checks in "Verify" pass.

## What each version does

|              | reads from  | writes                                           | item reply                    | needs in the schema                                            |
| ------------ | ----------- | ------------------------------------------------ | ----------------------------- | -------------------------------------------------------------- |
| v1 (starter) | `price`     | `price`                                          | `{id, name, price}`           | `price`                                                        |
| **v2**       | `price`     | `price` **and** `price_vnd`, on every write path | `{id, name, price, priceVnd}` | `price`, `price_vnd` (migration 002 applied)                   |
| **v3**       | `price_vnd` | `price` and `price_vnd`                          | same as v2                    | both columns, `price_vnd` filled for every row (backfill done) |
| **v4**       | `price_vnd` | `price_vnd` only                                 | same as v2                    | `price_vnd`; works with or without the `price` column          |

`menu_items` has exactly two write paths: `POST /menu` (the `insert` statement) and `PATCH /menu/:id` (`setPrice`). Both change in v2, v3 and v4. `price` is read by `list`, `get` (used by `GET /menu/:id` and by the replies of `POST` and `PATCH`) and by `POST /orders`; all of them change in v3 and v4. SQL is prepared once at startup, so a version may only mention columns that exist when it starts: v2 and v3 need 002 applied before they start, and v4 must not mention `price` anywhere in its SQL.

## Shared pieces (v2 onward)

`src/money.js` - the single conversion rule. Never truncate; never write the formula anywhere else.

```js
// price is thousands of dong (float); priceVnd is dong (integer). One rule, used everywhere.
export const toVnd = (thousands) => Math.round(thousands * 1000);
export const toThousands = (vnd) => vnd / 1000;
```

`parsePrice(body)` in `src/app.js` replaces `isPrice(body.price)` in both write paths. Keep `isPrice` as it is and add:

```js
const MAX_VND = 100_000_000;

// Old clients send `price` (thousands of dong), new clients `priceVnd` (dong).
// Returns { price, priceVnd } or null when the body does not carry one consistent, valid price.
function parsePrice(body) {
  if (!body || typeof body !== "object") return null;
  const hasK = body.price !== undefined,
    hasV = body.priceVnd !== undefined;
  if (!hasK && !hasV) return null;
  if (hasV) {
    const v = body.priceVnd;
    if (!Number.isInteger(v) || v < 1 || v > MAX_VND) return null;
    if (hasK && (!isPrice(body.price) || toVnd(body.price) !== v)) return null;
    return { price: toThousands(v), priceVnd: v };
  }
  if (!isPrice(body.price)) return null;
  const v = toVnd(body.price);
  if (v < 1) return null; // price_vnd has CHECK (price_vnd > 0)
  return { price: body.price, priceVnd: v };
}
```

Both write paths do `const p = parsePrice(body); if (!body || ... || !p) return error(res, 400, 'invalid_body', ...)` with a message that mentions both `price` and `priceVnd`. Keep the error shape and the status codes of v1. For an old client the stored `price` is exactly what it sent (as in v1); for a new client it is `priceVnd / 1000`.

## v2 - dual write

- `insert`: `INSERT INTO menu_items (name, price, price_vnd) VALUES (?, ?, ?)`, run with `(name, p.price, p.priceVnd)`.
- `setPrice`: `UPDATE menu_items SET price = ?, price_vnd = ? WHERE id = ?`, run with `(p.price, p.priceVnd, id)`.
- Selects stay as in v1 (they read `price`).
- `view`: `{ id, name, price: row.price, priceVnd: toVnd(row.price) }`. v2 derives `priceVnd` from `price` because `price_vnd` is NULL on most rows until the backfill has run.
- `POST /orders` is unchanged.

## v3 - read the new column

- Selects: `SELECT id, name, price_vnd FROM menu_items ...` for `list` and `get`.
- `view`: `{ id, name, price: toThousands(row.price_vnd), priceVnd: row.price_vnd }`.
- `POST /orders`: take the unit price as `const unit = toThousands(item.price_vnd)` and use it for both the `order_items.unit_price` insert and the running total. Orders stay in thousands of dong; keep the `Math.round(total * 1000) / 1000` of v1.
- Writes: identical to v2 (still both columns). That is what makes v3 to v2 a safe rollback: while v3 runs, `price` stays correct for v2.
- Do not hide a NULL `price_vnd` with a default: a row nobody backfilled must surface as a contract failure, not as a silent wrong price.

## v4 - the new column only

- `insert`: `INSERT INTO menu_items (name, price_vnd) VALUES (?, ?)` with `(name, p.priceVnd)`.
- `setPrice`: `UPDATE menu_items SET price_vnd = ? WHERE id = ?` with `(p.priceVnd, id)`.
- Everything else as v3. No SQL string and no property may refer to `price` as a column. Old clients still receive `price` in every item reply because `view` derives it.
- v4 therefore runs unchanged before and after migration 003, which drops the column.

## Contract that the traffic script enforces (so you can reason about failures)

- Every item reply must have a numeric `price > 0`.
- A reply to a new client (it sends `priceVnd`) must also have an integer `priceVnd` equal to `Math.round(price * 1000)`.
- After a `PATCH`, the reply must show the price just sent, and a later read must not show an older price (a `stale` failure otherwise).
- `POST /orders` totals are compared with the sum of `price * qty` in thousands, within 1e-6.
- Any 5xx counts as a failure.

## Tests

`node --test` runs every file under `test/`, so keep exactly one file, `test/app.test.js`, edited in place; never leave per-version copies in `test/`.

For each version:

- Keep every original assertion on `price`. Only the expected body of `GET /menu/:id` gains `priceVnd: 45500`, and the seed changes with the schema. In `test/app.test.js`, hold the in-memory database in a variable (`let db`) so tests can read rows directly.
- **Seed by version.** v2 and v3: `INSERT INTO menu_items (name, price, price_vnd) VALUES ('Phở bò', 45.5, 45500), ('Trà đá', 5, 5000)`. v4: `(name, price_vnd)` only, so the test also passes after 003 has dropped the column.
- **v2 new tests:** creating with an old-client body writes both columns; creating with `priceVnd` writes both and returns `price`; `PATCH` with `price` and with `priceVnd` writes both; a body whose `price` and `priceVnd` disagree, a non-integer `priceVnd`, a `price` that rounds to 0 dong, and a body with no price all return 400.
- **v3 new test:** insert a row whose columns disagree on purpose (`price` 1, `price_vnd` 29000) and assert `GET` returns 29 and 29000, which proves the read comes from `price_vnd`. The `POST /orders` expectation (`total: 97`) must still hold.
- **v4 new tests:** a `POST` and a `PATCH` leave the `price` column untouched (`NULL` when the seed left it `NULL`) and set `price_vnd`; old clients still get `price`. Guard column-specific assertions with a helper that checks `PRAGMA table_info(menu_items)`, because the same test must pass with and without the `price` column.
- The test hook applies every migration present in the checkout, so run the matrix: v2 and v3 on `001`+`002`; v4 on `001`+`002` and, once `003` exists on `main`, on `001`+`002`+`003`.

## Verify before committing and tagging

1. `npm test` per the matrix above; all tests pass.
2. Smoke run against traffic, one instance at a time, on a scratch database in the state that version expects (use a scratch `DB_PATH`, port 4001, `TARGETS=http://localhost:4001`, and seed at least `IDS` rows, default 2000): `migrate`, `seed`, then for v3 and v4 first fill `price_vnd` for every row (the backfill script once it exists, or a one-off statement on the scratch database). Run `DURATION=8 NEW_CLIENTS=0.3 npm run traffic` with `LOG` pointing at a scratch file. Expected: `RESULT: zero failed requests` for v2, v3 and v4, and `new clients` above 0 throughout.
3. After the v4 smoke run, `npm run check` ends with `INCONSISTENT` (v4 stopped maintaining `price`; this is the expected effect of the point of no return). After applying `003` to the scratch database it ends with `CONSISTENT`, and v4 still passes the traffic run on the schema without `price`.
4. `git diff` shows only `src/` and `test/` (plus the new `src/money.js` in v2). No migration, script or doc changes in a version commit.

Commit and tag only after all four hold. Add an `AI-LOG.md` entry per version, naming what the human asked you to change.

## Do not

Change error codes or the bounds of `isPrice`; rename endpoints; add fields other than `priceVnd`; put the conversion formula anywhere but `money.js`; read `price_vnd` in v2 (it is NULL on most rows then); write `price` in v4; edit the migrations or the traffic script in a version commit.
