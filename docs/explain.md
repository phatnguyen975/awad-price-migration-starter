# Explain

Read these answers, then explain the rollback boundary aloud in your own words.
The repository proves behavior; a memorized sentence does not replace understanding.

## 1. The plan

**Q:** Why not rename price or change its type in place?
**A:** v1 prepares SQL naming price at startup. Removing that column while v1
serves would break startup or queries. 002 adds a separate column, then 003 drops
the old one only after v4. Evidence: v1:src/app.js:22–26; migrations/002_add_price_vnd.up.sql;
check-log.txt 6–13 and 213–219.

**Q:** What is the point of no return, and is that the same as the drop?
**A:** The first v4 writes in S6 stop maintaining price, making v1/v2 reads stale
before the column is dropped. S7 is the later schema boundary: v1–v3 SQL cannot
run without price. The 003 down reconstructs a rounded value, not the original
float. Evidence: check-log.txt 171–186; migrations/003_drop_price.down.sql;
MIGRATION.md, Plan and Point of no return.

**Q:** What changes in PostgreSQL?
**A:** Keep expand/dual-write/backfill/read-switch/contract, but budget different
locks: lock_timeout for DDL, short backfill transactions, NOT VALID/VALIDATE for
constraints and CONCURRENTLY for indexes. We tested SQLite, not PostgreSQL.
Evidence: MIGRATION.md, PostgreSQL notes.

## 2. Expand and dual write

**Q:** Why is price_vnd nullable and without a default?
**A:** Old rows have not been converted and v1 inserts only price. A fake default
would hide missing conversion; NOT NULL would reject v1 writes. Both columns
are positive when present. Evidence: migrations/002_add_price_vnd.up.sql;
check-log.txt 6–13.

**Q:** Which write paths must change, and what do clients see?
**A:** POST /menu and PATCH /menu/:id must each write both columns in v2/v3.
Input may carry price or integer priceVnd; conflicting fields return 400. Every
item response retains numeric price and adds priceVnd. Evidence:
v2:src/app.js:20–37,44–50,64–85; v2:test/app.test.js, storage assertions.

**Q:** Are the down migrations actually tested?
**A:** Yes, not merely provided. 001 and 002 were applied/reverted on scratch DBs
in S1; 003 was tested on a backup copy in S7. Evidence: check-log.txt 14–42,
195–212. The 003 down is explicitly lossy.

## 3. Backfill

**Q:** Why wait until the last v1 writer is gone?
**A:** v1 could update price after a batch completed, leaving a stale non-NULL
price_vnd. The confirm flag asserts deployment state; it cannot discover server
versions from SQL. Evidence: ledger 57–69; scripts/ia2/run.js, backfill function;
scripts/backfill-price-vnd.js:6–9.

**Q:** Why select stale values as well as NULLs, and how is it resumable?
**A:** The predicate matches the checker's disagreement rule. Each 500-row batch
commits separately; a repeated run selects only rows still wrong. Evidence:
scripts/backfill-price-vnd.js:23–56; check-log.txt 67–130 (5000 stopped, 15585
resumed, zero on third run).

**Q:** What happens if price itself is NULL?
**A:** The script refuses and reports missing source values; it cannot invent a
price. Rows are also selected only with non-NULL price. Evidence:
scripts/backfill-price-vnd.js:20–28; AI-LOG.md, Resumable backfill scratch test.

## 4. Zero failed requests

**Q:** Why restart one instance at a time? Is rerouted a failure?
**A:** The other instance keeps serving while one closes gracefully. Traffic
reroutes requests and records a down/back pair. Only error, contract, stale and
unavailable count as failures; rerouted is permitted. Evidence:
traffic-log.txt 54–63 and 199–200; scripts/traffic.js:181; src/server.js:12.

**Q:** Why patch NEW_CLIENTS_FILE instead of changing the environment variable?
**A:** The original process reads NEW_CLIENTS once. A control file changes the
share to 0.3 after both servers support priceVnd without restarting traffic.
It does not change failure detection or erase logs. We disclose this extension;
the rubric does not explicitly authorize or forbid it. Evidence:
scripts/traffic.js:20,161–176; traffic-log.txt:63; MIGRATION.md, Tooling changes.

**Q:** What does check see that traffic misses?
**A:** Traffic verifies sampled requests. A cold row with a wrong value might
never be requested; check scans all rows. The checker runs separate count
queries, so concurrent insertion can slightly change counts between queries.
Evidence: scripts/check.js; check-log.txt 6–13,121–128; traffic-log.txt 199–200.

## 5. The way back

**Q:** Why is v3 to v2 safe, but v4 to v2 unsafe?
**A:** v3 reads price_vnd but continues writing both columns, keeping v2's source
correct. v4 writes only price_vnd, so price drifts. Evidence: v3:src/app.js:44–45;
v4:src/app.js:44–45; check-log.txt 147–186; traffic-log.txt 117–134.

**Q:** What did the actual rollback drill prove?
**A:** Both instances went from v3 to v2, then back to v3 under the same traffic
process, with CONSISTENT before/during/after and no failures. It did not prove
that all possible version rollbacks are safe. Evidence: ledger 78–83;
check-log.txt 147–170; traffic-log.txt 117–134.

**Q:** Why VACUUM INTO for backup?
**A:** A live WAL database may contain committed changes in its WAL, so copying
only app.db can omit them. VACUUM INTO creates a consistent completed database;
that completed backup can then be copied and checked. Evidence: scripts/ia2/run.js,
backup function; ledger:97; check-log.txt 187–212. Restore timing here includes
copy and check, not a measured production failover.

## 6. Contract

**Q:** What does the guard in 003 prevent?
**A:** It deliberately violates NOT NULL if any price_vnd is NULL. The migration
runner rolls the transaction back, preventing loss of the only source price.
Evidence: migrations/003_drop_price.up.sql; AI-LOG.md, Contract migration 003
scratch guard test. The official run had completed backfill, so the guard passed.

**Q:** How do old clients still receive price after drop?
**A:** All item replies go through view, deriving price from integer price_vnd.
v4 SQL mentions only price_vnd. Order unit prices remain in thousands. Evidence:
src/app.js:42–50,69–85,100–105; check-log.txt 213–219; ledger:97;
docs/replay-check.log contains actual independent post-drop HTTP responses.
