import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPrices, ORES } from '../src/domain/mining.js';
import { sellHaul, buyPrice, creditCap, redeemCredit, buyCanary, recipeFor, orderNeeds } from '../src/domain/materials.js';
import { makeState, placeCartOrder, placeDirectOrder, placeRepairOrder, setQuote, restoreState } from '../src/domain/core.js';
import { createBackup, parseBackup } from '../src/domain/backup.js';
import { catalog } from '../src/data/catalog.js';
import { orderCard } from '../src/ui/components/order-card.js';
import { miningQueuePrompt } from '../src/ui/pages/orders.js';
const date = '2026-10-21', at = date + 'T12:00:00Z';
const buyer = { name: 'Miner', email: 'miner@example.com' };
const rich = () => sellHaul(makeState(), 'local', { ruby: 100 }, dailyPrices(date), date, at).state;
test('prices are deterministic within ten percent; purchases pay eighty percent rounded to cents', () => {
  const bases = [150, 400, 600, 1500, 4000, 9000];
  for (let day = 1; day < 28; day += 1) {
    const prices = dailyPrices(`2026-10-${String(day).padStart(2, '0')}`);
    assert.deepEqual(prices, dailyPrices(`2026-10-${String(day).padStart(2, '0')}`));
    ORES.forEach((ore, i) => { assert.ok(prices[ore] >= bases[i] * .9 && prices[ore] <= bases[i] * 1.1); assert.equal(buyPrice(prices[ore]), Math.round(prices[ore] * .8)); });
  }
});
test('daily cap keeps all ore and resets independently on the next day', () => {
  const first = rich(); assert.equal(first.wallets.local.creditCents, 5000); assert.equal(first.oreStock.ruby, 100);
  const again = sellHaul(first, 'local', { ruby: 10 }, dailyPrices(date), date, at);
  assert.equal(again.creditCents, 0); assert.equal(again.state.oreStock.ruby, 110);
  assert.equal(sellHaul(first, 'local', { ruby: 10 }, dailyPrices(date), '2026-10-22', at).creditCents, 5000);
});
test('normal and bulk credit deduct wallet, obey balance and floor of 25 percent', () => {
  const state = { ...rich(), cart: { 'sword-short': 1 } };
  assert.ok(placeCartOrder(catalog, state, { ...buyer, creditCents: 1701 }, 'GF-1', at).error);
  const placed = placeCartOrder(catalog, state, { ...buyer, creditCents: 1700 }, 'GF-1', at);
  assert.equal(placed.order.creditCents, 1700); assert.equal(placed.state.wallets.local.creditCents, 3300);
  assert.equal(state.wallets.local.creditCents, 5000); assert.equal(creditCap(101), 25);
  assert.ok(redeemCredit(placed.state, 'GF-1', 1).error);
  const bulk = placeDirectOrder(catalog, rich(), 'sword-short', 'bulk', { ...buyer, qty: 10, title: 'Guard', creditCents: 5000 }, 'GF-2', at);
  assert.equal(bulk.order.creditCents, 5000);
  assert.ok(placeDirectOrder(catalog, rich(), 'sword-short', 'bulk', { ...buyer, qty: 10, title: 'Guard', creditCents: 5001 }, 'GF-2', at).error);
});
test('unpriced repair and custom orders reject credit; quoted work supports it once', () => {
  const input = { ...buyer, qty: 1, description: 'A ceremonial sword', creditCents: 100 };
  assert.ok(placeDirectOrder(catalog, rich(), 'sword-commission', 'custom', input, 'GF-1', at).error);
  const repair = placeRepairOrder(rich(), { ...buyer, qty: 1, itemName: 'Iron pot', damage: 'Cracked iron base', creditCents: 100 }, 'GF-1', at);
  assert.ok(repair.error);
  let state = placeDirectOrder(catalog, rich(), 'sword-commission', 'custom', { ...input, creditCents: 0 }, 'GF-1', at).state;
  state = setQuote(state, 'GF-1', '100', at).state;
  assert.match(orderCard(state.orders[0], null, { state }), /class="credit-form"/);
  assert.doesNotMatch(orderCard(state.orders[0], null, { state: { ...state, wallets: {} } }), /class="credit-form"/);
  const result = redeemCredit(state, 'GF-1', 2500);
  assert.equal(result.order.creditCents, 2500); assert.ok(setQuote(result.state, 'GF-1', '20', at).error);
});
test('canary purchases cost three crowns and cap total birds at three per expedition', () => {
  let state = rich();
  assert.ok(buyCanary(makeState(), 'local', date, 0).error);
  state = buyCanary(state, 'local', date, 1).state;
  state = buyCanary(state, 'local', date, 1).state;
  assert.equal(state.wallets.local.creditCents, 4400);
  assert.ok(buyCanary(state, 'local', date, 1).error); assert.ok(buyCanary(state, 'local', date, 0).error);
});
test('recipes cover all goods and choose closest price in the category for added products', () => {
  for (const product of catalog) assert.ok(Object.keys(recipeFor(product)).length);
  assert.deepEqual(recipeFor({ id: 'new', group: 'Sword', priceCents: 13000 }), recipeFor(catalog.find((p) => p.id === 'sword-arming')));
  assert.equal(orderNeeds({ items: [{ id: 'sword-short', qty: 3 }] }).iron, 12);
});
test('queue mining prompt reports shortages or current position and backup preserves mining', () => {
  const result = placeCartOrder(catalog, { ...rich(), cart: { 'sword-short': 1 } }, buyer, 'GF-1', at);
  assert.match(miningQueuePrompt(result.state, result.order), /4 iron/);
  assert.match(miningQueuePrompt({ ...result.state, oreStock: { iron: 4, coal: 2 } }, result.order), /#1 in line/);
  assert.deepEqual(parseBackup(createBackup(result.state, catalog), catalog).state, restoreState(result.state, catalog));
  assert.deepEqual(parseBackup(createBackup(makeState(), catalog), catalog).state, makeState());
});

test('ticket completion consumes its recipe once, buys only shortfall and records cost and savings', async () => {
  const { toggleTicket, updateStatus } = await import('../src/domain/core.js');
  let state = sellHaul(makeState(), 'local', { iron: 2, coal: 4 }, dailyPrices(date), date, at).state;
  state = placeCartOrder(catalog, { ...state, cart: { 'sword-short': 1, 'pot-small': 1 } }, buyer, 'GF-1', at).state;
  const first = toggleTicket(state, 'GF-1-0', at).state;
  assert.equal(first.oreStock.iron, 0); assert.equal(first.oreStock.coal, 2);
  assert.equal(first.orders[0].materials.bought.iron, 2); assert.equal(first.orders[0].materials.fromStock.iron, 2);
  assert.ok(first.orders[0].materials.costCents > 0); assert.ok(first.orders[0].materials.savedCents > 0);
  assert.ok(first.oreLedger.some((e) => e.kind === 'market' && e.qty === 2 && e.ore === 'iron'));
  assert.ok(toggleTicket(first, 'GF-1-0', at).error);
  const last = toggleTicket(first, 'GF-1-1', at).state;
  assert.equal(last.oreStock.coal, 1); assert.equal(last.orders[0].status, 'Delivering');
  const reopened = updateStatus(last, 'GF-1', 'Processing', at).state;
  assert.deepEqual(toggleTicket(reopened, 'GF-1-0', at).state.oreStock, last.oreStock);
  assert.deepEqual(parseBackup(createBackup(last, catalog), catalog).state, restoreState(last, catalog));
});
test('reports recognize delivered net revenue and materials, expose all five metrics in CSV', async () => {
  const { toggleTicket, updateStatus } = await import('../src/domain/core.js');
  const { businessReport, reportCsv } = await import('../src/domain/reports.js');
  let state = placeCartOrder(catalog, { ...rich(), cart: { 'sword-short': 1 } }, { ...buyer, creditCents: 1000 }, 'GF-1', at).state;
  state = toggleTicket(state, 'GF-1-0', at).state;
  state = updateStatus(state, 'GF-1', 'Delivered', at).state;
  const report = businessReport(state, { range: 'all', now: Date.parse(at) });
  assert.equal(report.current.revenueCents, 5800);
  assert.equal(report.current.grossProfitCents, 5800 - state.orders[0].materials.costCents);
  assert.equal(report.current.creditRedeemedCents, 1000);
  assert.equal(report.current.oreBoughtCents, 5000);
  for (const label of ['Material cost', 'Gross profit', 'Ore bought from customers', 'Forge Credit redeemed', 'Saved by the mine']) assert.ok(reportCsv(report).includes(label));
});
