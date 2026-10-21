import { makeState, nextOrderId, placeCartOrder, placeDirectOrder, placeRepairOrder, updateStatus, setQuote, toggleTicket, restoreState } from './core.js';
import { addProduct, removeProduct } from './products.js';
import { appendMessage, captureUpdates, normalizeOrb } from './orb.js';
import { addSampleOrders } from '../data/samples.js';

export const CUSTOMER_ACTIONS = Object.freeze(['order.cart', 'order.direct', 'order.repair', 'message.send', 'message.read']);
export const SMITH_ACTIONS = Object.freeze(['order.status', 'order.quote', 'ticket.complete', 'product.add', 'product.remove', 'message.send', 'message.read', 'demo.samples', 'demo.reset', 'backup.restore']);

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

function placeOrder(catalog, state, action, at) {
  const id = nextOrderId(state.orders);
  const input = cleanInput(action.input);
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

function run(catalog, state, action, role, owner, at) {
  const fullCatalog = [...catalog, ...state.addedProducts];
  const current = state.orders.find((order) => order.id === action.id);
  switch (action.type) {
    case 'order.cart':
    case 'order.direct':
    case 'order.repair':
      return placeOrder(fullCatalog, state, action, at);
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

export function applyAction(catalog, state, action, { role = 'customer', owner = null, at = new Date().toISOString() } = {}) {
  const allowed = role === 'smith' ? SMITH_ACTIONS : CUSTOMER_ACTIONS;
  if (!action || typeof action.type !== 'string' || !allowed.includes(action.type)) return { error: 'This action is not allowed here.' };
  const result = run(catalog, state, action, role, owner, at);
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
  const own = ownedOrderIds(state, owner);
  const orders = state.orders.map((order) => {
    if (!own.has(order.id)) return stub(order);
    const { owner: _owner, ...rest } = order;
    return rest;
  });
  const orb = normalizeOrb(state.orb, state.orders);
  return {
    ...sharedOnly(state),
    orders,
    orb: { ...orb, messages: orb.messages.filter((m) => own.has(m.orderId) || (!m.orderId && m.owner === owner)), sessions: [], lastOpenedAt: null },
  };
}
