# Inventory

Checked on 2026-11-03, starter commit 2b889bde433190c17744f30d3900d38ab333a756, Node v24.16.0, OS Linux (WSL).

## Machine

| Check | Result |
| --- | --- |
| Node / OS / Git | v24.16.0 / Linux / Git 2.43.0 |
| GitHub CLI | Authenticated outside restricted sandbox in Phase 0 |
| Ports | 3001, 3002, 4001, 4002 bound successfully in Phase 0 |
| HTTP sandbox probe | Scratch migration; health returned {"ok":true}; SIGTERM exit 0 outside restricted sandbox |
| Worktrees | Sibling probe created and removed; v1 worktree verified in Phase 0 |

## Repository state

Origin is the human's fork, git@github.com:phatnguyen975/awad-price-migration-starter.git.
Upstream is https://github.com/fithcmus/awad-price-migration-starter.
At Phase 0, HEAD equalled upstream/main. At Phase 1 start HEAD is 5f5b28b
(tooling), working tree is clean, and annotated v1 still equals upstream/main.
The four untouched starter tests and the final Phase 0 test run passed.
G0 was approved by the human in chat. No official command has run.

## Facts confirmed

| Area | Fact | Where seen |
| --- | --- | --- |
| Schema | price is nullable REAL with a positive CHECK | migrations/001_init.up.sql:4 |
| Schema | order_items.unit_price is REAL NOT NULL in thousands; menu_item_id is a foreign key | migrations/001_init.up.sql:15 |
| App | Statements prepared at startup; one view maps item responses | src/app.js:22, src/app.js:31 (v1) |
| App | Health returns 200; graceful SIGINT/SIGTERM shutdown | src/app.js:37, src/server.js:12 (v1) |
| App | WAL, busy_timeout=5000, foreign_keys=ON; DB_PATH resolves from cwd | src/db.js:7 (v1) |
| Tests | In-memory DB applies all up migrations; seed uses price; GET deepEqual requires adding priceVnd | test/app.test.js:9 (v1) |
| Scripts | migrate applies all pending files in transactions; down reverts one | scripts/migrate.js:17 |
| Scripts | Seed defaults to 20000 half-thousand prices | scripts/seed.js:4 |
| Scripts | Check detects disagreement and noninteger values; distinguishes NULLs | scripts/check.js:12 |
| Scripts | Traffic defaults IDS=2000; failures are error, contract, stale, unavailable; rerouted is permitted | scripts/traffic.js:18 |
| Scripts | Traffic header, five-second ticks, FINAL, RESULT; SIGINT ends traffic | scripts/traffic.js:161 |
| Repo | No runtime dependencies; database and node_modules ignored; root logs are tracked evidence | package.json, .gitignore |

## Write paths and read paths of price

- Writers of menu_items: insert, POST /menu (src/app.js:25,49 at v1); setPrice, PATCH /menu/:id (src/app.js:26,63 at v1).
- Readers of price: list and get SELECTs (src/app.js:23–24 at v1); view for GET list/item and POST/PATCH replies (src/app.js:31); POST /orders copies item.price into unit_price and totals (src/app.js:79–80).

## Differences from the expected list

No unexpected starter differences. Approved Phase 0 additions are .gitattributes,
.ia2/ ignore rule, instructions, AI log, orchestrator, and the prescribed
NEW_CLIENTS_FILE traffic patch. The patched traffic reads the optional share
control file at runtime; without it the starter behavior is unchanged.
