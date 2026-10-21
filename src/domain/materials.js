import { builtInCatalog } from '../data/catalog.js';
import { ORES, emptyHaul } from './mining.js';

const integer = (value) => Number.isSafeInteger(value) && value >= 0;
export const creditCap = (totalCents) => Math.floor((totalCents || 0) / 4);
export const buyPrice = (cents) => Math.round(cents * .8);
export const walletFor = (state, owner = 'local') => (Object.hasOwn(state.wallets || {}, owner) ? state.wallets[owner] : null) || { creditCents: 0, earned: { date: '', cents: 0 }, expeditions: { date: '', count: 0 } };
export const nextExpedition = (state, date, owner = 'local') => {
  const wallet = walletFor(state, owner);
  return wallet.expeditions.date === date ? wallet.expeditions.count : 0;
};
export function normalizeMining(raw) {
  const result = {};
  if (raw.oreCostCents) result.oreCostCents = Object.fromEntries(ORES.map((ore) => [ore, integer(raw.oreCostCents[ore]) ? raw.oreCostCents[ore] : 0]));
  if (raw.oreStock) result.oreStock = Object.fromEntries(ORES.map((ore) => [ore, integer(raw.oreStock[ore]) ? raw.oreStock[ore] : 0]));
  if (Array.isArray(raw.oreLedger)) result.oreLedger = raw.oreLedger.filter((e) => e && Number.isFinite(Date.parse(e.at)) && ['bought', 'used', 'market'].includes(e.kind) && ORES.includes(e.ore) && integer(e.qty) && integer(e.cents)).slice(-500).map((e) => ({ ...e }));
  if (raw.wallets && typeof raw.wallets === 'object' && !Array.isArray(raw.wallets)) {
    result.wallets = {};
    for (const [owner, w] of Object.entries(raw.wallets).slice(0, 10000)) {
      if (owner === '__proto__' || !w || !integer(w.creditCents)) continue;
      const dated = (x, key) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && integer(x[key]) ? { date: x.date, [key]: x[key] } : { date: '', [key]: 0 };
      result.wallets[owner] = { creditCents: w.creditCents, earned: dated(w.earned, 'cents'), expeditions: dated(w.expeditions, 'count') };
      if (w.canaryPurchases && integer(w.canaryPurchases.count) && w.canaryPurchases.count <= 2 && integer(w.canaryPurchases.expedition) && /^\d{4}-\d{2}-\d{2}$/.test(w.canaryPurchases.date)) result.wallets[owner].canaryPurchases = { ...w.canaryPurchases };
    }
  }
  return result;
}
export function sellHaul(state, owner, haul, prices, date, at) {
  const wallet = walletFor(state, owner);
  const earned = wallet.earned.date === date ? wallet.earned.cents : 0;
  const stock = { ...emptyHaul(), ...state.oreStock };
  const ledger = [...(state.oreLedger || [])];
  const costs = { ...emptyHaul(), ...state.oreCostCents };
  let creditCents = 0;
  for (const ore of ORES) {
    const qty = integer(haul[ore]) ? haul[ore] : 0;
    stock[ore] += qty;
    const cents = Math.min(qty * buyPrice(prices[ore]), Math.max(0, 5000 - earned - creditCents));
    creditCents += cents;
    costs[ore] += cents;
    if (qty) ledger.push({ at, kind: 'bought', ore, qty, cents });
  }
  const count = nextExpedition(state, date, owner) + 1;
  const nextWallet = { ...wallet, creditCents: wallet.creditCents + creditCents, earned: { date, cents: earned + creditCents }, expeditions: { date, count } };
  delete nextWallet.canaryPurchases;
  return { state: { ...state, oreStock: stock, oreCostCents: costs, oreLedger: ledger.slice(-500), wallets: { ...state.wallets, [owner]: nextWallet } }, creditCents, capped: earned + creditCents >= 5000 };
}

export const RECIPES = Object.freeze({
  'sword-short': { iron: 4, coal: 2 }, 'sword-arming': { iron: 7, coal: 3, copper: 1 }, 'sword-longsword': { iron: 10, coal: 4, copper: 1 },
  'plate-light': { iron: 18, coal: 6 }, 'plate-heavy': { iron: 32, coal: 10, copper: 2 },
  'mail-short': { iron: 10, coal: 3, copper: 1 }, 'mail-hauberk': { iron: 20, coal: 6, copper: 3 },
  'pot-small': { iron: 2, coal: 1 }, 'pot-medium': { iron: 5, coal: 2, copper: 1 }, 'pot-large': { iron: 12, coal: 4, copper: 3 },
  'sword-commission': { iron: 10, coal: 4, silver: 2 }, 'armor-commission': { iron: 30, coal: 10, silver: 2 }, 'cookware-commission': { iron: 8, coal: 3, copper: 4 },
  'repair-item': { iron: 1, coal: 1 },
});
export function recipeFor(product) {
  if (RECIPES[product.id]) return { ...RECIPES[product.id] };
  const matches = builtInCatalog.filter((p) => p.type === 'standard' && p.group === product.group).sort((a, b) => Math.abs(a.priceCents - product.priceCents) - Math.abs(b.priceCents - product.priceCents));
  return { ...(RECIPES[matches[0]?.id] || RECIPES['repair-item']) };
}
export function ticketNeeds(line, catalog = builtInCatalog) {
  const recipe = recipeFor(catalog.find((p) => p.id === line.id) || line);
  return Object.fromEntries(Object.entries(recipe).map(([ore, qty]) => [ore, qty * line.qty]));
}
export function orderNeeds(order, catalog = builtInCatalog) {
  const needs = emptyHaul();
  for (const line of order.items) for (const [ore, qty] of Object.entries(ticketNeeds(line, catalog))) needs[ore] += qty;
  return needs;
}
export function shortfall(stock = {}, needs = {}) {
  return Object.fromEntries(Object.entries(needs).map(([ore, qty]) => [ore, Math.max(0, qty - (stock[ore] || 0))]).filter(([, qty]) => qty));
}
export const availableCredit = (state, total, owner = 'local') => Math.min(walletFor(state, owner).creditCents, creditCap(total));
export function redeemCredit(state, orderId, cents, owner = 'local', at = null) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order || order.totalCents === null || ['Delivering', 'Delivered'].includes(order.status)) return { error: 'Forge Credit needs an open, priced order.' };
  if (!integer(cents) || cents > availableCredit(state, order.totalCents, owner) || order.creditCents) return { error: 'Forge Credit cannot exceed your balance or 25% of this order.' };
  if (!cents) return { state, order };
  const wallet = walletFor(state, owner);
  const updated = { ...order, creditCents: cents, creditAt: at || order.createdAt };
  return { state: { ...state, orders: state.orders.map((o) => o.id === orderId ? updated : o), wallets: { ...state.wallets, [owner]: { ...wallet, creditCents: wallet.creditCents - cents } } }, order: updated };
}
export function creditOrder(result, input) {
  if (result.error) return result;
  const cents = Number(input.creditCents || 0);
  if (!integer(cents)) return { error: 'Choose a valid Forge Credit amount.' };
  return cents ? redeemCredit(result.state, result.order.id, cents, input.creditOwner || 'local') : result;
}
export function buyCanary(state, owner, date, expedition) {
  const wallet = walletFor(state, owner);
  if (expedition !== nextExpedition(state, date, owner)) return { error: 'This expedition has already ended.' };
  const before = wallet.canaryPurchases;
  const count = before?.date === date && before.expedition === expedition ? before.count : 0;
  if (count >= 2) return { error: 'Only three canaries may travel on one expedition.' };
  if (wallet.creditCents < 300) return { error: 'You need 3.00 crowns Forge Credit for a canary.' };
  return { state: { ...state, wallets: { ...state.wallets, [owner]: { ...wallet, creditCents: wallet.creditCents - 300, canaryPurchases: { date, expedition, count: count + 1 } } } } };
}

export function consumeForOrder(state, orderId, prices, at, ticketIndex = null) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { error: 'Order not found.' };
  const done = new Set(order.materials?.tickets || []);
  const selected = ticketIndex === null ? order.items.map((_, i) => i) : [ticketIndex];
  const catalog = [...builtInCatalog, ...(state.addedProducts || [])];
  const needs = emptyHaul();
  for (const i of selected) {
    if (!order.items[i] || done.has(i)) continue;
    for (const [ore, qty] of Object.entries(ticketNeeds(order.items[i], catalog))) needs[ore] += qty;
    done.add(i);
  }
  const stock = { ...emptyHaul(), ...state.oreStock };
  const costs = { ...emptyHaul(), ...state.oreCostCents };
  const ledger = [...(state.oreLedger || [])];
  const fromStock = { ...emptyHaul(), ...order.materials?.fromStock };
  const bought = { ...emptyHaul(), ...order.materials?.bought };
  let costCents = order.materials?.costCents || 0;
  let marketCents = order.materials?.marketCents || 0;
  for (const ore of ORES) {
    const qty = needs[ore];
    if (!qty) continue;
    const take = Math.min(stock[ore], qty), buy = qty - take;
    const heldCost = state.oreCostCents ? costs[ore] : stock[ore] * buyPrice(prices[ore]);
    const stockCost = stock[ore] ? Math.round(heldCost * take / stock[ore]) : 0;
    costs[ore] = Math.max(0, heldCost - stockCost);
    stock[ore] -= take;
    const marketCost = buy * prices[ore];
    if (buy) ledger.push({ at, kind: 'market', ore, qty: buy, cents: marketCost, orderId });
    ledger.push({ at, kind: 'used', ore, qty, cents: stockCost + marketCost, orderId });
    fromStock[ore] += take; bought[ore] += buy;
    costCents += stockCost + marketCost;
    marketCents += qty * prices[ore];
  }
  const materials = { costCents, fromStock, bought, marketCents, savedCents: marketCents - costCents, tickets: [...done] };
  return { state: { ...state, oreStock: stock, oreCostCents: costs, oreLedger: ledger.slice(-500), orders: state.orders.map((o) => o.id === orderId ? { ...o, materials } : o) } };
}
export function normalizeOrderMining(order) {
  const result = { ...order };
  if (result.creditAt !== undefined && !Number.isFinite(Date.parse(result.creditAt))) delete result.creditAt;
  if (result.materials !== undefined) {
    const m = result.materials;
    if (!m || !integer(m.costCents)) delete result.materials;
    else {
      const quantities = (raw) => Object.fromEntries(ORES.map((ore) => [ore, integer(raw?.[ore]) ? raw[ore] : 0]));
      result.materials = { costCents: m.costCents, fromStock: quantities(m.fromStock), bought: quantities(m.bought), marketCents: integer(m.marketCents) ? m.marketCents : m.costCents, savedCents: Number.isSafeInteger(m.savedCents) ? m.savedCents : 0, tickets: [...new Set((Array.isArray(m.tickets) ? m.tickets : []).filter((i) => Number.isInteger(i) && i >= 0 && i < order.items.length))] };
    }
  }
  return result;
}
