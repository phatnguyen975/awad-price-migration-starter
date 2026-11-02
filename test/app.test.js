import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { open } from '../src/db.js';
import { createApp } from '../src/app.js';

let server, base, db;
before(async () => {
  db = open(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.up.sql')).sort())
    db.exec(readFileSync(new URL(f, dir), 'utf8'));          // every migration, in order
  db.exec("INSERT INTO menu_items (name, price_vnd) VALUES ('Phở bò', 45500), ('Trà đá', 5000)");
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('GET /menu/:id returns price in thousands of dong', async () => {
  assert.deepEqual(await call('GET', '/menu/1'), { status: 200, body: { id: 1, name: 'Phở bò', price: 45.5, priceVnd: 45500 } });
});

test('PATCH /menu/:id changes the price', async () => {
  const r = await call('PATCH', '/menu/2', { price: 6 });
  assert.equal(r.status, 200);
  assert.equal(r.body.price, 6);
});

test('POST /orders totals at the current price', async () => {
  const r = await call('POST', '/orders', { items: [{ menuItemId: 1, qty: 2 }, { menuItemId: 2, qty: 1 }] });
  assert.deepEqual(r, { status: 201, body: { id: 1, total: 97 } });
});

test('errors have one shape', async () => {
  assert.deepEqual((await call('GET', '/menu/999')).body.error, 'not_found');
  assert.equal((await call('PATCH', '/menu/1', { price: -1 })).status, 400);
});

// v4 tests work both before and after the contract migration.
const hasPrice = () => db.prepare('PRAGMA table_info(menu_items)').all().some(c => c.name === 'price');
function assertStored(id, priceVnd) {
  const row = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  assert.equal(row.price_vnd, priceVnd);
  if (hasPrice()) assert.equal(row.price, null);
}
test('old and new creates and patches write only price_vnd', async () => {
  for (const body of [{ price: 29 }, { priceVnd: 29000 }, { price: 29, priceVnd: 29000 }]) {
    const r = await call('POST', '/menu', { name: 'Contract item', ...body });
    assert.equal(r.status, 201);
    assert.equal(r.body.price, 29);
    assert.equal(r.body.priceVnd, 29000);
    assertStored(r.body.id, 29000);
    for (const update of [{ price: 30.5 }, { priceVnd: 30500 }]) {
      const changed = await call('PATCH', `/menu/${r.body.id}`, update);
      assert.equal(changed.status, 200);
      assert.equal(changed.body.price, 30.5);
      assert.equal(changed.body.priceVnd, 30500);
      assertStored(r.body.id, 30500);
    }
  }
});

test('invalid prices are rejected by both write paths', async () => {
  for (const body of [{}, { price: 1, priceVnd: 2000 }, { priceVnd: 1.5 },
    { price: 0.0001 }, { priceVnd: 0 }, { priceVnd: 100000001 },
    { price: 100001 }, { priceVnd: '29000' }, { price: null }]) {
    assert.equal((await call('POST', '/menu', { name: 'Invalid', ...body })).status, 400);
    assert.equal((await call('PATCH', '/menu/1', body)).status, 400);
  }
});

test('item, list and order reads use price_vnd when columns disagree', async () => {
  const { lastInsertRowid } = db.prepare('INSERT INTO menu_items(name, price_vnd) VALUES (?, ?)').run('Read source', 29000);
  const id = Number(lastInsertRowid);
  if (hasPrice()) db.prepare('UPDATE menu_items SET price = 1 WHERE id = ?').run(id);
  const r = await call('GET', `/menu/${id}`);
  assert.equal(r.body.price, 29);
  assert.equal(r.body.priceVnd, 29000);
  const list = await call('GET', '/menu?limit=200');
  assert.equal(list.body.find(item => item.id === id).price, 29);
  const order = await call('POST', '/orders', { items: [{ menuItemId: id, qty: 2 }] });
  assert.equal(order.status, 201);
  assert.equal(order.body.total, 58);
  assert.equal(db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(order.body.id).unit_price, 29);
  const patched = await call('PATCH', `/menu/${id}`, { price: 30 });
  assert.equal(patched.body.price, 30);
  if (hasPrice()) assert.equal(db.prepare('SELECT price FROM menu_items WHERE id = ?').get(id).price, 1);
});
