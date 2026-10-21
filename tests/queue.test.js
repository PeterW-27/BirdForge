import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/data/catalog.js';
import { saveState, loadState, storageAvailable, STORAGE_KEY } from '../src/data/storage.js';
import { addSampleOrders, isSampleOrder } from '../src/data/samples.js';
import { makeState, restoreState, placeCartOrder, placeDirectOrder, placeRepairOrder, updateStatus, toggleTicket, workTickets, forgeQueue, queueInfo, nextOrderId, setQuote, parseCrowns } from '../src/domain/core.js';
import { ordersPage } from '../src/ui/pages/orders.js';
import { orderCard } from '../src/ui/components/order-card.js';
import { ticketsPage } from '../src/ui/pages/tickets.js';
import { visibleProducts } from '../src/ui/pages/shop.js';

const customer = { name: 'Elena of Mautern', email: 'elena@example.com', address: 'Market quarter', recycle: 'no' };
const at = (minute) => `2026-10-18T12:${String(minute).padStart(2, '0')}:00Z`;

function cartOrder(state, cart, id, minute) {
  const result = placeCartOrder(catalog, { ...state, cart }, customer, id, at(minute));
  assert.equal(result.error, undefined);
  return result.state;
}

function threeOrders() {
  let state = makeState();
  state = cartOrder(state, { 'sword-short': 1, 'pot-small': 2 }, 'GF-0001', 1);
  state = cartOrder(state, { 'plate-light': 1 }, 'GF-0002', 2);
  state = cartOrder(state, { 'mail-short': 1 }, 'GF-0003', 3);
  return state;
}

function memoryStorage({ failWrites = false } = {}) {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      data.set(key, String(value));
    },
    removeItem: (key) => data.delete(key),
  };
}

test('customers see their place in the queue, oldest order first', () => {
  const state = threeOrders();
  assert.deepEqual(['GF-0001', 'GF-0002', 'GF-0003'].map((id) => queueInfo(state, id).position), [1, 2, 3]);
  const third = queueInfo(state, 'GF-0003');
  assert.equal(third.stage, 'queued');
  assert.equal(third.ordersAhead, 2);
  assert.equal(third.itemsAhead, 3);
  assert.equal(third.queueLength, 3);
});

test('finishing the first order moves everyone else up one place', () => {
  let state = threeOrders();
  for (const ticket of workTickets(state).filter((t) => t.orderId === 'GF-0001')) state = toggleTicket(state, ticket.id).state;
  assert.equal(queueInfo(state, 'GF-0001').stage, 'delivering');
  assert.equal(queueInfo(state, 'GF-0002').position, 1);
  assert.equal(queueInfo(state, 'GF-0003').position, 2);
});

test('finishing one item of an order reduces the items ahead but keeps the place', () => {
  let state = threeOrders();
  state = toggleTicket(state, 'GF-0001-0').state;
  const info = queueInfo(state, 'GF-0003');
  assert.equal(info.position, 3);
  assert.equal(info.itemsAhead, 2);
  assert.equal(queueInfo(state, 'GF-0001').openItems, 1);
});

test('work tickets show the same queue number the customer sees', () => {
  const state = threeOrders();
  for (const ticket of workTickets(state)) assert.equal(ticket.queuePosition, queueInfo(state, ticket.orderId).position);
  assert.match(ticketsPage(state), /#3/);
});

test('custom commissions join the queue only after assessment', () => {
  const placed = placeDirectOrder(catalog, makeState(), 'sword-commission', 'custom', { ...customer, qty: 1, description: 'A ceremonial sword for the queen' }, 'GF-0001', at(1)).state;
  assert.equal(workTickets(placed).length, 0);
  assert.equal(queueInfo(placed, 'GF-0001').stage, 'waiting');
  const assessing = updateStatus(placed, 'GF-0001', 'Assessing').state;
  assert.equal(workTickets(assessing).length, 0);
  const processing = updateStatus(assessing, 'GF-0001', 'Processing').state;
  assert.equal(workTickets(processing).length, 1);
  assert.equal(queueInfo(processing, 'GF-0001').position, 1);
});

test('repairs waiting for drop-off are not on the work list yet', () => {
  const repair = { ...customer, itemName: 'Gate hinge', qty: 1, damage: 'The hinge pin snapped in the cold.' };
  const state = updateStatus(placeRepairOrder(makeState(), repair, 'GF-0001', at(1)).state, 'GF-0001', 'Awaiting Drop-off').state;
  assert.deepEqual(queueInfo(state, 'GF-0001'), { stage: 'waiting', status: 'Awaiting Drop-off', type: 'repair' });
});

test('delivered orders leave the queue and report delivered', () => {
  const state = updateStatus(threeOrders(), 'GF-0002', 'Delivered').state;
  assert.equal(queueInfo(state, 'GF-0002').stage, 'delivered');
  assert.equal(queueInfo(state, 'GF-0003').position, 2);
  assert.equal(forgeQueue(state).length, 2);
});

test('unknown order has no queue information', () => assert.equal(queueInfo(makeState(), 'missing'), null));

test('order numbers are short and sequential', () => {
  assert.equal(nextOrderId([]), 'GF-0001');
  assert.equal(nextOrderId([{ id: 'GF-0009' }, { id: 'GF-0002' }]), 'GF-0010');
  assert.equal(nextOrderId([{ id: 'GF-MGW3K2-AB12C' }]), 'GF-0001');
});

test('duplicate order numbers are rejected', () => {
  const state = threeOrders();
  assert.match(placeCartOrder(catalog, { ...state, cart: { 'sword-short': 1 } }, customer, 'GF-0002', at(5)).error, /already in use/);
});

test('restore drops duplicated order records', () => {
  const state = threeOrders();
  const restored = restoreState({ ...state, orders: [...state.orders, state.orders[0]] }, catalog);
  assert.equal(restored.orders.length, 3);
});

test('Gunter can quote custom commissions and repairs', () => {
  const state = placeDirectOrder(catalog, makeState(), 'armor-commission', 'custom', { ...customer, qty: 1, description: 'Fitted armor for a royal herald' }, 'GF-0001', at(1)).state;
  const quoted = setQuote(state, 'GF-0001', '240.5').state;
  assert.equal(quoted.orders[0].totalCents, 24050);
  assert.match(orderCard(quoted.orders[0]), /Quoted price/);
  assert.match(orderCard(state.orders[0]), /Quote pending/);
  assert.equal(restoreState(quoted, catalog).orders[0].totalCents, 24050);
});

test('quotes reject fixed-price orders and invalid amounts', () => {
  const standard = threeOrders();
  assert.match(setQuote(standard, 'GF-0001', '50').error, /Only custom/);
  const custom = placeDirectOrder(catalog, makeState(), 'cookware-commission', 'custom', { ...customer, qty: 1, description: 'A long pan for fish' }, 'GF-0001', at(1)).state;
  for (const bad of ['', 'abc', '-5', '0', '1.234', '1000001', '12,5']) assert.ok(setQuote(custom, 'GF-0001', bad).error, bad);
  assert.ok(setQuote(custom, 'missing', '10').error);
});

test('crown amounts are parsed without floating point errors', () => {
  assert.equal(parseCrowns('0.29'), 29);
  assert.equal(parseCrowns('19.9'), 1990);
  assert.equal(parseCrowns('7'), 700);
  assert.equal(parseCrowns('7.'), null);
});

test('orders page shows the place in line and hides sample orders', () => {
  let state = addSampleOrders(catalog, makeState(), Date.parse(at(0)));
  state = cartOrder(state, { 'sword-longsword': 1 }, nextOrderId(state.orders), 9);
  const html = ordersPage(state, 'GF-0004');
  assert.match(html, /data-queue-position="3"/);
  assert.match(html, /You are #3 on Gunter's work list/);
  assert.ok(!html.includes('Captain Roswitha'));
});

test('sample orders are fictional, marked, and leave the satchel alone', () => {
  const start = { ...makeState(), cart: { 'pot-small': 2 } };
  const state = addSampleOrders(catalog, start, Date.parse(at(0)));
  assert.equal(state.orders.length, 3);
  assert.ok(state.orders.every(isSampleOrder));
  assert.deepEqual(state.cart, { 'pot-small': 2 });
  assert.deepEqual(state.orders.map((o) => o.id), ['GF-0001', 'GF-0002', 'GF-0003']);
  assert.ok(restoreState(state, catalog).orders.every(isSampleOrder));
});

test('saving reports failure instead of pretending to succeed', () => {
  const full = memoryStorage({ failWrites: true });
  assert.equal(saveState(makeState(), full), false);
  assert.equal(storageAvailable(full), false);
  const working = memoryStorage();
  assert.equal(saveState(threeOrders(), working), true);
  assert.equal(loadState(catalog, working).orders.length, 3);
});

test('corrupted saved data falls back to an empty forge', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(loadState(catalog, storage), makeState());
});

test('every product has real copy and standard goods list their specs', () => {
  for (const product of catalog) {
    assert.ok(!/lorem/i.test(`${product.short} ${product.details}`), product.id);
    assert.ok(product.details.length > 20, product.id);
  }
  assert.ok(catalog.filter((p) => p.type === 'standard').every((p) => p.specs.length >= 2));
});

test('search matches every word in any order', () => {
  const ui = { category: 'All', savedOnly: false, sort: 'featured', search: 'pot 40' };
  assert.deepEqual(visibleProducts(makeState(), ui).map((p) => p.id), ['pot-large']);
  assert.equal(visibleProducts(makeState(), { ...ui, search: '   ' }).length, catalog.length);
});
