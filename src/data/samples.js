import { nextOrderId, placeCartOrder, placeDirectOrder, placeRepairOrder } from '../domain/core.js';

const SAMPLE_REQUESTS = Object.freeze([
  {
    kind: 'cart',
    cart: { 'sword-arming': 2, 'mail-short': 2 },
    input: { name: 'Captain Roswitha', email: 'roswitha@example.com', address: 'Mautern castle gate', notes: 'For the new gate guards.' },
  },
  {
    kind: 'bulk',
    productId: 'pot-medium',
    input: { name: 'Brother Anselm', email: 'anselm@example.com', address: 'Abbey kitchen', title: 'Abbey cellarer', qty: 12, notes: 'Deliver before the harvest feast.' },
  },
  {
    kind: 'repair',
    input: { name: 'Mila the Miller', email: 'mila@example.com', address: 'River mill', itemName: 'Mill wheel axle bracket', qty: 1, damage: 'The iron bracket cracked during the spring flood.' },
  },
]);

// generate 3 types of sample data for testing. 
export function addSampleOrders(catalog, state, now = Date.now()) {
  let next = state;
  SAMPLE_REQUESTS.forEach((request, index) => {
    const id = nextOrderId(next.orders);
    const createdAt = new Date(now + index).toISOString();
    let result;
    if (request.kind === 'cart') {
      result = placeCartOrder(catalog, { ...next, cart: request.cart }, { ...request.input, recycle: 'no' }, id, createdAt);
      if (!result.error) result.state = { ...result.state, cart: next.cart };
    } else if (request.kind === 'bulk') {
      result = placeDirectOrder(catalog, next, request.productId, 'bulk', { ...request.input, recycle: 'no' }, id, createdAt);
    } else {
      result = placeRepairOrder(next, request.input, id, createdAt);
    }
    if (result.error) return;
    next = { ...result.state, orders: result.state.orders.map((order) => (order.id === id ? { ...order, source: 'sample' } : order)) };
  });
  return next;
}

export const isSampleOrder = (order) => order.source === 'sample';
