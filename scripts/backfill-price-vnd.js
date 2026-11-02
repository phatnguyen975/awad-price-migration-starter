// Fill missing or stale price_vnd values, only after every v1 writer has left.
// Each batch is a short transaction; --stop-after permits a resumability drill.
import { open } from '../src/db.js';
import { toVnd } from '../src/money.js';

const args = process.argv.slice(2);
const refuse = message => { console.error(message); process.exit(2); };
if (!args.includes('--i-confirm-no-v1-writers'))
  refuse('refusing to run: pass --i-confirm-no-v1-writers once every instance runs v2 or later');
const index = args.indexOf('--stop-after');
const stopAfter = index < 0 ? 0 : Number(args[index + 1]);
const BATCH = Number(process.env.BATCH ?? 500);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 50);
if (!Number.isInteger(BATCH) || BATCH < 1 || !Number.isFinite(PAUSE_MS) || PAUSE_MS < 0 ||
    !Number.isInteger(stopAfter) || stopAfter < 0 || (index >= 0 && stopAfter === 0))
  refuse('BATCH and --stop-after must be positive integers; PAUSE_MS must be nonnegative');
const db = open();
const cols = new Set(db.prepare('PRAGMA table_info(menu_items)').all().map(c => c.name));
if (!cols.has('price') || !cols.has('price_vnd')) refuse('needs both price and price_vnd columns');
const missing = db.prepare('SELECT count(*) n FROM menu_items WHERE price IS NULL').get().n;
if (missing) refuse(`cannot backfill: ${missing} rows have NULL price; report missing source values`);

// Match check.js, including stale non-NULL values left by a v1 writer.
const WRONG = 'price_vnd IS NULL OR price_vnd <> CAST(round(price * 1000) AS INTEGER)';
// Reuse the application conversion rule for the value actually stored.
db.function('to_vnd', { deterministic: true }, toVnd);
const step = db.prepare(`UPDATE menu_items SET price_vnd = to_vnd(price)
  WHERE id IN (SELECT id FROM menu_items WHERE price IS NOT NULL AND (${WRONG}) ORDER BY id LIMIT ?)`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function batch() {
  for (let attempt = 1; ; attempt++) {
    try {
      db.exec('BEGIN IMMEDIATE');
      try {
        const { changes } = step.run(BATCH);
        db.exec('COMMIT');
        return Number(changes);
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    } catch (e) {
      if (attempt >= 5 || !/locked|busy/i.test(e.message)) throw e;
      await sleep(PAUSE_MS);
    }
  }
}
let updated = 0, batches = 0;
try {
  for (;;) {
    const n = await batch();
    if (!n) { console.log(`DONE updated=${updated} batches=${batches}`); break; }
    updated += n; batches++;
    console.log(`batch ${batches}: ${n} rows (total ${updated})`);
    if (stopAfter && batches >= stopAfter) {
      console.log(`STOPPED updated=${updated} batches=${batches}`); break;
    }
    await sleep(PAUSE_MS);
  }
} finally { db.close(); }
