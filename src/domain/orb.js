export function emptyOrb() {
  return { messages: [], sessions: [], lastOpenedAt: null };
}

// setting up orb
export function normalizeOrb(raw, orders) {
  const orb = emptyOrb();
  if (!raw || typeof raw !== 'object') return orb;
  const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const ids = new Set(orders.filter((o) => o.source !== 'sample').map((o) => o.id));
  const seen = new Set();
  orb.messages = (Array.isArray(raw.messages) ? raw.messages : []).filter((m) => {
    if (!m || typeof m.id !== 'string' || !m.id || seen.has(m.id)
      || !['notification', 'customer', 'gunter'].includes(m.kind)
      || typeof m.text !== 'string' || !m.text.trim() || m.text.length > 1600
      || !validDate(m.at) || !(m.orderId === null || ids.has(m.orderId))
      || (m.kind === 'notification' && m.orderId === null)
      || typeof m.read !== 'boolean' || typeof m.shown !== 'boolean') return false;
    seen.add(m.id);
    return true;
  }).map(({ id, kind, text, at, orderId, read, shown, owner }) => ({ id, kind, text, at, orderId, read, shown, ...(typeof owner === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(owner) ? { owner } : {}) }));
  orb.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).filter(validDate);
  orb.lastOpenedAt = validDate(raw.lastOpenedAt) ? raw.lastOpenedAt : null;
  return orb;
}

// push notifications
export function statusMessage(order) {
  const id = `#${order.id}`;
  const sentences = {
    Placed: `Your order ${id} is on the work list.`,
    'Awaiting Drop-off': `Please bring in your item for order ${id}.`,
    Assessing: `Gunter is reviewing your order ${id}.`,
    Processing: `Gunter is working on your order ${id}.`,
    Delivering: `Your order ${id} is on its way!`,
    Delivered: `Your order ${id} has been delivered!`,
  };
  return sentences[order.status] || `Your order ${id} is now ${order.status.toLowerCase()}.`;
}

export function threadKey(message) {
  return message.orderId || (message.owner ? `general:${message.owner}` : 'general');
}

export function appendMessage(orb, kind, text, orderId = null, at = new Date().toISOString(), owner = null) {
  const id = `orb-${Date.parse(at)}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  return { ...orb, messages: [...orb.messages, { id, kind, text, orderId, at, read: false, shown: kind === 'customer', ...(owner && !orderId ? { owner } : {}) }] };
}

// quote push
export function captureUpdates(previous, next, at = new Date().toISOString()) {
  let orb = normalizeOrb(next.orb, next.orders);
  for (const order of next.orders) {
    const before = previous.orders.find((o) => o.id === order.id);
    if (!before || order.source === 'sample') continue;
    if (before.status !== order.status) orb = appendMessage(orb, 'notification', statusMessage(order), order.id, at);
    if (before.totalCents !== order.totalCents && order.totalCents !== null && ['custom', 'repair'].includes(order.type)) {
      orb = appendMessage(orb, 'notification', `Your quote for #${order.id} is ${(order.totalCents / 100).toFixed(2)} crowns.`, order.id, at);
    }
  }
  return { ...next, orb };
}

// customer orb
export function openCustomerOrb(orb, at = new Date().toISOString()) {
  const newSession = !orb.lastOpenedAt || Date.parse(at) - Date.parse(orb.lastOpenedAt) >= 30 * 60 * 1000;
  return { ...orb, lastOpenedAt: at, sessions: newSession ? [...orb.sessions, at] : orb.sessions,
    messages: orb.messages.map((m) => m.kind === 'customer' ? m : { ...m, read: true, shown: true }) };
}

export function pendingMessages(orb) {
  return orb.messages.filter((m) => m.kind !== 'customer' && !m.shown);
}
