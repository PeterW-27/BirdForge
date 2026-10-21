import { dailyPrices, mineDate, seededRandom } from './mining.js';
import { walletFor, redeemCredit } from './materials.js';
import { createRaid, joinRaid, startRaid, playCard, chooseReward, vote, resolve, settleRaid, raidView } from './raid.js';
import { makeState, nextOrderId, placeCartOrder, placeDirectOrder, placeRepairOrder, updateStatus, setQuote, toggleTicket, restoreState } from './core.js';
import { addProduct, removeProduct } from './products.js';
import { appendMessage, captureUpdates, normalizeOrb } from './orb.js';
import { addSampleOrders } from '../data/samples.js';

export const CUSTOMER_ACTIONS = Object.freeze(['order.cart', 'order.direct', 'order.repair', 'order.credit', 'raid.join', 'raid.play', 'raid.reward', 'raid.vote', 'message.send', 'message.read']);
export const SMITH_ACTIONS = Object.freeze(['raid.open', 'raid.start', 'raid.resolve', 'raid.close', 'order.status', 'order.quote', 'ticket.complete', 'product.add', 'product.remove', 'message.send', 'message.read', 'demo.samples', 'demo.reset', 'backup.restore']);

const CHANGED_ELSEWHERE = 'This order was changed on another screen. The latest version is now shown.';
const ORDER_TYPES = Object.freeze({ 'order.cart': true, 'order.direct': true, 'order.repair': true });

const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function cleanInput(input) {
  const result = {};
  for (const [key, value] of Object.entries(plain(input))) {
    if (typeof value === 'string' || typeof value === 'number') result[key] = value;
  }
  return result;
}

function sharedOnly(state) {
  return { ...state, cart: {}, favorites: [] };
}

function placeOrder(catalog, state, action, at, owner) {
  const id = nextOrderId(state.orders);
  const input = { ...cleanInput(action.input), creditOwner: owner };
  if (action.creditCents !== undefined) input.creditCents = action.creditCents;
  const image = typeof action.image === 'string' ? action.image : null;
  if (action.type === 'order.cart') {
    const cart = {};
    for (const [productId, qty] of Object.entries(plain(action.cart))) if (Number.isSafeInteger(qty)) cart[productId] = qty;
    return placeCartOrder(catalog, { ...state, cart }, input, id, at);
  }
  if (action.type === 'order.direct') return placeDirectOrder(catalog, state, String(action.productId ?? ''), String(action.mode ?? ''), { ...input, recycle: 'no' }, id, at, image);
  return placeRepairOrder(state, input, id, at, image);
}

function ownedOrderIds(state, owner) {
  return new Set(state.orders.filter((order) => order.owner === owner).map((order) => order.id));
}

function sendMessage(state, action, role, owner, at) {
  const text = String(action.text ?? '').trim();
  if (!text || text.length > 1600) return { error: 'Write a message of up to 1600 characters.' };
  const orderId = typeof action.orderId === 'string' && action.orderId ? action.orderId : null;
  const current = normalizeOrb(state.orb, state.orders);
  let generalOwner = null;
  if (orderId) {
    if (role === 'customer' && !ownedOrderIds(state, owner).has(orderId)) return { error: 'You can only send messages about your own orders.' };
    if (!state.orders.some((order) => order.id === orderId)) return { error: 'Order not found.' };
  } else if (role === 'customer') {
    generalOwner = owner;
  } else {
    generalOwner = typeof action.owner === 'string' ? action.owner : null;
    if (!generalOwner || !current.messages.some((m) => m.owner === generalOwner)) return { error: 'Choose a customer conversation to reply to.' };
  }
  const orb = appendMessage(current, role === 'customer' ? 'customer' : 'gunter', text, orderId, at, generalOwner);
  return { state: { ...state, orb } };
}

function readMessages(state, action, role, owner) {
  const ids = new Set(Array.isArray(action.ids) ? action.ids.filter((id) => typeof id === 'string') : []);
  const own = ownedOrderIds(state, owner);
  const allowed = (message) => (role === 'customer' ? message.kind !== 'customer' && (own.has(message.orderId) || (!message.orderId && message.owner === owner)) : message.kind === 'customer');
  const orb = normalizeOrb(state.orb, state.orders);
  return { state: { ...state, orb: { ...orb, messages: orb.messages.map((m) => (ids.has(m.id) && allowed(m) ? { ...m, read: true } : m)) } } };
}

function runRaid(state, action, owner, at, seed) {
  let raid = state.raid || null;
  let result;
  if (action.type === 'raid.open') {
    if (raid && raid.phase !== 'over') return { error: 'A mine room is already open.' };
    const random = seededRandom(`${seed}:room`);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = Array.from({ length: 4 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
    return { state: { ...state, raid: createRaid(seed, code, at) } };
  }
  if (!raid) return { error: 'Gunter has not opened a mine room yet.' };
  if ((action.raidId !== undefined && action.raidId !== raid.id) || (action.turn !== undefined && action.turn !== raid.turn) || (action.phase !== undefined && action.phase !== raid.phase)) return { error: 'The crew has moved on. Choose again.' };
  if (action.type === 'raid.close') {
    if (!['lobby', 'over'].includes(raid.phase)) return { error: 'Finish this raid before closing the room.' };
    return { state: { ...state, raid: null } };
  }
  if (['raid.play', 'raid.reward', 'raid.vote'].includes(action.type) && Date.parse(at) < Date.parse(raid.revealUntil)) return { error: 'Watch the reveal, then make your choice.' };
  switch (action.type) {
    case 'raid.join':
      if (raid.phase !== 'lobby' || String(action.code || '').trim().toUpperCase() !== raid.code) return { error: 'That room code is not open.' };
      result = joinRaid(raid, owner, action.name, action.color);
      break;
    case 'raid.start': result = startRaid(raid, at); break;
    case 'raid.play': result = playCard(raid, owner, action.handIndex); break;
    case 'raid.reward': result = chooseReward(raid, owner, action.rewardIndex); break;
    case 'raid.vote': result = vote(raid, owner, action.choice); break;
    case 'raid.resolve':
      if (!['play', 'reward', 'vote'].includes(raid.phase) || Date.parse(at) < Date.parse(raid.deadline)) return { error: 'Wait for the crew or the countdown.' };
      result = resolve(raid, at);
      break;
    default: return { error: 'Unknown mine action.' };
  }
  if (result.error) return result;
  raid = result.raid;
  const ready = raid.phase === 'play' ? raid.players.filter((p) => p.hp > 0).every((p) => p.selected !== null) : raid.phase === 'reward' ? raid.players.every((p) => p.rewardChoice !== null) : raid.phase === 'vote' ? raid.players.every((p) => p.vote) : false;
  if (ready) raid = resolve(raid, at).raid;
  const settled = settleRaid({ ...state, raid }, at);
  return { state: settled.state, creditCents: settled.credits[owner] ?? null };
}

function run(catalog, state, action, role, owner, at, raidSeed) {
  const fullCatalog = [...catalog, ...state.addedProducts];
  const current = state.orders.find((order) => order.id === action.id);
  switch (action.type) {
    case 'order.cart':
    case 'order.direct':
    case 'order.repair':
      return placeOrder(fullCatalog, state, action, at, owner);
    case 'raid.join':
    case 'raid.play':
    case 'raid.reward':
    case 'raid.vote':
    case 'raid.open':
    case 'raid.start':
    case 'raid.resolve':
    case 'raid.close':
      return runRaid(state, action, owner, at, raidSeed);
    case 'order.credit':
      if (!ownedOrderIds(state, owner).has(action.id)) return { error: 'You can only use credit on your own orders.' };
      return redeemCredit(state, action.id, action.creditCents, owner, at);
    case 'order.status':
      if (current && action.from && current.status !== action.from) return { error: CHANGED_ELSEWHERE };
      return updateStatus(state, String(action.id ?? ''), String(action.status ?? ''), at);
    case 'order.quote':
      return setQuote(state, String(action.id ?? ''), action.crowns, at);
    case 'ticket.complete':
      return toggleTicket(state, String(action.id ?? ''), at);
    case 'product.add':
      return addProduct(state, cleanInput(action.input), typeof action.image === 'string' ? action.image : null);
    case 'product.remove':
      return removeProduct(state, String(action.id ?? ''));
    case 'message.send':
      return sendMessage(state, action, role, owner, at);
    case 'message.read':
      return readMessages(state, action, role, owner);
    case 'demo.samples':
      return { state: addSampleOrders(fullCatalog, state, Date.parse(at)) };
    case 'demo.reset':
      return { state: makeState() };
    case 'backup.restore':
      return { state: restoreState(action.state, catalog) };
    default:
      return { error: 'Unknown action.' };
  }
}

export function applyAction(catalog, state, action, { role = 'customer', owner = null, at = new Date().toISOString(), raidSeed = `${at}:${state.raid?.id || 'mine'}` } = {}) {
  const allowed = role === 'smith' ? SMITH_ACTIONS : CUSTOMER_ACTIONS;
  if (!action || typeof action.type !== 'string' || !allowed.includes(action.type)) return { error: 'This action is not allowed here.' };
  const result = run(catalog, state, action, role, owner, at, raidSeed);
  if (result.error) return { error: result.error };
  let next = result.state;
  if (result.order) next = { ...next, orders: next.orders.map((order) => (order.id === result.order.id ? { ...order, owner } : order)) };
  const capture = !['message.send', 'message.read', 'backup.restore', 'demo.reset'].includes(action.type);
  next = restoreState(sharedOnly(capture ? captureUpdates(state, next, at) : next), catalog);
  if (ORDER_TYPES[action.type] && !next.orders.some((order) => order.id === result.order.id)) return { error: 'The order could not be saved. Try again without a photo.' };
  return {
    state: next,
    result: {
      orderId: result.order?.id ?? null,
      orderType: result.order?.type ?? null,
      advanced: Boolean(result.advanced),
      creditCents: result.creditCents ?? null,
      capped: Boolean(result.capped),
      productName: result.product?.name ?? null,
      productGroup: result.product?.group ?? null,
    },
  };
}

function stub(order) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    type: order.type,
    status: order.status,
    statusHistory: [],
    customer: { name: '', email: '' },
    items: order.items.map(({ id, name, qty }) => ({ id, name, qty, priceCents: null })),
    description: order.type === 'repair' ? 'Repair request' : '',
    totalCents: null,
    source: 'sample',
  };
}

export function customerView(state, owner) {
  const { raid: _raid, ...publicState } = state;
  const own = ownedOrderIds(state, owner);
  const orders = state.orders.map((order) => {
    if (!own.has(order.id)) return stub(order);
    const { owner: _owner, ...rest } = order;
    return rest;
  });
  const orb = normalizeOrb(state.orb, state.orders);
  return {
    ...sharedOnly(publicState),
    wallets: { local: walletFor(state, owner) },
    raidView: raidView(state.raid, owner),
    oreLedger: [],
    oreCostCents: {},
    orders,
    orb: { ...orb, messages: orb.messages.filter((m) => own.has(m.orderId) || (!m.orderId && m.owner === owner)), sessions: [], lastOpenedAt: null },
  };
}
