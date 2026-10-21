import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../server/server.js';
import { applyAction, customerView } from '../src/domain/actions.js';
import { makeState } from '../src/domain/core.js';
import { builtInCatalog } from '../src/data/catalog.js';
import { COLORS } from '../src/domain/raid.js';

const at = '2026-10-21T15:00:00.000Z';

test('server actions restrict roles and rooms, auto-resolve a crew, and settle each wallet', () => {
  let state = makeState();
  const act = (type, extra = {}, role = 'smith', owner = null, time = at) => {
    const result = applyAction(builtInCatalog, state, { type, ...extra }, { role, owner, at: time, raidSeed: 'server-private-seed' });
    if (result.state) state = result.state;
    return result;
  };
  assert.match(act('raid.open', {}, 'customer', 'alice').error, /not allowed/);
  act('raid.open');
  assert.match(act('raid.join', { code: 'ZZZZ', name: 'Alice', color: COLORS[0] }, 'customer', 'alice').error, /code is not open/);
  const code = state.raid.code;
  act('raid.join', { code, name: 'Alice', color: COLORS[0] }, 'customer', 'alice');
  assert.match(act('raid.start').error, /2–6/);
  act('raid.join', { code, name: 'Bob', color: COLORS[1] }, 'customer', 'bob');
  assert.match(act('raid.join', { code, color: COLORS[1] }, 'customer', 'carol').error, /available/);
  act('raid.start');
  assert.match(act('raid.join', { code, color: COLORS[2] }, 'customer', 'carol').error, /code is not open/);
  const own = customerView(state, 'alice');
  assert.equal(own.raid, undefined);
  assert.ok(own.raidView.players[0].hand);
  assert.equal(own.raidView.players[1].hand, undefined);
  state.raid.players.forEach((p) => { p.hand = ['heavy', 'strike', 'shield']; });
  state.raid.enemy.hp = 1;
  act('raid.play', { handIndex: 0 }, 'customer', 'alice');
  assert.equal(state.raid.phase, 'play');
  act('raid.play', { handIndex: 0 }, 'customer', 'bob');
  assert.equal(state.raid.phase, 'reward');
  assert.match(act('raid.reward', { rewardIndex: 0 }, 'customer', 'alice').error, /reveal/);
  const later = '2026-10-21T15:01:00.000Z';
  act('raid.reward', { rewardIndex: 0 }, 'customer', 'alice', later);
  act('raid.reward', { rewardIndex: 0 }, 'customer', 'bob', later);
  assert.equal(state.raid.phase, 'vote');
  act('raid.vote', { choice: 'home' }, 'customer', 'alice', later);
  act('raid.vote', { choice: 'home' }, 'customer', 'bob', later);
  assert.equal(state.raid.phase, 'over');
  assert.ok(state.raid.settled);
  assert.ok(state.wallets.alice.creditCents > 0);
  assert.equal(state.wallets.alice.creditCents, state.wallets.bob.creditCents);
  assert.equal(state.oreStock.coal, 4);
  const wallet = structuredClone(state.wallets);
  assert.match(act('raid.resolve', {}, 'smith', null, later).error, /countdown/);
  assert.deepEqual(state.wallets, wallet);
});

test('HTTP responses redact all hands on the stage and keep each phone private', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'birdforge-raid-'));
  const server = startServer({ dataDir, publicPort: 0, adminPort: 0 });
  await server.ready;
  const call = async (role, owner, action) => {
    const port = (role === 'smith' ? server.adminAddress() : server.publicAddress()).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/${action ? 'actions' : 'state'}`, { method: action ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(owner ? { 'x-birdforge-client': owner } : {}) }, ...(action ? { body: JSON.stringify(action) } : {}) });
    return response.json();
  };
  try {
    const opened = await call('smith', null, { type: 'raid.open' });
    const code = opened.shared.raidView.code;
    for (let i = 0; i < 6; i += 1) assert.equal((await call('customer', `device-miner-${i}`, { type: 'raid.join', code, name: `Miner ${i}`, color: COLORS[i] })).ok, true);
    assert.match((await call('customer', 'device-seventh', { type: 'raid.join', code, color: COLORS[0] })).error, /full/);
    assert.equal((await call('smith', null, { type: 'raid.start' })).ok, true);
    const stage = (await call('smith')).shared;
    const phone = (await call('customer', 'device-miner-0')).shared;
    assert.equal(stage.raid, undefined);
    assert.ok(stage.raidView.players.every((p) => p.hand === undefined));
    assert.ok(phone.raidView.players[0].hand);
    assert.ok(phone.raidView.players.slice(1).every((p) => p.hand === undefined));
    for (const view of [stage, phone]) assert.ok(!JSON.stringify(view.raidView).includes(server.getState().raid.seed));
  } finally {
    await server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
