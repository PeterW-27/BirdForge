import test from 'node:test';
import assert from 'node:assert/strict';
import { builtInCatalog as catalog } from '../src/data/catalog.js';
import { makeState, placeCartOrder, placeDirectOrder, placeRepairOrder, updateStatus, setQuote, toggleTicket, restoreState, orderHistory } from '../src/domain/core.js';
import { createBackup, parseBackup, MAX_BACKUP_BYTES } from '../src/domain/backup.js';
import { statusHistory } from '../src/ui/components/status-history.js';
import { footer } from '../src/ui/components/site-shell.js';
import { addProduct, EXAMPLE_PRODUCT } from '../src/domain/products.js';

const start = '2026-10-20T10:00:00.000Z';
const later = '2026-10-20T11:00:00.000Z';
const customer = { name: 'Test Customer', email: 'test@example.com', address: 'Town' };
const placed = () => placeCartOrder(catalog, { ...makeState(), cart: { 'sword-short': 2 } }, customer, 'GF-0001', start).state;
const backupObject = () => JSON.parse(createBackup(placed(), catalog, later));

test('all four order types record placement using the order creation time', () => {
  const orders = [placed().orders[0],
    placeDirectOrder(catalog, makeState(), 'pot-small', 'bulk', { ...customer, title: 'Cook', qty: 10 }, 'GF-0002', start).order,
    placeDirectOrder(catalog, makeState(), 'sword-commission', 'custom', { ...customer, qty: 1, description: 'A ceremonial sword' }, 'GF-0003', start).order,
    placeRepairOrder(makeState(), { ...customer, itemName: 'Iron pot', qty: 1, damage: 'A crack in the base' }, 'GF-0004', start).order];
  for (const order of orders) assert.deepEqual(order.statusHistory, [{ status: 'Placed', at: start, reason: 'placed' }]);
});

test('manual transitions append immutable history, same status adds nothing', () => {
  const initial = placed();
  const changed = updateStatus(initial, 'GF-0001', 'Processing', later).state;
  assert.equal(initial.orders[0].statusHistory.length, 1);
  assert.deepEqual(changed.orders[0].statusHistory[1], { status: 'Processing', at: later, reason: 'manual' });
  assert.equal(updateStatus(changed, 'GF-0001', 'Processing', later).state.orders[0].statusHistory.length, 2);
  assert.ok(updateStatus(changed, 'GF-0001', 'Unknown').error);
});

test('commission quote records automatic transition once without recording price-only changes', () => {
  const initial = placeDirectOrder(catalog, makeState(), 'sword-commission', 'custom', { ...customer, qty: 1, description: 'A ceremonial sword' }, 'GF-0001', start).state;
  const quoted = setQuote(initial, 'GF-0001', '120', later).state;
  assert.deepEqual(quoted.orders[0].statusHistory.at(-1), { status: 'Processing', at: later, reason: 'quote' });
  assert.equal(setQuote(quoted, 'GF-0001', '130', later).state.orders[0].statusHistory.length, 2);
  assert.ok(setQuote(initial, 'GF-0001', '-1').error);
});

test('only the final ticket adds Delivering and reopening preserves the full timeline', () => {
  const initial = placeCartOrder(catalog, { ...makeState(), cart: { 'sword-short': 1, 'pot-small': 1 } }, customer, 'GF-0001', start).state;
  const partial = toggleTicket(initial, 'GF-0001-0', later).state;
  assert.equal(partial.orders[0].statusHistory.length, 1);
  const finished = toggleTicket(partial, 'GF-0001-1', later).state;
  assert.equal(finished.orders[0].statusHistory.at(-1).reason, 'completed');
  const reopened = updateStatus(finished, 'GF-0001', 'Processing', later).state;
  assert.deepEqual(reopened.completedTickets, []);
  assert.deepEqual(reopened.orders[0].statusHistory.map((entry) => entry.status), ['Placed', 'Delivering', 'Processing']);
  assert.deepEqual(restoreState(reopened, catalog), reopened);
});

test('older saved orders retain current status without inventing a transition timestamp', () => {
  const raw = placed();
  delete raw.orders[0].statusHistory;
  raw.orders[0].status = 'Processing';
  const restored = restoreState(raw, catalog);
  assert.deepEqual(restored.orders[0].statusHistory, [{ status: 'Processing', at: null, reason: 'legacy' }]);
  assert.match(statusHistory(restored.orders[0]), /Time not recorded in older data/);
  assert.equal(updateStatus(restored, 'GF-0001', 'Delivering', later).state.orders[0].statusHistory.length, 2);
});

test('invalid saved histories fall back to an explicitly unknown snapshot', () => {
  const order = placed().orders[0];
  for (const history of [[{ status: 'Processing', at: later, reason: 'manual' }], [{ status: 'Placed', at: '<script>', reason: 'placed' }]]) {
    assert.deepEqual(orderHistory({ ...order, statusHistory: history }), [{ status: 'Placed', at: null, reason: 'legacy' }]);
  }
});

test('backup round trip retains images, added products, history, favorites and completed work', () => {
  let state = addProduct(placed(), EXAMPLE_PRODUCT, 'data:image/png;base64,AAAA').state;
  state = updateStatus(state, 'GF-0001', 'Processing', later).state;
  state = toggleTicket(state, 'GF-0001-0', later).state;
  state.cart = { 'product-1': 3 };
  state.favorites = ['product-1'];
  const result = parseBackup(createBackup(state, catalog, later), catalog);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.summary, { orders: 1, products: 1, favorites: 1, cartUnits: 3, completedTickets: 1 });
});

test('empty backups are valid and footer contains only two backup controls', () => {
  const result = parseBackup(createBackup(makeState(), catalog), catalog);
  assert.deepEqual(result.state, makeState());
  const html = footer();
  assert.equal((html.match(/data-action="(?:export|restore)-backup"/g) || []).length, 2);
  assert.match(html, /data-action="export-backup">Backup/);
  assert.match(html, /data-action="restore-backup">Restore/);
  assert.match(html, /id="backup-file"[^>]* hidden/);
  assert.doesNotMatch(html, /backup-preview|backup-panel/);
});

test('malformed, incomplete, unsupported and oversized backups are refused', () => {
  for (const content of ['{broken', 'null', '{}', JSON.stringify({ ...backupObject(), version: 99 }), JSON.stringify({ ...backupObject(), state: {} }), ' '.repeat(MAX_BACKUP_BYTES + 1)]) {
    assert.ok(parseBackup(content, catalog).error);
  }
});

test('restore rejects dropped, duplicate or malformed data instead of silently losing records', () => {
  const mutations = [
    (s) => { s.orders.push(structuredClone(s.orders[0])); },
    (s) => { s.cart.missing = 1; },
    (s) => { s.cart['sword-short'] = -1; },
    (s) => { s.favorites.push('missing'); },
    (s) => { s.completedTickets.push('missing-0'); },
    (s) => { s.orders[0].customer.address = {}; },
    (s) => { s.orders[0].items[0].priceCents = '10'; },
    (s) => { s.orders[0].notes = {}; },
    (s) => { s.orders[0].statusHistory[0].at = 'bad'; },
    (s) => { s.addedProducts.push({ id: 'bad' }); },
  ];
  for (const mutate of mutations) {
    const data = backupObject();
    mutate(data.state);
    assert.ok(parseBackup(JSON.stringify(data), catalog).error);
  }
});

test('object key order in JSON does not affect backup validation', () => {
  const data = backupObject();
  data.state = Object.fromEntries(Object.entries(data.state).reverse());
  assert.equal(parseBackup(JSON.stringify(data), catalog).error, undefined);
});
