import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../server/server.js';

const customerInput = (name) => ({ name, email: `${name.toLowerCase()}@example.com`, address: '12 Castle Road', notes: '', recycle: 'no', recycleDetails: '' });

async function withServer(callback) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'birdforge-'));
  const server = startServer({ dataDir, publicPort: 0, adminPort: 0 });
  await server.ready;
  const shop = `http://127.0.0.1:${server.publicAddress().port}`;
  const forge = `http://127.0.0.1:${server.adminAddress().port}`;
  const call = (base, client) => async (pathname, body) => {
    const response = await fetch(base + pathname, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(client ? { 'x-birdforge-client': client } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
  };
  try {
    await callback({ server, dataDir, alice: call(shop, 'device-alice-0001'), bob: call(shop, 'device-bob-00002'), gunter: call(forge), anonymous: call(shop) });
  } finally {
    await server.close();
  }
}

test('two devices get separate order numbers and only see their own details', () => withServer(async ({ alice, bob, gunter }) => {
  const first = await alice('/api/actions', { type: 'order.cart', cart: { 'sword-short': 1 }, input: customerInput('Alice') });
  const second = await bob('/api/actions', { type: 'order.cart', cart: { 'pot-small': 2 }, input: customerInput('Bob') });
  assert.equal(first.body.result.orderId, 'GF-0001');
  assert.equal(second.body.result.orderId, 'GF-0002');
  const bobView = second.body.shared;
  const aliceOrder = bobView.orders.find((o) => o.id === 'GF-0001');
  assert.equal(aliceOrder.source, 'sample');
  assert.equal(aliceOrder.customer.name, '');
  assert.equal(aliceOrder.customer.email, '');
  assert.equal(bobView.orders.find((o) => o.id === 'GF-0002').customer.name, 'Bob');
  assert.ok(!JSON.stringify(bobView).includes('alice@example.com'));
  const full = await gunter('/api/state');
  assert.equal(full.body.shared.orders.length, 2);
  assert.equal(full.body.shared.orders[0].customer.email, 'alice@example.com');
}));

test('Gunter status changes reach the customer as a notification and the queue moves', () => withServer(async ({ alice, bob, gunter }) => {
  await alice('/api/actions', { type: 'order.cart', cart: { 'sword-short': 1 }, input: customerInput('Alice') });
  await bob('/api/actions', { type: 'order.cart', cart: { 'pot-small': 1 }, input: customerInput('Bob') });
  const changed = await gunter('/api/actions', { type: 'ticket.complete', id: 'GF-0001-0' });
  assert.equal(changed.body.result.advanced, true);
  const view = (await alice('/api/state')).body.shared;
  assert.equal(view.orders.find((o) => o.id === 'GF-0001').status, 'Delivering');
  assert.ok(view.orb.messages.some((m) => m.kind === 'notification' && m.orderId === 'GF-0001'));
  const bobView = (await bob('/api/state')).body.shared;
  assert.equal(bobView.orb.messages.length, 0);
}));

test('stale status changes from another screen are refused', () => withServer(async ({ alice, gunter }) => {
  await alice('/api/actions', { type: 'order.cart', cart: { 'sword-short': 1 }, input: customerInput('Alice') });
  const ok = await gunter('/api/actions', { type: 'order.status', id: 'GF-0001', status: 'Processing', from: 'Placed' });
  assert.equal(ok.body.ok, true);
  const stale = await gunter('/api/actions', { type: 'order.status', id: 'GF-0001', status: 'Delivered', from: 'Placed' });
  assert.match(stale.body.error, /another screen/);
}));

test('customers cannot run workshop actions or message about other orders', () => withServer(async ({ alice, bob, anonymous }) => {
  await alice('/api/actions', { type: 'order.cart', cart: { 'sword-short': 1 }, input: customerInput('Alice') });
  const blocked = await bob('/api/actions', { type: 'order.status', id: 'GF-0001', status: 'Delivered' });
  assert.match(blocked.body.error, /not allowed/);
  const reset = await bob('/api/actions', { type: 'demo.reset' });
  assert.match(reset.body.error, /not allowed/);
  const nosy = await bob('/api/actions', { type: 'message.send', text: 'Hello', orderId: 'GF-0001' });
  assert.match(nosy.body.error, /your own orders/);
  const own = await alice('/api/actions', { type: 'message.send', text: 'When is it ready?', orderId: 'GF-0001' });
  assert.equal(own.body.ok, true);
  const missing = await anonymous('/api/state');
  assert.equal(missing.status, 400);
}));

test('a retried request does not create a second order', () => withServer(async ({ alice }) => {
  const action = { type: 'order.cart', cart: { 'sword-short': 1 }, input: customerInput('Alice'), requestId: 'retry-0001' };
  await alice('/api/actions', action);
  const again = await alice('/api/actions', action);
  assert.equal(again.body.shared.orders.length, 1);
}));

test('orders survive a server restart', async () => {
  let dataDir;
  await withServer(async (ctx) => {
    dataDir = ctx.dataDir;
    await ctx.alice('/api/actions', { type: 'order.cart', cart: { 'sword-short': 1 }, input: customerInput('Alice') });
  });
  const saved = JSON.parse(await readFile(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(saved.orders.length, 1);
  const server = startServer({ dataDir, publicPort: 0, adminPort: 0 });
  await server.ready;
  try {
    assert.equal(server.getState().orders[0].id, 'GF-0001');
  } finally {
    await server.close();
  }
});

test('the public site never serves the workshop page', () => withServer(async ({ alice, gunter }) => {
  const forgePage = await alice('/forge.html');
  assert.equal(forgePage.status, 404);
  const dataFile = await alice('/data/state.json');
  assert.equal(dataFile.status, 404);
  const shop = await alice('/');
  assert.match(shop.body, /data-sync="server"/);
  const workshop = await gunter('/');
  assert.match(workshop.body, /src\/forge\.js/);
  assert.match(workshop.body, /data-other-app=/);
}));

test('each device has a private general inquiry that Gunter can answer', () => withServer(async ({ alice, bob, gunter }) => {
  const asked = await alice('/api/actions', { type: 'message.send', text: 'Do you make horseshoes?', orderId: null });
  assert.equal(asked.body.ok, true);
  const bobView = (await bob('/api/state')).body.shared;
  assert.equal(bobView.orb.messages.length, 0);
  const board = (await gunter('/api/state')).body.shared;
  const question = board.orb.messages.find((m) => m.text === 'Do you make horseshoes?');
  assert.equal(question.owner, 'device-alice-0001');
  const reply = await gunter('/api/actions', { type: 'message.send', text: 'Yes, ask for a commission.', orderId: null, owner: question.owner });
  assert.equal(reply.body.ok, true);
  const aliceView = (await alice('/api/state')).body.shared;
  assert.deepEqual(aliceView.orb.messages.map((m) => m.kind), ['customer', 'gunter']);
  assert.equal((await bob('/api/state')).body.shared.orb.messages.length, 0);
  const stray = await gunter('/api/actions', { type: 'message.send', text: 'Hello?', orderId: null, owner: 'device-nobody-001' });
  assert.match(stray.body.error, /customer conversation/);
}));
