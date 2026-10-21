import { ORES } from '../../domain/mining.js';
import { CARDS, COLORS, ENEMIES } from '../../domain/raid.js';
import { buyPrice, walletFor } from '../../domain/materials.js';
import { money, escapeHTML } from '../../domain/core.js';

const text = escapeHTML;
const potValue = (haul, prices) => ORES.reduce((n, ore) => n + (haul?.[ore] || 0) * buyPrice(prices[ore]), 0);
const haulText = (haul) => ORES.filter((ore) => haul?.[ore]).map((ore) => `${haul[ore]} ${ore}`).join(', ') || 'No ore';
const seconds = (view) => Math.max(0, Math.ceil((Date.parse(view.deadline) - Math.max(Date.now(), Date.parse(view.revealUntil) || 0)) / 1000));
const revealing = (view) => Date.now() < Date.parse(view?.revealUntil);
const hpBar = (hp, max = 20) => `<div class="raid-hp" role="meter" aria-label="HP" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${hp}"><span style="width:${100 * hp / max}%"></span></div><small>${hp}/${max} HP</small>`;
const countdown = (view) => view.deadline ? `<span class="raid-clock" data-raid-clock aria-label="Seconds remaining">${seconds(view)}</span>` : '';
const cardButton = (id, index, action, selected, disabled) => {
  const card = CARDS[id];
  return `<button type="button" class="raid-card card-${card.type.toLowerCase()} ${selected ? 'is-selected' : ''}" data-action="${action}" data-id="${index}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}><strong>${card.name}</strong><span>${card.text}</span><small>${card.type}</small></button>`;
};

function joinForm(view) {
  const taken = new Set(view?.players.map((p) => p.color));
  return `<form id="raid-join" class="surface raid-panel"><h2>Join the crew</h2><label>Room code<input name="code" required maxlength="4" minlength="4" pattern="[A-HJ-NP-Za-hj-np-z]{4}" autocomplete="off" autocapitalize="characters" placeholder="ABCD" value=""></label><label>Your miner name<input name="name" required maxlength="24" autocomplete="nickname" placeholder="Sir Pebble"></label><fieldset class="raid-colors"><legend>Choose your color</legend>${COLORS.map((color) => `<label style="--miner:${color}"><input type="radio" name="color" value="${color}" required ${taken.has(color) ? 'disabled' : ''}><span aria-label="${['Red', 'Blue', 'Green', 'Gold', 'Purple', 'Pink'][COLORS.indexOf(color)]}"></span></label>`).join('')}</fieldset><button class="button" type="submit" ${view?.phase !== 'lobby' ? 'disabled' : ''}>Join</button>${view?.phase !== 'lobby' ? '<p>Wait for Gunter to open the next room.</p>' : ''}</form>`;
}

function phonePanel(view, you, prices, selected) {
  if (!you) return joinForm(view);
  if (view.phase === 'lobby') return `<div class="surface raid-panel"><h2>You're in! Watch the big screen.</h2><p>${text(you.name)} · ${view.players.length}/6 miners</p></div>`;
  if (view.phase === 'over') return `<div class="surface raid-panel"><h2>${view.outcome === 'clear' ? 'The mine is cleared!' : view.outcome === 'wipe' ? 'The crew fell. Half the pot was lost.' : 'Home with the haul!'}</h2><p>You earned <strong>${money(you.creditCents || 0)} Forge Credit</strong></p><p>${text(haulText(you.haul))}</p><p>Daily earnings are capped at 50.00 crowns. Watch for the next room.</p></div>`;
  const ready = revealing(view);
  const reveal = ready ? '<p class="raid-reveal-note" role="status">Watch the big screen — revealing the turn…</p>' : '';
  if (view.phase === 'reward') return `<div class="surface raid-panel"><h2>Choose a reward</h2>${reveal}${you.rewardChosen ? '<p>Reward chosen · waiting for team</p>' : `<div class="raid-hand">${you.rewards.map((id, i) => cardButton(id, i, 'raid-reward', false, ready)).join('')}</div>`}</div>`;
  if (view.phase === 'vote') return `<div class="surface raid-panel"><h2>Delve deeper, or head home?</h2><p>Pot: ${money(potValue(view.pot, prices))} · Next floor: ${ENEMIES[view.floor]?.name || 'Surface'}</p>${reveal}${you.voted ? `<p>Vote locked · ${you.vote === 'deeper' ? 'Delve deeper' : 'Head home'}</p>` : `<div class="raid-vote"><button class="button" data-action="raid-deeper" ${ready ? 'disabled' : ''}>Delve deeper</button><button class="button button-secondary" data-action="raid-home" ${ready ? 'disabled' : ''}>Head home</button></div>`}<p>${view.votes.deeper} deeper · ${view.votes.home} home · Ties and missing votes mean home.</p></div>`;
  if (you.knockedOut) return '<div class="surface raid-panel"><h2>Knocked out — cheer your team!</h2><p>Reach the next floor to return with 6 HP.</p></div>';
  const alive = view.players.filter((p) => !p.knockedOut);
  const locked = alive.filter((p) => p.locked).length;
  const card = CARDS[you.hand?.[selected]];
  return `<div class="surface raid-panel">${reveal}${you.locked ? `<h2>Locked in · waiting for team (${locked}/${alive.length})</h2>` : `<div class="raid-hand">${you.hand.map((id, i) => cardButton(id, i, 'raid-select', selected === i, ready)).join('')}</div>${card ? `<button class="button raid-play" data-action="raid-play" ${ready ? 'disabled' : ''}>Play ${card.name}</button>` : '<p>Choose a card, then lock it in.</p>'}`}</div>`;
}

export function minePage(state, view, prices, { online = false, selected = null } = {}) {
  if (!online) return '<section class="mine-page"><p>Gunter\'s Mine needs the online shop. Visit birdforge.shop to play.</p></section>';
  const you = view?.players.find((p) => p.you);
  const wallet = walletFor(state);
  return `<section class="mine-page"><header class="mine-hero"><p class="eyebrow">A crew. A deck. Five floors.</p><h1>Gunter's Mine</h1><p>Join a crew of 2–6 on your phone. The fight plays out on the big screen.</p></header>${view && you && view.phase !== 'lobby' ? `<div class="raid-phone-top"><strong>Floor ${view.floor}/5</strong><span>${money(potValue(view.pot, prices))}</span>${countdown(view)}<div class="raid-your-hp">${hpBar(you.hp)}<span>Block: ${you.block}</span></div></div>${view.enemy ? `<p class="raid-intent">⚒ ${text(view.enemy.intent)}</p>${view.enemy.forecast.length ? `<p class="raid-forecast">Lantern: ${view.enemy.forecast.map(text).join(' → ')}</p>` : ''}` : ''}` : ''}${phonePanel(view, you, prices, selected)}<p class="raid-wallet">Forge Credit: ${money(wallet.creditCents)} · Use up to 25% at checkout.</p></section>`;
}

function minerSVG(color) {
  return `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M28 86h44l8 28H62l-12-18-12 18H20Z" fill="${color}"/><rect x="30" y="56" width="40" height="36" rx="10" fill="${color}"/><circle cx="50" cy="38" r="21" fill="#eec8a0"/><path d="M23 34a27 27 0 0 1 54 0Z" fill="${color}"/><path d="M21 35h58" stroke="#f6dfa2" stroke-width="6"/><circle cx="50" cy="24" r="8" fill="#fff9c7"/><circle cx="43" cy="42" r="2"/><circle cx="57" cy="42" r="2"/><path d="M15 57l-4 36M4 57l22 6" stroke="#b6c5cc" stroke-width="6"/></svg>`;
}

function enemySVG(floor) {
  const shapes = [
    '<ellipse cx="120" cy="110" rx="66" ry="42" fill="#907a89"/><circle cx="67" cy="72" r="24" fill="#ba99aa"/><path d="M180 114q55-65 38-10" fill="none" stroke="#ba99aa" stroke-width="12"/><path d="M52 114l-32 6 30 14Z" fill="#b9a1b1"/>',
    '<path d="M51 72l39-44 62 8 39 48-10 76-59 22-69-31Z" fill="#8e9e9a"/><path d="M20 106l39-22 15 56-37 17ZM177 79l47 30-16 47-33-19Z" fill="#6e807c"/><path d="M91 96l29 12 38-18" fill="none" stroke="#d3e1d4" stroke-width="8"/>',
    '<path d="M120 80Q75 8 12 54l25 43 30-5 12 36 32-8 9 44 9-44 32 8 12-36 30 5 25-43Q165 8 120 80Z" fill="#9971c3"/><path d="M108 67l-8-24 20 15 20-15-8 24" fill="#c093e9"/>',
    '<path d="M56 172l14-76 15-36 62-4 34 46 16 70-52 10-29-35-16 35Z" fill="#758e5d"/><circle cx="120" cy="64" r="38" fill="#91a777"/><path d="M90 82l8 14 8-15M136 82l8 14 8-15" stroke="#eee4cb" stroke-width="7"/><path d="M196 169l-6-88 18-12 21 16-3 40-23 6" stroke="#8d6644" stroke-width="14"/>',
    '<path d="M40 165Q200 210 183 122T91 72q-10-47 34-47l48 15-24 21-30-12q44 42 40 79t-96 22" fill="#ab7550" stroke="#e8b65c" stroke-width="9"/><path d="M114 23l-8-21 25 22 20-20 4 30" fill="#e8b65c"/><path d="M91 72L61 43l6 56M182 123l35-22-13 47" fill="#d5a357"/>',
  ];
  return `<svg viewBox="0 0 240 200" aria-hidden="true">${shapes[floor - 1]}<circle cx="107" cy="65" r="5" fill="#fff3ad"/><circle cx="139" cy="65" r="5" fill="#fff3ad"/></svg>`;
}

function stagePlayers(view) {
  return `<div class="raid-crew">${view.players.map((p) => `<article class="raid-miner ${p.knockedOut ? 'is-ko' : ''}" data-miner="${p.id}" style="--miner:${p.color}"><span class="raid-float" data-raid-float></span>${minerSVG(p.color)}<strong>${text(p.name)}</strong>${hpBar(p.hp)}<span>⛨ ${p.block} ${p.locked ? '✓ Locked' : view.phase === 'lobby' ? 'Ready' : p.knockedOut ? 'Knocked out' : 'Choosing'}</span></article>`).join('')}</div>`;
}

function stageResults(view) {
  const titles = [['Most damage', 'damage'], ['Best shield', 'block'], ['Medic', 'healing']];
  return `<div class="raid-results"><h2>${view.outcome === 'clear' ? 'The Ore Wyrm is defeated!' : view.outcome === 'wipe' ? 'Crew wiped out · Half the pot lost' : 'The crew heads home'}</h2><div class="raid-awards">${titles.map(([title, key]) => {
    const best = view.players.reduce((winner, p) => !winner || p.stats[key] > winner.stats[key] ? p : winner, null);
    return `<p><strong>${title}</strong><span>${text(best?.name)} · ${best?.stats[key] || 0}</span></p>`;
  }).join('')}</div><ul>${view.players.map((p) => `<li><strong>${text(p.name)}</strong><span>${text(haulText(p.haul))}</span><b>${money(p.creditCents)} Forge Credit</b></li>`).join('')}</ul><button class="button" data-action="raid-open">New room</button></div>`;
}

export function raidStage(view, prices, online = false) {
  if (!online) return '<p>Gunter\'s Mine needs the online shop. Visit birdforge.shop to play.</p>';
  return `<section class="raid-stage" id="raid-stage"><header class="raid-stage-tools"><strong>Gunter's Mine</strong><button class="button button-secondary" data-action="raid-fullscreen">Fullscreen</button>${view && ['lobby', 'over'].includes(view.phase) ? '<button class="text-button" data-action="raid-close">Close room</button>' : ''}</header>${!view ? '<div class="raid-lobby"><h2>Gather a crew of 2–6</h2><button class="button" data-action="raid-open">Open room</button></div>' : view.phase === 'lobby' ? `<div class="raid-lobby"><p>birdforge.shop → Mine</p><h2 class="raid-code">${text(view.code)}</h2><p>Enter this room code on your phone · ${view.players.length}/6 joined</p><button class="button" data-action="raid-start" ${view.players.length < 2 ? 'disabled' : ''}>Start</button></div>${stagePlayers(view)}` : `<div class="raid-stage-top"><ol aria-label="Mine floors">${ENEMIES.map((_, i) => `<li class="${i + 1 === view.floor ? 'is-current' : i + 1 < view.floor ? 'is-done' : ''}">${i === 4 ? '♛' : i + 1}</li>`).join('')}</ol><div class="raid-pot" data-raid-pot>Ore pot <strong>${money(potValue(view.pot, prices))}</strong><small>${text(haulText(view.pot))}</small></div>${countdown(view)}</div>${view.floor === 5 && revealing(view) && view.lastEvents.some((e) => e.type === 'floor') ? '<h2 class="raid-boss-title">The Ore Wyrm awakens</h2>' : ''}<div class="raid-event" data-raid-event role="status" aria-live="polite"></div>${view.phase === 'over' && !revealing(view) ? stageResults(view) : `<div class="raid-arena"><div class="raid-enemy" data-raid-enemy><span class="raid-float raid-enemy-damage" data-raid-enemy-float></span><span class="raid-ore-flight" data-raid-ore-flight></span>${enemySVG(view.floor)}<h2>${text(view.enemy.name)}</h2>${hpBar(view.enemy.hp, view.enemy.maxHp)}<p>Armor: ${view.enemy.armor}</p><p class="raid-intent">${text(view.enemy.intent)}</p>${view.enemy.forecast.length ? `<p>Lantern: ${view.enemy.forecast.map(text).join(' → ')}</p>` : ''}</div><div class="raid-phase-panel">${view.phase === 'reward' ? `<h2>Choose a reward on your phone</h2>${view.players.map((p) => `<p>${text(p.name)} ${p.rewardChosen ? '✓ Ready' : '… Choosing'}</p>`).join('')}` : view.phase === 'vote' ? `<h2>Delve deeper or Head home?</h2><p class="raid-vote-count">${view.votes.deeper} / ${view.votes.home}</p><p>Ties and missing votes mean home.</p><p>Next floor: ${ENEMIES[view.floor]?.name}</p>` : '<h2>Choose your cards</h2><p>Defend & support → Attack → Prospect → Enemy</p><p>Lock one card on your phone. Work together.</p>'}</div></div>`}${stagePlayers(view)}`}</section>`;
}
