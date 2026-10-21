import { normalizeOrb } from './orb.js';
import { REPAIR_STATUSES, REPAIR_TICKET_STATUSES, repairItemIssue } from './repairs.js';
import { validAddedProduct } from './products.js';
import { PRICE_ERROR } from './prices.js';

export const STATUSES = Object.freeze(['Placed', 'Processing', 'Delivering', 'Delivered']);
export const COMMISSION_STATUSES = Object.freeze(['Placed', 'Assessing', 'Processing', 'Delivering', 'Delivered']);
export { REPAIR_STATUSES };
export const ORDER_TYPES = Object.freeze(['standard', 'bulk', 'custom', 'repair']);
export const WORK_STATUSES = Object.freeze(['Placed', 'Processing']);
export const COMMISSION_TICKET_STATUSES = Object.freeze(['Processing']);
export const MAX_CART = 99;
export const MAX_BULK = 10000;
export const MIN_BULK = 10;
export const MAX_QUOTE_CENTS = 10000000;
export const IMAGE_DATA_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,/;
export const MAX_IMAGE_DATA_LENGTH = 510000;

// special status
export const statusesFor = (type) => {
  if (type === 'repair') return REPAIR_STATUSES;
  if (type === 'custom') return COMMISSION_STATUSES;
  return STATUSES;
};

// special ticket status
export const ticketStatusesFor = (type) => {
  if (type === 'repair') return REPAIR_TICKET_STATUSES;
  if (type === 'custom') return COMMISSION_TICKET_STATUSES;
  return WORK_STATUSES;
};

export const isQuotedType = (type) => type === 'custom' || type === 'repair';

// money format normalizing
export const money = (cents) => {
  if (cents === null || cents === undefined) return '';
  const [whole, fraction] = (cents / 100).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction} crowns`;
};

// esacapehtml
export const escapeHTML = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// order status history
export function orderHistory(order) {
  if (!Array.isArray(order.statusHistory) || !order.statusHistory.length) {
    return [{ status: order.status, at: order.status === 'Placed' ? order.createdAt : null, reason: order.status === 'Placed' ? 'placed' : 'legacy' }];
  }
  const reasons = ['placed', 'manual', 'quote', 'completed', 'legacy'];
  const valid = order.statusHistory.every((entry) => entry && statusesFor(order.type).includes(entry.status)
    && reasons.includes(entry.reason)
    && (entry.at === null ? entry.reason === 'legacy' : typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at))));
  if (!valid || order.statusHistory.at(-1).status !== order.status) {
    return [{ status: order.status, at: null, reason: 'legacy' }];
  }
  return order.statusHistory.map(({ status, at, reason }) => ({ status, at, reason }));
}

function transitionOrder(order, status, reason, at) {
  if (order.status === status) return order;
  return { ...order, status, statusHistory: [...orderHistory(order), { status, at, reason }] };
}

export function makeState() {
  return { cart: {}, orders: [], favorites: [], completedTickets: [], addedProducts: [] };
}

// validate image and lines
const isSafeImage = (value) => typeof value === 'string' && IMAGE_DATA_PATTERN.test(value) && value.length <= MAX_IMAGE_DATA_LENGTH;

function isValidLine(order, line, productIds) {
  if (!line || typeof line.name !== 'string') return false;
  const maxQty = order.type === 'repair' ? 99 : MAX_BULK;
  if (!Number.isSafeInteger(line.qty) || line.qty <= 0 || line.qty > maxQty) return false;
  if (line.name.length < 2 || line.name.length > 120) return false;
  return order.type === 'repair' ? line.id === 'repair-item' : productIds.has(line.id);
}

// check locally saved orders and restore to webpage storage
function isValidOrder(order, productIds) {
  if (!order || typeof order.id !== 'string' || order.id.length > 80) return false;
  if (!Number.isFinite(Date.parse(order.createdAt))) return false;
  if (!ORDER_TYPES.includes(order.type) || !statusesFor(order.type).includes(order.status)) return false;
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  if (!order.items.every((line) => isValidLine(order, line, productIds))) return false;
  if (!order.customer || typeof order.customer.name !== 'string' || typeof order.customer.email !== 'string') return false;
  if (order.type === 'repair' && (typeof order.description !== 'string' || order.description.length < 10 || order.description.length > 1600)) return false;
  if (order.referenceImage !== undefined && order.referenceImage !== null && !isSafeImage(order.referenceImage)) return false;
  if (order.totalCents !== null && !(Number.isSafeInteger(order.totalCents) && order.totalCents >= 0)) return false;
  return true;
}

export function restoreState(raw, catalog) {
  const fresh = makeState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fresh;
  const baseIds = new Set(catalog.map((p) => p.id));
  if (Array.isArray(raw.addedProducts)) {
    for (const product of raw.addedProducts.slice(0, 100)) {
      if (validAddedProduct(product) && !baseIds.has(product.id)) {
        fresh.addedProducts.push(product);
        baseIds.add(product.id);
      }
    }
  }
  const fullCatalog = [...catalog, ...fresh.addedProducts];
  const standardIds = new Set(fullCatalog.filter((p) => p.type === 'standard').map((p) => p.id));
  const allIds = new Set(fullCatalog.map((p) => p.id));

  if (raw.cart && typeof raw.cart === 'object' && !Array.isArray(raw.cart)) {
    for (const [id, qty] of Object.entries(raw.cart)) {
      if (standardIds.has(id) && Number.isSafeInteger(qty) && qty > 0 && qty <= MAX_CART) fresh.cart[id] = qty;
    }
  }
  if (Array.isArray(raw.favorites)) {
    fresh.favorites = [...new Set(raw.favorites.filter((id) => standardIds.has(id)))];
  }
  if (Array.isArray(raw.orders)) {
    const seen = new Set();
    fresh.orders = raw.orders.filter((order) => {
      if (!isValidOrder(order, allIds) || seen.has(order.id)) return false;
      seen.add(order.id);
      return true;
    }).map((order) => ({ ...order, statusHistory: orderHistory(order) }));
  }
  if (Array.isArray(raw.completedTickets)) {
    const validTicketIds = new Set(fresh.orders.flatMap((o) => o.items.map((_, i) => `${o.id}-${i}`)));
    fresh.completedTickets = [...new Set(raw.completedTickets.filter((id) => typeof id === 'string' && validTicketIds.has(id)))];
  }
  if (raw.orb !== undefined) fresh.orb = normalizeOrb(raw.orb, fresh.orders);
  return fresh;
}

// cart (satchel) management
export function nextOrderId(orders) {
  const highest = orders.reduce((max, order) => {
    const match = /^GF-(\d{1,9})$/.exec(order.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `GF-${String(highest + 1).padStart(4, '0')}`;
}

export function cartRows(catalog, state) {
  return Object.entries(state.cart)
    .map(([id, qty]) => ({ product: catalog.find((p) => p.id === id && p.type === 'standard'), qty }))
    .filter((row) => row.product && Number.isSafeInteger(row.qty) && row.qty > 0 && row.qty <= MAX_CART);
}

export const cartCount = (catalog, state) => cartRows(catalog, state).reduce((n, row) => n + row.qty, 0);

export const totalCents = (catalog, state) => cartRows(catalog, state).reduce((n, row) => n + row.product.priceCents * row.qty, 0);

export function changeQuantity(catalog, state, id, next) {
  const product = catalog.find((p) => p.id === id && p.type === 'standard');
  if (!product) return { error: 'This item must be commissioned separately.' };
  if (!Number.isSafeInteger(next) || next < 0 || next > MAX_CART) return { error: 'Choose a quantity between 0 and 99.' };
  const cart = { ...state.cart };
  if (next === 0) delete cart[id];
  else cart[id] = next;
  return { state: { ...state, cart } };
}

// order placing and customer info form filling 
export function customerIssue(input) {
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '').trim();
  const address = String(input.address ?? '').trim();
  if (name.length < 2 || name.length > 80) return 'Enter your name (2–80 characters).';
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address, like name@example.com.';
  if (address.length > 180) return 'Address must be 180 characters or less.';
  return '';
}

export function recyclingIssue(input) {
  if (!['no', 'yes'].includes(input.recycle ?? 'no')) return 'Select a valid recycling option.';
  if (String(input.recycleDetails ?? '').length > 240) return 'Recycling notes must be 240 characters or less.';
  return '';
}

// clean forms
function cleanCustomer(input) {
  return { name: String(input.name).trim(), email: String(input.email).trim(), address: String(input.address ?? '').trim() };
}

function recyclingData(input) {
  const recycle = input.recycle ?? 'no';
  return { recycle, recycleDetails: recycle === 'yes' ? String(input.recycleDetails ?? '').trim() : '' };
}

function referenceIdIssue(id, createdAt) {
  if (typeof id !== 'string' || id.length < 1 || id.length > 80 || !Number.isFinite(Date.parse(createdAt))) return 'Invalid order reference.';
  return '';
}

function duplicateIssue(state, id) {
  return state.orders.some((order) => order.id === id) ? 'This order number is already in use. Please try again.' : '';
}

// place cart order and direct order
export function placeCartOrder(catalog, state, input, id, createdAt) {
  if (!cartCount(catalog, state)) return { error: 'Your satchel is empty.' };
  const issue = customerIssue(input) || recyclingIssue(input) || referenceIdIssue(id, createdAt) || duplicateIssue(state, id);
  if (issue) return { error: issue };
  if (String(input.notes ?? '').length > 500) return { error: 'Order notes must be 500 characters or less.' };
  const lines = cartRows(catalog, state).map(({ product, qty }) => ({ id: product.id, name: product.name, qty, priceCents: product.priceCents }));
  const order = {
    id,
    createdAt,
    type: 'standard',
    status: 'Placed',
    statusHistory: [{ status: 'Placed', at: createdAt, reason: 'placed' }],
    customer: cleanCustomer(input),
    items: lines,
    totalCents: totalCents(catalog, state),
    notes: String(input.notes ?? '').trim(),
    ...recyclingData(input),
  };
  return { order, state: { ...state, cart: {}, orders: [...state.orders, order] } };
}

export function placeDirectOrder(catalog, state, productId, mode, input, id, createdAt, referenceImage = null) {
  const product = catalog.find((p) => p.id === productId);
  if (!product || !['bulk', 'custom'].includes(mode)) return { error: 'Unsupported commission.' };
  if (mode === 'bulk' && product.type === 'custom') return { error: 'Custom commissions cannot use Bulk Buying.' };
  if (input.recycle === 'yes') return { error: 'Recycling is unavailable for direct orders.' };
  const issue = customerIssue(input) || referenceIdIssue(id, createdAt) || duplicateIssue(state, id);
  if (issue) return { error: issue };

  const qty = Number(input.qty);
  if (mode === 'bulk' && (!Number.isSafeInteger(qty) || qty < MIN_BULK || qty > MAX_BULK)) return { error: 'Bulk quantity must be a whole number from 10 to 10000.' };
  if (mode === 'custom' && qty !== 1) return { error: 'Custom commissions must have quantity 1.' };
  if (mode === 'custom' && product.type !== 'custom') return { error: 'Select a commission item.' };

  const title = String(input.title ?? '').trim();
  if (mode === 'bulk' && (title.length < 2 || title.length > 80)) return { error: 'Enter your title or position (2–80 characters).' };
  const notes = String(input.notes ?? '').trim();
  const description = String(input.description ?? '').trim();
  if (notes.length > 500) return { error: 'Notes must be 500 characters or less.' };
  if (product.type === 'custom' && (description.length < 10 || description.length > 1600)) return { error: 'Describe the custom work you want (10–1600 characters).' };
  if (referenceImage && !isSafeImage(referenceImage)) return { error: 'The reference image is not supported.' };

  const type = mode === 'custom' ? 'custom' : 'bulk';
  const order = {
    id,
    createdAt,
    type,
    status: 'Placed',
    statusHistory: [{ status: 'Placed', at: createdAt, reason: 'placed' }],
    customer: cleanCustomer(input),
    items: [{ id: product.id, name: product.name, qty, priceCents: product.priceCents }],
    title: mode === 'bulk' ? title : '',
    notes,
    description: product.type === 'custom' ? description : '',
    referenceImage: referenceImage || null,
    totalCents: product.priceCents === null ? null : product.priceCents * qty,
    ...recyclingData({ recycle: 'no' }),
  };
  return { order, state: { ...state, orders: [...state.orders, order] } };
}

// create and save repair order data
export function placeRepairOrder(state, input, id, createdAt, referenceImage = null) {
  const issue = customerIssue(input) || repairItemIssue(input);
  if (issue) return { error: issue };
  if (referenceIdIssue(id, createdAt)) return { error: 'Invalid repair order reference.' };
  const duplicate = duplicateIssue(state, id);
  if (duplicate) return { error: duplicate };
  if (referenceImage && !isSafeImage(referenceImage)) return { error: 'The reference image is not supported.' };
  const order = {
    id,
    createdAt,
    type: 'repair',
    status: 'Placed',
    statusHistory: [{ status: 'Placed', at: createdAt, reason: 'placed' }],
    customer: cleanCustomer(input),
    items: [{ id: 'repair-item', name: String(input.itemName).trim(), qty: Number(input.qty), priceCents: null }],
    description: String(input.damage).trim(),
    referenceImage: referenceImage || null,
    totalCents: null,
  };
  return { order, state: { ...state, orders: [...state.orders, order] } };
}

// updating status
export function updateStatus(state, id, status, at = new Date().toISOString()) {
  const previous = state.orders.find((order) => order.id === id);
  if (!previous) return { error: 'Order not found.' };
  if (!statusesFor(previous.type).includes(status)) return { error: 'Invalid forge status.' };
  const eligible = ticketStatusesFor(previous.type);
  const reopen = eligible.includes(status) && !eligible.includes(previous.status);
  const completedTickets = reopen
    ? (state.completedTickets || []).filter((ticketId) => !previous.items.some((_, index) => ticketId === `${id}-${index}`))
    : [...(state.completedTickets || [])];
  return {
    state: {
      ...state,
      orders: state.orders.map((order) => (order.id === id ? transitionOrder(order, status, 'manual', at) : order)),
      completedTickets,
    },
  };
}

// formatting crowns
export function parseCrowns(value) {
  const textValue = String(value ?? '').trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(textValue)) return null;
  const [whole, fraction = ''] = textValue.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

// handling price setting for Commission and Repair, and update status to processing
export function setQuote(state, id, crowns, at = new Date().toISOString()) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return { error: 'Order not found.' };
  if (!isQuotedType(order.type)) return { error: 'Only custom commissions and repairs need a quote.' };
  const cents = parseCrowns(crowns);
  if (cents === null || cents <= 0 || cents > MAX_QUOTE_CENTS) return { error: PRICE_ERROR };
  return { state: { ...state, orders: state.orders.map((o) => (o.id === id ? { ...transitionOrder(o, o.type === 'custom' && ['Placed', 'Assessing'].includes(o.status) ? 'Processing' : o.status, 'quote', at), totalCents: cents } : o)) } };
}

// number of different orders
export function orderStats(state) {
  return {
    total: state.orders.length,
    open: state.orders.filter((o) => o.status !== 'Delivered').length,
    queued: forgeQueue(state).length,
    bulk: state.orders.filter((o) => o.type === 'bulk').length,
    custom: state.orders.filter((o) => o.type === 'custom').length,
    repair: state.orders.filter((o) => o.type === 'repair').length,
  };
}

// locate the current ending ticket in the forge board order list and mark finished orders' status Delivering
export function toggleTicket(state, id, at = new Date().toISOString()) {
  const order = state.orders.find((o) => o.items.some((_, index) => `${o.id}-${index}` === id));
  if (!order) return { error: 'Work ticket not found.' };
  if (!ticketStatusesFor(order.type).includes(order.status)) return { error: 'This order is not in the production queue.' };
  const completed = new Set(state.completedTickets || []);
  if (completed.has(id)) return { error: 'This work ticket was already completed.' };
  completed.add(id);
  const allFinished = order.items.every((_, index) => completed.has(`${order.id}-${index}`));
  const orders = allFinished ? state.orders.map((o) => (o.id === order.id ? transitionOrder(o, 'Delivering', 'completed', at) : o)) : state.orders;
  return { state: { ...state, completedTickets: [...completed], orders }, advanced: allFinished };
}

function ticketNotes(order) {
  const recycling = order.recycle === 'yes' ? `Recycle Your Iron Tools: ${order.recycleDetails || 'offered'}` : '';
  return [order.description, order.notes, recycling].filter(Boolean).join(' · ');
}

// work tickets
export function workTickets(state) {
  const completed = state.completedTickets || [];
  const tickets = state.orders
    .flatMap((order) =>
      order.items.map((line, index) => ({
        id: `${order.id}-${index}`,
        orderId: order.id,
        createdAt: order.createdAt,
        status: order.status,
        type: order.type,
        name: line.name,
        qty: line.qty,
        notes: ticketNotes(order),
      })),
    )
    .filter((ticket) => ticketStatusesFor(ticket.type).includes(ticket.status) && !completed.includes(ticket.id))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.orderId.localeCompare(b.orderId) || a.id.localeCompare(b.id));
  const positions = new Map();
  for (const ticket of tickets) {
    if (!positions.has(ticket.orderId)) positions.set(ticket.orderId, positions.size + 1);
    ticket.queuePosition = positions.get(ticket.orderId);
  }
  return tickets;
}

// forge queue order
export function forgeQueue(state) {
  const entries = [];
  for (const ticket of workTickets(state)) {
    const last = entries.at(-1);
    if (last && last.orderId === ticket.orderId) last.openItems += 1;
    else entries.push({ orderId: ticket.orderId, position: ticket.queuePosition, openItems: 1 });
  }
  return entries;
}

// turn the data stored in forge board into queueing information for customer view, or show the status when it's not in tickets
export function queueInfo(state, orderId) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return null;
  const queue = forgeQueue(state);
  const index = queue.findIndex((entry) => entry.orderId === orderId);
  if (index >= 0) {
    const ahead = queue.slice(0, index);
    return {
      stage: 'queued',
      position: index + 1,
      queueLength: queue.length,
      ordersAhead: ahead.length,
      itemsAhead: ahead.reduce((sum, entry) => sum + entry.openItems, 0),
      openItems: queue[index].openItems,
      totalItems: order.items.length,
    };
  }
  if (order.status === 'Delivered') return { stage: 'delivered' };
  if (order.status === 'Delivering') return { stage: 'delivering' };
  if (ticketStatusesFor(order.type).includes(order.status)) return { stage: 'finished' };
  return { stage: 'waiting', status: order.status, type: order.type };
}
