import { createServer } from 'node:http';
import { toVnd, toThousands } from './money.js';

// v4 uses only price_vnd in storage; the legacy price field remains in the API.

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const error = (res, status, code, message) => json(res, status, { error: code, message });

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return null; }
}

const isPrice = (p) => typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= 100000;

const MAX_VND = 100_000_000;

// Accept old and new clients, requiring agreement when both fields are present.
function parsePrice(body) {
  if (!body || typeof body !== 'object') return null;
  const hasK = body.price !== undefined, hasV = body.priceVnd !== undefined;
  if (!hasK && !hasV) return null;
  if (hasV) {
    const v = body.priceVnd;
    if (!Number.isInteger(v) || v < 1 || v > MAX_VND) return null;
    if (hasK && (!isPrice(body.price) || toVnd(body.price) !== v)) return null;
    return { price: toThousands(v), priceVnd: v };
  }
  if (!isPrice(body.price)) return null;
  const v = toVnd(body.price);
  if (v < 1) return null;
  return { price: body.price, priceVnd: v };
}

export function createApp(db) {
  const q = {
    list: db.prepare('SELECT id, name, price_vnd FROM menu_items ORDER BY id LIMIT ? OFFSET ?'),
    get: db.prepare('SELECT id, name, price_vnd FROM menu_items WHERE id = ?'),
    insert: db.prepare('INSERT INTO menu_items (name, price_vnd) VALUES (?, ?)'),
    setPrice: db.prepare('UPDATE menu_items SET price_vnd = ? WHERE id = ?'),
    insertOrder: db.prepare("INSERT INTO orders (created_at) VALUES (datetime('now'))"),
    insertLine: db.prepare('INSERT INTO order_items (order_id, menu_item_id, qty, unit_price) VALUES (?, ?, ?, ?)'),
  };

  const view = (row) => ({ id: row.id, name: row.name, price: toThousands(row.price_vnd), priceVnd: row.price_vnd });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });

    if (parts[0] === 'menu' && parts.length === 1) {
      if (req.method === 'GET') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        return json(res, 200, q.list.all(limit, offset).map(view));
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const p = parsePrice(body);
        if (!body || typeof body.name !== 'string' || !body.name || !p)
          return error(res, 400, 'invalid_body', 'name (string) and price (thousands of dong) or priceVnd (dong) are required');
        const { lastInsertRowid } = q.insert.run(body.name, p.priceVnd);
        return json(res, 201, view(q.get.get(lastInsertRowid)));
      }
    }

    if (parts[0] === 'menu' && parts.length === 2) {
      const id = Number(parts[1]);
      const row = Number.isInteger(id) ? q.get.get(id) : undefined;
      if (!row) return error(res, 404, 'not_found', `menu item ${parts[1]} not found`);
      if (req.method === 'GET') return json(res, 200, view(row));
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        const p = parsePrice(body);
        if (!p)
          return error(res, 400, 'invalid_body', 'price (thousands of dong) or priceVnd (dong) is required');
        q.setPrice.run(p.priceVnd, id);
        return json(res, 200, view(q.get.get(id)));
      }
    }

    if (req.method === 'POST' && url.pathname === '/orders') {
      const body = await readBody(req);
      if (!body || !Array.isArray(body.items) || body.items.length === 0)
        return error(res, 400, 'invalid_body', 'items: [{menuItemId, qty}] is required');
      db.exec('BEGIN IMMEDIATE');
      try {
        const { lastInsertRowid: orderId } = q.insertOrder.run();
        let total = 0;
        for (const { menuItemId, qty } of body.items) {
          const item = q.get.get(menuItemId);
          if (!item || !Number.isInteger(qty) || qty < 1) throw Object.assign(new Error(), { status: 400 });
          const unit = toThousands(item.price_vnd);
          q.insertLine.run(orderId, item.id, qty, unit);
          total += unit * qty;
        }
        db.exec('COMMIT');
        return json(res, 201, { id: Number(orderId), total: Math.round(total * 1000) / 1000 });
      } catch (e) {
        db.exec('ROLLBACK');
        if (e.status === 400) return error(res, 400, 'invalid_item', 'unknown menuItemId or bad qty');
        throw e;
      }
    }

    return error(res, 404, 'not_found', 'no such route');
  }

  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) error(res, 500, 'internal', e.message);
    });
  });
}
