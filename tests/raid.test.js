import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, COLORS, ENEMIES, createRaid, joinRaid, startRaid, playCard, chooseReward, vote, resolve, raidView, normalizeRaid, settleRaid } from '../src/domain/raid.js';
import { makeState, restoreState } from '../src/domain/core.js';
import { builtInCatalog } from '../src/data/catalog.js';

const at = '2026-10-21T15:00:00.000Z';
function crew(n = 2) {
  let raid = createRaid('private-test-seed', 'ABCD', at);
  for (let i = 0; i < n; i += 1) raid = joinRaid(raid, `player-${i}`, `Miner ${i}`, COLORS[i]).raid;
  return startRaid(raid, at).raid;
}
function cards(raid, ids) {
  raid.players.forEach((p, i) => { p.hand = [ids[i], 'strike', 'shield']; p.selected = 0; });
  return raid;
}

test('seeded personal decks, enemy scaling, capacity, and restore are stable', () => {
  assert.deepEqual(crew(), crew());
  assert.equal(crew(6).enemy.hp, ENEMIES[0].hp * 3);
  assert.deepEqual(normalizeRaid(crew()), crew());
  assert.deepEqual(restoreState({ ...makeState(), raid: crew() }, builtInCatalog).raid, crew());
  assert.equal(normalizeRaid({ phase: 'play' }), null);
  let room = createRaid('seed', 'ABCD', at);
  assert.match(startRaid(room, at).error, /2–6/);
  for (let i = 0; i < 6; i += 1) room = joinRaid(room, `p${i}`, 'Miner', COLORS[i]).raid;
  assert.match(joinRaid(room, 'extra', 'Extra', COLORS[0]).error, /full/);
  assert.match(joinRaid(crew(), 'late', 'Late', COLORS[2]).error, /already/);
});

test('defend and support precede attacks and prospect, with stacking bonuses and armor break', () => {
  const raid = cards(crew(4), ['heavy', 'whetstone', 'sunder', 'prospect']);
  raid.enemy.hp = 80; raid.enemy.maxHp = 80; raid.enemy.armor = 12;
  const before = structuredClone(raid);
  const { raid: next, events } = resolve(raid, at);
  assert.deepEqual(raid, before);
  const attack = events.find((e) => e.type === 'attack');
  assert.equal(attack.damage, 21);
  assert.equal(attack.blocked, 0);
  assert.ok(events.findIndex((e) => e.card === 'whetstone') < events.indexOf(attack));
  assert.ok(events.indexOf(attack) < events.findIndex((e) => e.type === 'ore'));
  assert.ok(events.findIndex((e) => e.type === 'ore') < events.findIndex((e) => e.type === 'enemy'));
  assert.equal(next.pot.iron, 2);
  assert.ok(next.players.every((p) => p.hand.length === 3));
  const stacked = cards(crew(3), ['heavy', 'whetstone', 'whetstone']);
  stacked.enemy.hp = 80; stacked.enemy.maxHp = 80;
  assert.equal(resolve(stacked, at).events.find((e) => e.type === 'attack').damage, 17);
});

test('shield absorbs damage and expires; timeout chooses Defend before the first card', () => {
  const raid = crew();
  raid.players[0].hand = ['strike', 'shield', 'prospect'];
  raid.players[1].hand = ['prospect', 'strike', 'strike'];
  const { raid: next, events } = resolve(raid, at);
  assert.equal(next.players[0].hp, 20);
  assert.ok(next.players.every((p) => p.block === 0));
  assert.equal(events.find((e) => e.type === 'enemy').targets[0].blocked, 5);
  assert.equal(events.find((e) => e.type === 'card').card, 'shield');
  const armored = cards(crew(), ['strike', 'prospect']);
  armored.enemy.armor = 4;
  const attack = resolve(armored, at).events.find((e) => e.type === 'attack');
  assert.equal(attack.blocked, 4);
  assert.equal(attack.damage, 2);
});

test('KO miners cannot play, stay down through healing, revive next floor, and wipes lose floor(half)', () => {
  let raid = cards(crew(), ['bandage', 'strike']);
  raid.players[0].hp = 0;
  assert.match(playCard(raid, 'player-0', 0).error, /cannot/);
  raid.players[1].hand[0] = 'bandage';
  const healed = resolve(raid, at).raid;
  assert.equal(healed.players[0].hp, 0);
  raid.phase = 'vote'; raid.players.forEach((p) => { p.vote = 'deeper'; });
  assert.equal(resolve(raid, at).raid.players[0].hp, 6);
  raid = cards(crew(), ['prospect', 'prospect']);
  raid.floor = 3; raid.players.forEach((p) => { p.hp = 1; });
  raid.pot.coal = 5;
  const wiped = resolve(raid, at).raid;
  assert.equal(wiped.phase, 'over');
  assert.equal(wiped.outcome, 'wipe');
  assert.equal(wiped.pot.coal, 3);
  assert.ok(wiped.players.every((p) => p.hp === 0));
});

test('rewards add one card, default reward is first, and votes require a strict majority', () => {
  let raid = cards(crew(), ['lucky', 'heavy']);
  raid.enemy.hp = 1;
  raid = resolve(raid, at).raid;
  assert.equal(raid.phase, 'reward');
  assert.equal(raid.players[0].rewards.length, 4);
  assert.equal(raid.players[1].rewards.length, 3);
  assert.equal(new Set(raid.players[0].rewards).size, 4);
  assert.ok(raid.players[0].rewards.every((id) => !['strike', 'shield'].includes(id)));
  raid = chooseReward(raid, 'player-0', 1).raid;
  assert.match(chooseReward(raid, 'player-0', 0).error, /cannot/);
  const first = raid.players[1].rewards[0];
  raid = resolve(raid, at).raid;
  assert.equal(raid.phase, 'vote');
  assert.equal(raid.players[1].discard.at(-1), first);
  raid = vote(raid, 'player-0', 'deeper').raid;
  assert.equal(resolve(raid, at).raid.outcome, 'home');
  raid = vote(raid, 'player-1', 'deeper').raid;
  assert.equal(resolve(raid, at).raid.floor, 2);
  assert.equal(resolve(raid, at).raid.phase, 'play');
});

test('only the owner sees a hand and rewards; the stage and other miners never see seed or picks', () => {
  let raid = crew();
  raid = playCard(raid, 'player-0', 0).raid;
  raid.players[0].rewards = ['heavy', 'lucky', 'wall'];
  const owner = raidView(raid, 'player-0');
  assert.deepEqual(owner.players[0].hand, raid.players[0].hand);
  assert.equal(owner.players[0].locked, true);
  for (const view of [raidView(raid, null), raidView(raid, 'player-1')]) {
    const other = view.players[0];
    for (const key of ['hand', 'draw', 'discard', 'rewards', 'deckCount', 'selected']) assert.equal(other[key], undefined);
    assert.ok(!JSON.stringify(view).includes(raid.seed));
    assert.ok(!JSON.stringify(view).includes('player-0'));
  }
  const done = resolve(raid, at).raid;
  assert.ok(raidView(done, null).lastEvents.some((e) => e.player === 'miner-1' && CARDS[e.card]));
});

test('settlement splits every ore, stocks remainders, respects the daily cap, and runs once', () => {
  const raid = crew();
  raid.phase = 'over'; raid.outcome = 'home'; raid.pot.iron = 5; raid.pot.ruby = 3;
  const done = settleRaid({ ...makeState(), raid }, at).state;
  assert.equal(done.oreStock.iron, 5);
  assert.equal(done.oreStock.ruby, 3);
  for (const p of done.raid.players) {
    assert.equal(p.haul.iron, 2);
    assert.equal(p.haul.ruby, 1);
    assert.equal(p.creditCents, 5000);
    assert.equal(done.wallets[p.id].creditCents, p.creditCents);
  }
  assert.deepEqual(settleRaid(done, at).state, done);
});
