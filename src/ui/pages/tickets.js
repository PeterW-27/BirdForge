import { workTickets, forgeQueue } from '../../domain/core.js';
import { heading, emptyState, crestImage } from '../components/shared.js';
import { workTicket } from '../components/work-ticket.js';

// read andrender tickets
export function ticketsPage(state) {
  const tickets = workTickets(state);
  const orders = forgeQueue(state).length;
  const summary = `${tickets.length} open ${tickets.length === 1 ? 'ticket' : 'tickets'} from ${orders} ${orders === 1 ? 'order' : 'orders'}`;
  return `${heading("Gunter's workshop", 'Work Tickets', 'One slip per item, oldest order first. The # number is the place in line each customer sees.')}
    <section class="workboard-header">${crestImage('workboard-crest')}<div>
      <strong>${summary}</strong>
      <p>Mark each item complete when it leaves the anvil. When every item in an order is done, the order moves to Delivering.</p>
    </div></section>
    ${tickets.length
      ? `<div class="ticket-grid">${tickets.map((ticket, index) => workTicket(ticket, index, state)).join('')}</div>`
      : emptyState('No open work', 'New orders appear here. Custom commissions and repairs appear once their status is Processing.', 'shop', 'Go to the shop')}`;
}
