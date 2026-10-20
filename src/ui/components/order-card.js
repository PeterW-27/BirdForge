import { isQuotedType } from '../../domain/core.js';
import { text, price, progress, statusBadge, crestImage, typeLabel, queuePanel, referenceButton } from './shared.js';

// show total price and discription on order cards, show quote tag on repair and commission orders
function priceLine(order) {
  if (order.totalCents !== null) {
    const label = isQuotedType(order.type) ? 'Quoted price' : 'Total';
    return `<div class="split order-total"><span>${label}</span><strong>${price(order.totalCents)}</strong></div>`;
  }
  return `<div class="split order-total"><span>Price</span><strong class="muted">Quote pending</strong></div>`;
}

function detailLines(order) {
  const lines = [];
  if (order.title) lines.push(`<p><strong>Position:</strong> ${text(order.title)}</p>`);
  if (order.description) lines.push(`<p><strong>${order.type === 'repair' ? 'Damage description' : 'Custom description'}:</strong> ${text(order.description)}</p>`);
  if (order.notes) lines.push(`<p><strong>Notes:</strong> ${text(order.notes)}</p>`);
  if (order.recycle === 'yes') lines.push(`<p><strong>Recycle Your Iron Tools:</strong> ${text(order.recycleDetails || 'Requested')}</p>`);
  if (order.referenceImage) lines.push(referenceButton(order));
  return lines.join('');
}

// join all the information on order card
export function orderCard(order, queue = null, { highlight = false } = {}) {
  const special = order.type === 'custom';
  return `<article class="surface order-card ${special ? 'royal-order' : ''} ${highlight ? 'is-new' : ''}" data-order="${text(order.id)}">
    ${special ? crestImage('order-crest') : ''}
    <div class="split">
      <div>
        <p class="eyebrow">${text(typeLabel(order.type))}</p>
        <h2>Order ${text(order.id)}</h2>
        <p class="muted">${text(new Date(order.createdAt).toLocaleString())}</p>
      </div>
      ${statusBadge(order.status)}
    </div>
    ${queuePanel(queue)}
    ${progress(order.status, order.type)}
    <p>${order.items.map((item) => `${item.qty} × ${text(item.name)}`).join(' · ')}</p>
    ${detailLines(order)}
    ${priceLine(order)}
  </article>`;
}
