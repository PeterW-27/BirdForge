import test from 'node:test';
import assert from 'node:assert/strict';
import { builtInCatalog as catalog } from '../src/data/catalog.js';
import { makeState, placeCartOrder, updateStatus, toggleTicket, placeDirectOrder, setQuote } from '../src/domain/core.js';
import { emptyOrb, captureUpdates, appendMessage, openCustomerOrb, pendingMessages } from '../src/domain/orb.js';
import { createBackup, parseBackup } from '../src/domain/backup.js';

const at = '2026-10-20T10:00:00.000Z';
const customer = { name: 'Orb Buyer', email: 'orb@example.com', recycle: 'no' };
const seed = () => placeCartOrder(catalog, { ...makeState(), cart: { 'sword-short': 1 } }, customer, 'GF-0001', at).state;

test('each real status transition creates one notification; repeated selections and new orders do not', () => {
  let state = seed();
  assert.equal(captureUpdates(makeState(), state, at).orb.messages.length, 0);
  for (const status of ['Processing', 'Delivering', 'Delivered', 'Processing']) {
    const next = captureUpdates(state, updateStatus(state, 'GF-0001', status).state, at);
    assert.equal(next.orb.messages.length, (state.orb?.messages.length || 0) + 1);
    assert.equal(next.orb.messages.at(-1).orderId, 'GF-0001');
    assert.equal(captureUpdates(next, updateStatus(next, 'GF-0001', status).state, at).orb.messages.length, next.orb.messages.length);
    state = next;
  }
  assert.equal(new Set(state.orb.messages.map((m) => m.id)).size, 4);
});

test('sample order changes and sample messages are excluded, including automatic completion', () => {
  const real = seed();
  const sample = { ...real, orders: real.orders.map((o) => ({ ...o, source: 'sample' })) };
  assert.equal(captureUpdates(sample, updateStatus(sample, 'GF-0001', 'Delivered').state, at).orb.messages.length, 0);
  assert.equal(captureUpdates(sample, toggleTicket(sample, 'GF-0001-0').state, at).orb.messages.length, 0);
  const raw = { ...sample, orb: appendMessage(emptyOrb(), 'notification', 'Sample update', 'GF-0001', at) };
  const backup = JSON.parse(createBackup(raw, catalog));
  assert.equal(backup.state.orb.messages.length, 0);
});

test('ticket completion and automatic commission processing notify through the same capture path', () => {
  const state = seed();
  assert.match(captureUpdates(state, toggleTicket(state, 'GF-0001-0').state, at).orb.messages[0].text, /on its way/);
  const custom = placeDirectOrder(catalog, makeState(), 'sword-commission', 'custom', { ...customer, description: 'A ceremonial sword for the palace', qty: 1 }, 'GF-0002', at).state;
  const quoted = captureUpdates(custom, setQuote(custom, 'GF-0002', '120').state, at);
  assert.equal(quoted.orb.messages.length, 2);
  assert.match(quoted.orb.messages[0].text, /working on/);
  assert.match(quoted.orb.messages[1].text, /120.00 crowns/);
});

test('opening the orb marks every received message read and shown but preserves Gunter unread customer messages', () => {
  let orb = appendMessage(emptyOrb(), 'notification', 'Update', 'GF-0001', at);
  orb = appendMessage(orb, 'gunter', 'Reply', null, at);
  orb = appendMessage(orb, 'customer', 'Question', null, at);
  orb = openCustomerOrb(orb, at);
  assert.ok(orb.messages.filter((m) => m.kind !== 'customer').every((m) => m.read && m.shown));
  assert.equal(orb.messages.at(-1).read, false);
  assert.equal(pendingMessages(orb).length, 0);
  assert.equal(openCustomerOrb(orb, '2026-10-20T10:10:00.000Z').sessions.length, 1);
  assert.equal(openCustomerOrb(orb, '2026-10-20T10:31:00.000Z').sessions.length, 2);
});

test('backup and restore preserve messages, unread state, banner state and session dividers', () => {
  const state = seed();
  state.orb = openCustomerOrb(appendMessage(emptyOrb(), 'notification', 'Update', 'GF-0001', at), at);
  state.orb = appendMessage(state.orb, 'customer', '<script>plain text</script>', 'GF-0001', at);
  const result = parseBackup(createBackup(state, catalog), catalog);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state, state);
  const malformed = JSON.parse(createBackup(state, catalog));
  malformed.state.orb.messages.push({ ...state.orb.messages[0] });
  assert.ok(parseBackup(JSON.stringify(malformed), catalog).error);
});
