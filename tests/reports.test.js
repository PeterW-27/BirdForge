import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/data/catalog.js';
import { makeState, placeCartOrder, placeRepairOrder, updateStatus, setQuote } from '../src/domain/core.js';
import { businessReport, reportCsv, reportPeriod } from '../src/domain/reports.js';

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const at = (daysAgo, hour = 10) => new Date(2026, 9, 20 - daysAgo, hour).toISOString();
const buyer = { name: 'Test Buyer', email: 'buyer@example.com', address: 'Castle', recycle: 'no' };

function sampleState() {
  let state = makeState();
  state = placeCartOrder(catalog, { ...state, cart: { 'sword-short': 2 } }, buyer, 'GF-0001', at(2)).state;
  state = placeCartOrder(catalog, { ...state, cart: { 'pot-small': 1 } }, buyer, 'GF-0002', at(1)).state;
  state = placeRepairOrder(state, { ...buyer, itemName: 'Old gate hinge', qty: 1, damage: 'The hinge snapped in the cold.' }, 'GF-0003', at(0, 9)).state;
  state = placeCartOrder(catalog, { ...state, cart: { 'pot-small': 3 } }, buyer, 'GF-0004', at(20)).state;
  state = updateStatus(state, 'GF-0001', 'Delivered', at(0, 12)).state;
  state = setQuote(state, 'GF-0003', '15', at(0, 11)).state;
  return state;
}

test('the weekly report counts orders, delivered revenue and best sellers', () => {
  const state = sampleState();
  const report = businessReport(state, { range: '7d', now: NOW });
  const sword = catalog.find((p) => p.id === 'sword-short');
  assert.equal(report.current.received, 3);
  assert.equal(report.current.byType.repair, 1);
  assert.equal(report.current.deliveredOrders, 1);
  assert.equal(report.current.revenueCents, sword.priceCents * 2);
  assert.equal(report.current.topProducts[0].name, sword.name);
  assert.match(report.summary.join(' '), /received 3 orders/);
  assert.equal(report.series.length, 7);
});

test('periods cover today, custom ranges and all time', () => {
  const today = reportPeriod('today', '', '', [], NOW);
  assert.equal(today.end - today.start, 24 * 60 * 60 * 1000);
  const custom = reportPeriod('custom', '2026-10-01', '2026-10-03', [], NOW);
  assert.equal((custom.end - custom.start) / (24 * 60 * 60 * 1000), 3);
  const all = businessReport(sampleState(), { range: 'all', now: NOW });
  assert.equal(all.current.received, 4);
});

test('the CSV export lists metrics, summary and orders', () => {
  const csv = reportCsv(businessReport(sampleState(), { range: '7d', now: NOW }));
  assert.match(csv, /^Birdforge business report/);
  assert.match(csv, /Revenue from delivered orders \(crowns\)/);
  assert.match(csv, /GF-0003/);
});
