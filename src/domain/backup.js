import { restoreState } from './core.js';

export const MAX_BACKUP_BYTES = 10000000;
export const BACKUP_FORMAT = 'gunters-forge-backup';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function validText(value, max) {
  return typeof value === 'string' && value.length <= max;
}

// validate backup
function validOrderFields(order) {
  if (!order || !validText(order.id, 80) || !order.id.length || !validText(order.createdAt, 80)) return false;
  if (!order.customer || !validText(order.customer.name, 80) || !validText(order.customer.email, 120)) return false;
  if (order.customer.address !== undefined && !validText(order.customer.address, 180)) return false;
  for (const [key, max] of [['title', 80], ['description', 1600], ['notes', 500], ['recycleDetails', 240], ['source', 80]]) {
    if (order[key] !== undefined && !validText(order[key], max)) return false;
  }
  if (order.recycle !== undefined && !['yes', 'no'].includes(order.recycle)) return false;
  return Array.isArray(order.items) && order.items.every((line) => line && typeof line.id === 'string'
    && (line.priceCents === null || Number.isSafeInteger(line.priceCents) && line.priceCents >= 0));
}

export function backupSummary(state) {
  return { orders: state.orders.length, products: state.addedProducts.length, favorites: state.favorites.length,
    cartUnits: Object.values(state.cart).reduce((sum, qty) => sum + qty, 0), completedTickets: state.completedTickets.length };
}

export function createBackup(state, catalog, exportedAt = new Date().toISOString()) {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt, state: restoreState(state, catalog) }, null, 2);
}

export function parseBackup(content, catalog) {
  const fail = (message) => ({ error: message });
  if (typeof content !== 'string' || new TextEncoder().encode(content).length > MAX_BACKUP_BYTES) return fail('Choose a backup of 10 MB or smaller.');
  let data;
  try { data = JSON.parse(content); } catch { return fail('This file is not valid JSON. Choose a Birdforge backup.'); }
  if (!data || data.format !== BACKUP_FORMAT || data.version !== 1 || typeof data.exportedAt !== 'string'
    || !Number.isFinite(Date.parse(data.exportedAt))) return fail('This backup format or version is not supported.');
  const raw = data.state;
  if (!raw || !raw.cart || typeof raw.cart !== 'object' || Array.isArray(raw.cart)
    || !['orders', 'favorites', 'completedTickets', 'addedProducts'].every((key) => Array.isArray(raw[key]))) return fail('The backup is incomplete. Nothing was changed.');
  if (!raw.orders.every(validOrderFields)) return fail('The backup contains invalid order data. Nothing was changed.');
  const state = restoreState(raw, catalog);
  if (JSON.stringify(canonical(raw)) !== JSON.stringify(canonical(state))) return fail('The backup contains invalid, duplicate or missing records. Nothing was changed.');
  return { state, exportedAt: data.exportedAt, summary: backupSummary(state) };
}
