import { money } from '../../domain/core.js';
import { ticketNeeds, shortfall } from '../../domain/materials.js';
import { dailyPrices, mineDate } from '../../domain/mining.js';
import { builtInCatalog } from '../../data/catalog.js';
import { text, crestImage, statusBadge, typeLabel } from './shared.js';

// render a order as a work ticket with info
export function workTicket(ticket, index, state = {}) {
  const needs = ticketNeeds({ id: ticket.productId, qty: ticket.qty }, [...builtInCatalog, ...(state.addedProducts || [])]);
  const missing = shortfall(state.oreStock, needs);
  const prices = dailyPrices(mineDate());
  const extra = Object.entries(missing).reduce((n, [ore, qty]) => n + prices[ore] * qty, 0);
  const materials = Object.keys(missing).length ? `Short ${Object.entries(missing).map(([ore, qty]) => `${qty} ${ore}`).join(', ')} — buys at market for +${money(extra)}` : 'Materials ready';
  return `<article class="work-ticket" data-ticket="${text(ticket.id)}">
    <div class="ticket-pin" aria-hidden="true"></div>
    <div class="ticket-top">
      ${crestImage('ticket-crest')}
      <div>
        <span class="ticket-index">WORK TICKET ${String(index + 1).padStart(3, '0')}</span>
        <span class="ticket-time">${text(new Date(ticket.createdAt).toLocaleString())}</span>
      </div>
      <span class="ticket-queue" title="Place in line shown to the customer">#${ticket.queuePosition}</span>
    </div>
    <div class="ticket-product"><strong>${text(ticket.name)}</strong><b>× ${ticket.qty}</b></div>
    <p class="ticket-ref">Order ${text(ticket.orderId)}</p>
    ${ticket.type !== 'standard' ? `<p class="ticket-type">${text(typeLabel(ticket.type))}</p>` : ''}
    ${ticket.notes ? `<p class="ticket-notes">${text(ticket.notes)}</p>` : ''}
    <p>${text(Object.entries(needs).map(([ore, qty]) => `${qty} ${ore}`).join(', '))}</p><p class="ticket-materials">${text(materials)}</p>
    <div class="ticket-foot">
      ${statusBadge(ticket.status)}
      <button class="ticket-complete" type="button" data-action="ticket-complete" data-id="${text(ticket.id)}">Mark complete ✓</button>
    </div>
  </article>`;
}
