import { forgeQueue, queueInfo } from '../../domain/core.js';
import { isSampleOrder } from '../../data/samples.js';
import { heading, emptyState, text } from '../components/shared.js';
import { orderCard } from '../components/order-card.js';

function successMessage(state, lastOrder) {
  if (!lastOrder) return '';
  const info = queueInfo(state, lastOrder);
  const place = info?.stage === 'queued' ? ` You are #${info.position} on Gunter's work list.` : ' Gunter will review it and add it to his work list.';
  return `<p class="success-message" role="status">Order ${text(lastOrder)} has reached the forge.${place}</p>`;
}

// render orders page, show previous orders and hide sample orders
export function ordersPage(state, lastOrder) {
  const mine = state.orders.filter((order) => !isSampleOrder(order));
  const queueLength = forgeQueue(state).length;
  const intro = `See where each order sits on Gunter's work list. Gunter has ${queueLength} ${queueLength === 1 ? 'order' : 'orders'} in line right now.`;
  const list = mine.length
    ? `<div class="order-list">${[...mine].reverse().map((order) => orderCard(order, queueInfo(state, order.id), { highlight: order.id === lastOrder })).join('')}</div>`
    : emptyState('No orders yet', 'Choose something from the shop, or ask for a repair. Your place in line will show here.');
  return `${heading('Track your orders', 'My orders', intro)}${successMessage(state, lastOrder)}${list}`;
}
