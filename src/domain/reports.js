import { ORDER_TYPES, forgeQueue, isQuotedType, money, orderHistory } from './core.js';

export const REPORT_RANGES = Object.freeze([
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom dates' },
]);

const DAY = 24 * 60 * 60 * 1000;
const TYPE_NAMES = Object.freeze({ standard: 'standard', bulk: 'bulk', custom: 'commission', repair: 'repair' });

const startOfDay = (time) => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const parseDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const time = new Date(year, month - 1, day).getTime();
  return Number.isFinite(time) ? time : null;
};

export function reportPeriod(range, from, to, orders = [], now = Date.now()) {
  const today = startOfDay(now);
  const end = today + DAY;
  if (range === 'today') return { start: today, end };
  if (range === '30d') return { start: today - 29 * DAY, end };
  if (range === 'month') {
    const first = new Date(now);
    first.setDate(1);
    return { start: startOfDay(first.getTime()), end };
  }
  if (range === 'all') {
    const first = Math.min(...orders.map((o) => Date.parse(o.createdAt)).filter(Number.isFinite), today);
    return { start: startOfDay(first), end };
  }
  if (range === 'custom') {
    const start = parseDay(from) ?? today - 6 * DAY;
    const last = parseDay(to) ?? today;
    return start <= last ? { start, end: last + DAY } : { start: last, end: start + DAY };
  }
  return { start: today - 6 * DAY, end };
}

const inPeriod = (time, period) => Number.isFinite(time) && time >= period.start && time < period.end;

function reachedAt(order, statuses) {
  const entry = orderHistory(order).find((item) => statuses.includes(item.status) && item.at);
  return entry ? Date.parse(entry.at) : null;
}

function measure(orders, period, ledger = []) {
  const received = orders.filter((o) => inPeriod(Date.parse(o.createdAt), period));
  const delivered = orders.filter((o) => inPeriod(reachedAt(o, ['Delivered']), period));
  const finished = orders.filter((o) => inPeriod(reachedAt(o, ['Delivering', 'Delivered']), period));
  const priced = received.filter((o) => o.totalCents !== null);
  const byType = Object.fromEntries(ORDER_TYPES.map((type) => [type, received.filter((o) => o.type === type).length]));
  const leadTimes = delivered.map((o) => reachedAt(o, ['Delivered']) - Date.parse(o.createdAt)).filter((ms) => ms >= 0);
  const products = new Map();
  for (const order of received) {
    for (const line of order.items) {
      if (line.id === 'repair-item') continue;
      const entry = products.get(line.id) || { name: line.name, qty: 0, cents: 0 };
      entry.qty += line.qty;
      entry.cents += line.priceCents === null || line.priceCents === undefined ? 0 : line.priceCents * line.qty;
      products.set(line.id, entry);
    }
  }
  const materialCostCents = delivered.reduce((sum, o) => sum + (o.materials?.costCents || 0), 0);
  const revenueCents = delivered.reduce((sum, o) => sum + (o.totalCents || 0) - (o.creditCents || 0), 0);
  return {
    materialCostCents,
    grossProfitCents: revenueCents - materialCostCents,
    oreBoughtCents: ledger.filter((e) => e.kind === 'bought' && inPeriod(Date.parse(e.at), period)).reduce((n, e) => n + e.cents, 0),
    creditRedeemedCents: orders.filter((o) => inPeriod(Date.parse(o.creditAt || o.createdAt), period)).reduce((n, o) => n + (o.creditCents || 0), 0),
    savedByMineCents: delivered.reduce((n, o) => n + (o.materials?.savedCents || 0), 0),
    received: received.length,
    byType,
    pieces: received.reduce((sum, o) => sum + o.items.reduce((n, line) => n + line.qty, 0), 0),
    bookedCents: priced.reduce((sum, o) => sum + o.totalCents, 0),
    averageCents: priced.length ? Math.round(priced.reduce((sum, o) => sum + o.totalCents, 0) / priced.length) : 0,
    deliveredOrders: delivered.length,
    revenueCents,
    finishedOrders: finished.length,
    finishedPieces: finished.reduce((sum, o) => sum + o.items.reduce((n, line) => n + line.qty, 0), 0),
    averageLeadMs: leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null,
    topProducts: [...products.values()].sort((a, b) => b.qty - a.qty || b.cents - a.cents).slice(0, 5),
    orders: received,
  };
}

function series(orders, period) {
  const days = Math.round((period.end - period.start) / DAY);
  const monthly = days > 62;
  const buckets = [];
  if (monthly) {
    const cursor = new Date(period.start);
    cursor.setDate(1);
    while (cursor.getTime() < period.end) {
      const start = cursor.getTime();
      cursor.setMonth(cursor.getMonth() + 1);
      buckets.push({ start, end: cursor.getTime(), label: new Date(start).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
    }
  } else {
    for (let start = period.start; start < period.end; start += DAY) {
      buckets.push({ start, end: start + DAY, label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }
  }
  return buckets.map((bucket) => ({
    label: bucket.label,
    orders: orders.filter((o) => inPeriod(Date.parse(o.createdAt), bucket)).length,
    revenueCents: orders.filter((o) => inPeriod(reachedAt(o, ['Delivered']), bucket)).reduce((sum, o) => sum + (o.totalCents || 0) - (o.creditCents || 0), 0),
  }));
}

export function formatDuration(ms) {
  if (ms === null) return '—';
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

const change = (now, before) => (before === 0 ? (now === 0 ? 0 : null) : Math.round(((now - before) / before) * 100));

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function summary(current, previous, open, awaitingQuote, queueLength, label) {
  const lines = [];
  const types = ORDER_TYPES.filter((t) => current.byType[t]).map((t) => `${current.byType[t]} ${TYPE_NAMES[t]}`).join(', ');
  if (current.received) {
    lines.push(`${label}, the forge received ${plural(current.received, 'order')}${types ? ` (${types})` : ''} covering ${plural(current.pieces, 'piece')}, booked at ${money(current.bookedCents)}.`);
  } else {
    lines.push(`${label}, no new orders reached the forge.`);
  }
  if (current.deliveredOrders) {
    lines.push(`${plural(current.deliveredOrders, 'order')} ${current.deliveredOrders === 1 ? 'was' : 'were'} delivered, bringing in ${money(current.revenueCents)}${current.averageLeadMs !== null ? `; delivery took ${formatDuration(current.averageLeadMs)} on average` : ''}.`);
  } else {
    lines.push('No orders were delivered in this period, so no revenue was collected yet.');
  }
  const revenueChange = change(current.revenueCents, previous.revenueCents);
  const orderChange = change(current.received, previous.received);
  if (previous.received || previous.revenueCents) {
    const parts = [];
    if (orderChange !== null) parts.push(`orders ${orderChange >= 0 ? 'up' : 'down'} ${Math.abs(orderChange)}%`);
    if (revenueChange !== null) parts.push(`revenue ${revenueChange >= 0 ? 'up' : 'down'} ${Math.abs(revenueChange)}%`);
    if (parts.length) lines.push(`Compared with the previous period of the same length: ${parts.join(', ')}.`);
  }
  if (current.topProducts[0]) lines.push(`Best seller: ${current.topProducts[0].name} (${plural(current.topProducts[0].qty, 'piece')}).`);
  const todo = [];
  if (queueLength) todo.push(`${plural(queueLength, 'order')} waiting on the work list`);
  if (awaitingQuote) todo.push(`${plural(awaitingQuote, 'commission or repair')} still needing a price`);
  if (todo.length) lines.push(`Right now Gunter has ${todo.join(' and ')}.`);
  else if (open) lines.push(`Right now ${plural(open, 'order')} ${open === 1 ? 'is' : 'are'} out for delivery or waiting on the customer.`);
  else lines.push('Right now the work list is clear.');
  lines.push(`Gross profit was ${money(current.grossProfitCents)} after ${money(current.materialCostCents)} in material costs. The mine saved ${money(current.savedByMineCents)} against market prices; customers earned ${money(current.oreBoughtCents)} for ore and redeemed ${money(current.creditRedeemedCents)} Forge Credit.`);
  return lines;
}

export function businessReport(state, { range = '7d', from = '', to = '', now = Date.now() } = {}) {
  const orders = state.orders || [];
  const period = reportPeriod(range, from, to, orders, now);
  const length = period.end - period.start;
  const previousPeriod = { start: period.start - length, end: period.start };
  const current = measure(orders, period, state.oreLedger || []);
  const previous = measure(orders, previousPeriod, state.oreLedger || []);
  const open = orders.filter((o) => o.status !== 'Delivered').length;
  const awaitingQuote = orders.filter((o) => isQuotedType(o.type) && o.totalCents === null && o.status !== 'Delivered').length;
  const queueLength = forgeQueue(state).length;
  const rangeLabel = REPORT_RANGES.find((r) => r.id === range)?.label || 'Last 7 days';
  const fromLabel = new Date(period.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const toLabel = new Date(period.end - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodLabel = fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
  const sentenceLabel = { today: 'Today', '7d': 'Over the last 7 days', '30d': 'Over the last 30 days', month: 'This month' }[range] || `From ${fromLabel} to ${toLabel}`;
  return {
    range,
    period,
    periodLabel,
    current,
    previous,
    open,
    awaitingQuote,
    queueLength,
    series: series(orders, period),
    revenueChange: change(current.revenueCents, previous.revenueCents),
    orderChange: change(current.received, previous.received),
    summary: summary(current, previous, open, awaitingQuote, queueLength, sentenceLabel),
  };
}

const csvCell = (value) => {
  const textValue = String(value ?? '');
  return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
};

export function reportCsv(report) {
  const c = report.current;
  const rows = [
    ['Birdforge business report', report.periodLabel],
    [],
    ['Metric', 'Value'],
    ['Orders received', c.received],
    ...ORDER_TYPES.map((t) => [`  ${TYPE_NAMES[t]} orders`, c.byType[t]]),
    ['Pieces ordered', c.pieces],
    ['Booked value (crowns)', (c.bookedCents / 100).toFixed(2)],
    ['Average order value (crowns)', (c.averageCents / 100).toFixed(2)],
    ['Orders delivered', c.deliveredOrders],
    ['Revenue from delivered orders (crowns)', (c.revenueCents / 100).toFixed(2)],
    ['Material cost (crowns)', (c.materialCostCents / 100).toFixed(2)],
    ['Gross profit (crowns)', (c.grossProfitCents / 100).toFixed(2)],
    ['Ore bought from customers (crowns)', (c.oreBoughtCents / 100).toFixed(2)],
    ['Forge Credit redeemed (crowns)', (c.creditRedeemedCents / 100).toFixed(2)],
    ['Saved by the mine (crowns)', (c.savedByMineCents / 100).toFixed(2)],
    ['Orders finished at the anvil', c.finishedOrders],
    ['Average time to delivery', formatDuration(c.averageLeadMs)],
    ['Orders on the work list now', report.queueLength],
    ['Quotes still needed now', report.awaitingQuote],
    [],
    ['Summary'],
    ...report.summary.map((line) => [line]),
    [],
    ['Order', 'Placed', 'Type', 'Status', 'Customer', 'Goods', 'Total (crowns)'],
    ...c.orders.map((o) => [o.id, o.createdAt, o.type, o.status, o.customer.name, o.items.map((l) => `${l.qty} x ${l.name}`).join('; '), o.totalCents === null ? '' : (o.totalCents / 100).toFixed(2)]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
