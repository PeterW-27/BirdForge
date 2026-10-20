import { orderHistory } from '../../domain/core.js';
import { text } from './shared.js';

const LABELS = Object.freeze({ placed: 'Order placed', manual: 'Status updated', quote: 'Quote saved', completed: 'All work tickets completed', legacy: 'Previously saved status' });

export function statusHistory(order) {
  const entries = orderHistory(order);
  return `<details class="status-history"><summary>Status history (${entries.length})</summary>
    <ol>${entries.map((entry) => `<li><strong>${text(entry.status)}</strong>
      <span>${text(LABELS[entry.reason])}</span>
      ${entry.at ? `<time datetime="${text(entry.at)}">${text(new Date(entry.at).toLocaleString())}</time>` : '<span class="muted">Time not recorded in older data</span>'}
    </li>`).join('')}</ol>
  </details>`;
}
