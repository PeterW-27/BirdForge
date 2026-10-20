import { text, crestImage, statusBadge, typeLabel } from './shared.js';

// render a order as a work ticket with info
export function workTicket(ticket, index) {
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
    <div class="ticket-foot">
      ${statusBadge(ticket.status)}
      <button class="ticket-complete" type="button" data-action="ticket-complete" data-id="${text(ticket.id)}">Mark complete ✓</button>
    </div>
  </article>`;
}
