import { catalog } from '../../data/catalog.js';
import { cartRows, cartCount, totalCents } from '../../domain/core.js';
import { heading, emptyState, price, recyclingFields } from '../components/shared.js';
import { cartRow } from '../components/cart-row.js';
import { checkoutForm } from '../components/checkout-form.js';

// render cart page for items in cart
export function cartPage(state, ui = { recycle: false, recycleDetails: '' }, activeCatalog = catalog) {
  const rows = cartRows(activeCatalog, state);
  if (!rows.length) {
    return heading('Your order', 'Your satchel', 'Bulk orders and custom commissions are placed from each product.') +
      emptyState('Your satchel is empty', 'Tap “Add to satchel” on any product to start an order.');
  }
  const count = cartCount(activeCatalog, state);
  const subtotal = totalCents(activeCatalog, state);
  return `${heading('Your order', 'Your satchel', `${count} ${count === 1 ? 'item' : 'items'} ready to order.`)}
    <div class="cart-layout">
      <div class="cart-main">
        <section class="surface cart-items"><h2>Items</h2>${rows.map((r) => cartRow(r.product, r.qty)).join('')}</section>
        ${recyclingFields({ variant: 'cart', enabled: ui.recycle, details: ui.recycleDetails })}
      </div>
      <aside class="surface cart-summary">
        <h2>Order summary</h2>
        <div class="split"><span>Subtotal</span><strong>${price(subtotal)}</strong></div>
        <div class="split order-total"><span>Total</span><strong id="cart-estimate">${price(subtotal)}</strong></div>
        ${checkoutForm(state, subtotal)}
      </aside>
    </div>`;
}
