import { ORES, emptyHaul, seededRandom, dailyPrices, mineDate } from './mining.js';
import { sellHaul } from './materials.js';

export const COLORS = Object.freeze(['#ef6461', '#5898ef', '#65ba88', '#e8bb51', '#ac83dc', '#eb8bb4']);
export const CARDS = Object.freeze({
  strike: { name: 'Pick Strike', type: 'Attack', damage: 6, text: 'Deal 6 damage.' },
  heavy: { name: 'Heavy Pick', type: 'Attack', damage: 11, text: 'Deal 11 damage.' },
  dynamite: { name: 'Dynamite', type: 'Attack', damage: 16, text: 'Deal 16 damage. Take 3 damage.' },
  shield: { name: 'Iron Shield', type: 'Defend', text: 'Gain 8 Block this turn.' },
  cover: { name: 'Cover', type: 'Defend', text: 'Give the lowest-HP teammate 6 Block.' },
  wall: { name: 'Shield Wall', type: 'Defend', text: 'Give every miner 3 Block.' },
  bandage: { name: 'Bandage', type: 'Support', text: 'Heal the lowest-HP standing miner for 6.' },
  whetstone: { name: 'Whetstone', type: 'Support', text: 'Every crew attack deals +3 damage this turn.' },
  sunder: { name: 'Armor Break', type: 'Support', text: 'Remove armor. Crew attacks deal ×1.5 damage this turn.' },
  prospect: { name: 'Gem Sense', type: 'Prospect', text: 'Add 2 iron to the crew pot.' },
  lantern: { name: 'Lantern', type: 'Prospect', text: 'Reveal the next two enemy intents.' },
  lucky: { name: 'Lucky Find', type: 'Prospect', text: 'Choose from 4 reward cards on this floor.' },
});
export const ENEMIES = Object.freeze([
  { name: 'Cave Rat', hp: 16, intents: [{ name: 'Bite', damage: 5, target: 'lowest' }, { name: 'Bite', damage: 5, target: 'lowest' }, { name: 'Scurry', steal: 2 }], reward: { coal: 4, iron: 2 } },
  { name: 'Rock Golem', hp: 28, intents: [{ name: 'Harden', armor: 8 }, { name: 'Slam', damage: 9, target: 'most' }], reward: { iron: 6, copper: 2 } },
  { name: 'Bat Swarm', hp: 22, intents: [{ name: 'Screech', damage: 3, target: 'all' }, { name: 'Screech', damage: 3, target: 'all' }, { name: 'Dive', damage: 8, target: 'lowest' }], reward: { iron: 4, copper: 3, silver: 1 } },
  { name: 'Tunnel Troll', hp: 36, intents: [{ name: 'Club', damage: 10, target: 'most' }, { name: 'Roar', buff: 5 }, { name: 'Club', damage: 10, target: 'most' }], reward: { copper: 5, silver: 3, gold: 1 } },
  { name: 'The Ore Wyrm', hp: 60, intents: [{ name: 'Tail Sweep', damage: 5, target: 'all' }, { name: 'Bite', damage: 14, target: 'most' }, { name: 'Burrow', armor: 12 }, { name: 'Tail Sweep', damage: 5, target: 'all' }], reward: { silver: 4, gold: 3, ruby: 1 } },
]);

const STARTER = ['strike', 'strike', 'strike', 'shield', 'shield', 'cover', 'bandage', 'prospect'];
const REWARDS = Object.keys(CARDS).filter((id) => !['strike', 'shield'].includes(id));
const clone = (value) => structuredClone(value);
const standing = (raid) => raid.players.filter((p) => p.hp > 0);
const lowest = (players) => players.reduce((best, p) => !best || p.hp < best.hp ? p : best, null);
const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Miner';
const shuffle = (cards, seed) => {
  const result = [...cards];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

function draw(raid, player) {
  while (player.hand.length < 3) {
    if (!player.draw.length) {
      if (!player.discard.length) break;
      player.draw = shuffle(player.discard, `${raid.seed}:${player.id}:draw:${player.shuffles++}`);
      player.discard = [];
    }
    player.hand.push(player.draw.pop());
  }
}

function enterFloor(raid) {
  const enemy = ENEMIES[raid.floor - 1];
  const hp = Math.ceil(enemy.hp * raid.players.length / 2);
  raid.enemy = { hp, maxHp: hp, armor: 0, intentIndex: 0, buff: 0 };
  raid.lanternTurns = 0;
  raid.phase = 'play';
  for (const p of raid.players) {
    if (!p.hp) p.hp = 6;
    p.block = 0;
    p.selected = null;
    p.rewardChoice = null;
    p.rewards = [];
    p.vote = null;
    p.lucky = false;
    draw(raid, p);
  }
}

export function createRaid(seed, code, at) {
  return { id: `${code}:${at}`, seed: String(seed), code, openedAt: at, phase: 'lobby', floor: 0, turn: 0, pot: emptyHaul(), players: [], enemy: null, lastEvents: [], deadline: null, revealUntil: null, lanternTurns: 0, outcome: null, settled: false };
}

export function joinRaid(raid, id, name, color) {
  if (raid.phase !== 'lobby') return { error: 'This crew has already entered the mine.' };
  if (typeof id !== 'string' || !id || id.length > 64) return { error: 'A miner needs a device ID.' };
  if (raid.players.some((p) => p.id === id)) return { raid };
  if (raid.players.length >= 6) return { error: 'This crew is full (6 miners).' };
  if (!COLORS.includes(color) || raid.players.some((p) => p.color === color)) return { error: 'Choose an available miner color.' };
  const p = { id, name: cleanName(name), color, hp: 20, block: 0, hand: [], draw: shuffle(STARTER, `${raid.seed}:${id}:starter`), discard: [], shuffles: 0, selected: null, rewards: [], rewardChoice: null, vote: null, lucky: false, settled: false, creditCents: 0, haul: emptyHaul(), stats: { damage: 0, block: 0, healing: 0 } };
  const next = clone(raid);
  draw(next, p);
  next.players.push(p);
  return { raid: next };
}

export function startRaid(raid, at) {
  if (raid.phase !== 'lobby' || raid.players.length < 2) return { error: 'Start with a crew of 2–6 miners.' };
  const next = clone(raid);
  next.floor = 1;
  enterFloor(next);
  next.deadline = new Date(Date.parse(at) + 30000).toISOString();
  return { raid: next };
}

export function playCard(raid, id, handIndex) {
  const player = raid.players.find((p) => p.id === id);
  if (raid.phase !== 'play' || !player || player.hp <= 0) return { error: 'You cannot play a card right now.' };
  if (player.selected !== null) return { error: 'Your card is already locked in.' };
  if (!Number.isInteger(handIndex) || !player.hand[handIndex]) return { error: 'Choose a card from your hand.' };
  const next = clone(raid);
  next.players.find((p) => p.id === id).selected = handIndex;
  return { raid: next };
}

export function chooseReward(raid, id, rewardIndex) {
  const player = raid.players.find((p) => p.id === id);
  if (raid.phase !== 'reward' || !player || player.rewardChoice !== null) return { error: 'You cannot choose a reward right now.' };
  if (!Number.isInteger(rewardIndex) || !player.rewards[rewardIndex]) return { error: 'Choose one of your reward cards.' };
  const next = clone(raid);
  const p = next.players.find((p) => p.id === id);
  p.rewardChoice = rewardIndex;
  p.discard.push(p.rewards[rewardIndex]);
  return { raid: next };
}

export function vote(raid, id, choice) {
  const player = raid.players.find((p) => p.id === id);
  if (raid.phase !== 'vote' || !player || !['deeper', 'home'].includes(choice) || player.vote) return { error: 'Choose Delve deeper or Head home once during the vote.' };
  const next = clone(raid);
  next.players.find((p) => p.id === id).vote = choice;
  return { raid: next };
}

function finish(raid, outcome) {
  raid.phase = 'over';
  raid.outcome = outcome;
  if (outcome === 'wipe') for (const ore of ORES) raid.pot[ore] -= Math.floor(raid.pot[ore] / 2);
}

function hit(player, amount) {
  const blocked = Math.min(player.block, amount);
  const damage = Math.min(player.hp, amount - blocked);
  player.block -= blocked;
  player.hp -= damage;
  return { player: player.id, damage, blocked };
}

function intentFor(raid, offset = 0) {
  const list = ENEMIES[raid.floor - 1].intents;
  const intent = list[(raid.enemy.intentIndex + offset) % list.length];
  let buff = raid.enemy.buff;
  for (let i = 0; i < offset; i += 1) {
    const previous = list[(raid.enemy.intentIndex + i) % list.length];
    if (previous.damage) buff = 0;
    if (previous.buff) buff += previous.buff;
  }
  const amount = intent.damage ? intent.damage + buff : 0;
  const text = intent.damage ? `${intent.name}: ${amount} damage to ${intent.target === 'all' ? 'all miners' : `the miner with the ${intent.target === 'most' ? 'most' : 'lowest'} HP`}` : intent.armor ? `${intent.name}: gain ${intent.armor} armor` : intent.steal ? `${intent.name}: steal ${intent.steal} coal from the pot` : `${intent.name}: next attack +${intent.buff} damage`;
  return { ...intent, text };
}

function combat(raid, events) {
  const plays = standing(raid).map((p) => {
    if (p.selected === null) {
      const defend = p.hand.findIndex((id) => CARDS[id].type === 'Defend');
      p.selected = defend < 0 ? 0 : defend;
    }
    const card = p.hand.splice(p.selected, 1)[0];
    p.discard.push(card);
    return { p, card };
  });
  let whetstones = 0;
  let sunder = false;
  for (const { p, card } of plays.filter(({ card }) => ['Defend', 'Support'].includes(CARDS[card].type))) {
    events.push({ type: 'card', player: p.id, card });
    const block = (target, amount) => {
      target.block += amount;
      p.stats.block += amount;
      events.push({ type: 'block', player: target.id, source: p.id, card, amount });
    };
    if (card === 'shield') block(p, 8);
    if (card === 'cover') block(lowest(standing(raid).filter((t) => t.id !== p.id)) || p, 6);
    if (card === 'wall') for (const t of standing(raid)) block(t, 3);
    if (card === 'bandage') {
      const target = lowest(standing(raid));
      const amount = Math.min(6, 20 - target.hp);
      target.hp += amount;
      p.stats.healing += amount;
      events.push({ type: 'heal', player: target.id, source: p.id, card, amount });
    }
    if (card === 'whetstone') whetstones += 1;
    if (card === 'sunder') { raid.enemy.armor = 0; sunder = true; }
  }
  for (const { p, card } of plays.filter(({ card }) => CARDS[card].type === 'Attack')) {
    if (!p.hp) continue;
    const amount = Math.floor((CARDS[card].damage + 3 * whetstones) * (sunder ? 1.5 : 1));
    const blocked = Math.min(raid.enemy.armor, amount);
    raid.enemy.armor -= blocked;
    const damage = Math.min(raid.enemy.hp, amount - blocked);
    raid.enemy.hp -= damage;
    p.stats.damage += damage;
    events.push({ type: 'attack', player: p.id, card, damage, blocked });
    if (card === 'dynamite') {
      events.push({ type: 'selfDamage', ...hit(p, 3) });
      if (!p.hp) events.push({ type: 'ko', player: p.id });
    }
  }
  for (const { p, card } of plays.filter(({ card }) => CARDS[card].type === 'Prospect')) {
    if (!p.hp) continue;
    events.push({ type: 'card', player: p.id, card });
    if (card === 'prospect') { raid.pot.iron += 2; events.push({ type: 'ore', player: p.id, haul: { iron: 2 } }); }
    if (card === 'lantern') raid.lanternTurns = 3;
    if (card === 'lucky') p.lucky = true;
  }
  if (raid.enemy.hp > 0 && standing(raid).length) {
    const intent = intentFor(raid);
    const targets = [];
    if (intent.damage) {
      const alive = standing(raid);
      const target = intent.target === 'lowest' ? lowest(alive) : alive.reduce((best, p) => !best || p.hp > best.hp ? p : best, null);
      for (const p of intent.target === 'all' ? alive : [target]) targets.push(hit(p, intent.damage + raid.enemy.buff));
      raid.enemy.buff = 0;
    }
    if (intent.armor) raid.enemy.armor += intent.armor;
    if (intent.buff) raid.enemy.buff += intent.buff;
    if (intent.steal) raid.pot.coal = Math.max(0, raid.pot.coal - intent.steal);
    const knockouts = targets.filter((t) => raid.players.find((p) => p.id === t.player).hp === 0).map((t) => ({ type: 'ko', player: t.player }));
    events.push({ type: 'enemy', intent: intent.text, targets }, ...knockouts);
    raid.enemy.intentIndex += 1;
    raid.lanternTurns = Math.max(0, raid.lanternTurns - 1);
  }
  for (const p of raid.players) { p.block = 0; p.selected = null; draw(raid, p); }
  if (!standing(raid).length) { finish(raid, 'wipe'); return; }
  if (raid.enemy.hp <= 0) {
    events.push({ type: 'enemyDown' });
    const haul = ENEMIES[raid.floor - 1].reward;
    for (const ore of ORES) raid.pot[ore] += haul[ore] || 0;
    events.push({ type: 'ore', haul });
    if (raid.floor === 5) { finish(raid, 'clear'); return; }
    raid.phase = 'reward';
    for (const p of raid.players) {
      p.rewards = shuffle(REWARDS, `${raid.seed}:${p.id}:reward:${raid.floor}`).slice(0, p.lucky ? 4 : 3);
      p.rewardChoice = null;
    }
  }
}

export function resolve(raid, at) {
  if (!raid || ['lobby', 'over'].includes(raid.phase)) return { raid, events: [] };
  const next = clone(raid);
  const events = [];
  if (next.phase === 'play') combat(next, events);
  else if (next.phase === 'reward') {
    for (const p of next.players) if (p.rewardChoice === null) { p.rewardChoice = 0; p.discard.push(p.rewards[0]); }
    next.phase = 'vote';
    for (const p of next.players) { p.rewards = []; p.vote = null; }
  } else {
    const deeper = next.players.filter((p) => p.vote === 'deeper').length;
    if (deeper > next.players.length / 2) {
      next.floor += 1;
      enterFloor(next);
      events.push({ type: 'floor', floor: next.floor });
    } else finish(next, 'home');
  }
  next.turn += 1;
  next.lastEvents = events;
  const revealMs = events.length * 700;
  next.revealUntil = new Date(Date.parse(at) + revealMs).toISOString();
  next.deadline = next.phase === 'over' ? null : new Date(Date.parse(at) + revealMs + (next.phase === 'play' ? 30000 : 15000)).toISOString();
  return { raid: next, events };
}

export function raidView(raid, viewerId) {
  if (!raid) return null;
  const players = raid.players.map((p, i) => {
    const you = p.id === viewerId;
    const publicPlayer = { id: `miner-${i + 1}`, you, name: p.name, color: p.color, hp: p.hp, block: p.block, knockedOut: p.hp === 0, locked: p.selected !== null, rewardChosen: p.rewardChoice !== null, voted: Boolean(p.vote) };
    if (you) Object.assign(publicPlayer, { hand: [...p.hand], rewards: [...p.rewards], deckCount: p.hand.length + p.draw.length + p.discard.length, vote: p.vote });
    if (raid.phase === 'over') Object.assign(publicPlayer, { haul: { ...p.haul }, creditCents: p.creditCents, stats: { ...p.stats }, settled: p.settled });
    return publicPlayer;
  });
  const publicId = (id) => { const i = raid.players.findIndex((p) => p.id === id); return i < 0 ? null : `miner-${i + 1}`; };
  const lastEvents = raid.lastEvents.map((e) => ({ ...e, ...(e.player ? { player: publicId(e.player) } : {}), ...(e.source ? { source: publicId(e.source) } : {}), ...(e.targets ? { targets: e.targets.map((t) => ({ ...t, player: publicId(t.player) })) } : {}) }));
  const enemy = raid.enemy ? { name: ENEMIES[raid.floor - 1].name, hp: raid.enemy.hp, maxHp: raid.enemy.maxHp, armor: raid.enemy.armor, intent: intentFor(raid).text, forecast: raid.lanternTurns ? [intentFor(raid).text, intentFor(raid, 1).text] : [] } : null;
  return { id: raid.id, code: raid.code, openedAt: raid.openedAt, phase: raid.phase, floor: raid.floor, turn: raid.turn, pot: { ...raid.pot }, players, enemy, lastEvents, deadline: raid.deadline, revealUntil: raid.revealUntil, outcome: raid.outcome, settled: raid.settled, votes: { deeper: raid.players.filter((p) => p.vote === 'deeper').length, home: raid.players.filter((p) => p.vote === 'home').length } };
}

export function normalizeRaid(raw) {
  if (!raw || typeof raw.seed !== 'string' || !/^[A-HJ-NP-Z]{4}$/.test(raw.code) || !['lobby', 'play', 'reward', 'vote', 'over'].includes(raw.phase)) return null;
  if (!Array.isArray(raw.players) || raw.players.length > 6 || !Number.isInteger(raw.floor) || raw.floor < 0 || raw.floor > 5 || (raw.phase !== 'lobby' && (!raw.floor || raw.players.length < 2))) return null;
  const ids = new Set();
  const colors = new Set();
  const integer = (n) => Number.isSafeInteger(n) && n >= 0;
  const cards = (list) => Array.isArray(list) && list.length <= 100 && list.every((id) => Object.hasOwn(CARDS, id));
  const haul = (h) => h && ORES.every((ore) => integer(h[ore]));
  for (const p of raw.players) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 64 || ids.has(p.id) || colors.has(p.color) || !COLORS.includes(p.color) || !integer(p.hp) || p.hp > 20 || !integer(p.block) || !cards(p.hand) || p.hand.length > 3 || !cards(p.draw) || !cards(p.discard) || !cards(p.rewards) || !integer(p.shuffles) || !haul(p.haul) || !p.stats || !['damage', 'block', 'healing'].every((k) => integer(p.stats[k]))) return null;
    if (p.selected !== null && (!integer(p.selected) || !p.hand[p.selected])) return null;
    if (p.rewardChoice !== null && (!integer(p.rewardChoice) || p.rewardChoice > 3)) return null;
    if (p.vote !== null && !['deeper', 'home'].includes(p.vote)) return null;
    ids.add(p.id); colors.add(p.color);
  }
  if (!haul(raw.pot) || !integer(raw.turn) || !Array.isArray(raw.lastEvents) || raw.lastEvents.length > 100 || !Number.isFinite(Date.parse(raw.openedAt))) return null;
  if (raw.phase !== 'lobby' && (!raw.enemy || !['hp', 'maxHp', 'armor', 'intentIndex', 'buff'].every((key) => integer(raw.enemy[key])) || !raw.enemy.maxHp || raw.enemy.hp > raw.enemy.maxHp)) return null;
  if (!['lobby', 'over'].includes(raw.phase) && !Number.isFinite(Date.parse(raw.deadline))) return null;
  const next = clone(raw);
  next.players = next.players.map((p) => ({ ...p, name: cleanName(p.name), settled: Boolean(p.settled), creditCents: integer(p.creditCents) ? p.creditCents : 0 }));
  return next;
}

export function settleRaid(state, at) {
  const raid = state.raid;
  if (!raid || raid.phase !== 'over' || raid.settled) return { state, credits: {} };
  const nextRaid = clone(raid);
  const date = mineDate(at);
  const prices = dailyPrices(date);
  const share = Object.fromEntries(ORES.map((ore) => [ore, Math.floor(raid.pot[ore] / raid.players.length)]));
  let next = state;
  const credits = {};
  for (const p of nextRaid.players) {
    if (p.settled) continue;
    const sold = sellHaul(next, p.id, share, prices, date, at);
    next = sold.state;
    credits[p.id] = sold.creditCents;
    Object.assign(p, { settled: true, haul: { ...share }, creditCents: sold.creditCents });
  }
  const stock = { ...emptyHaul(), ...next.oreStock };
  const ledger = [...(next.oreLedger || [])];
  for (const ore of ORES) {
    const qty = raid.pot[ore] % raid.players.length;
    stock[ore] += qty;
    if (qty) ledger.push({ at, kind: 'bought', ore, qty, cents: 0 });
  }
  nextRaid.settled = true;
  return { state: { ...next, oreStock: stock, oreLedger: ledger.slice(-500), raid: nextRaid }, credits };
}
