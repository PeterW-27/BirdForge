import { catalog, groups } from '../../data/catalog.js';
import { orderStats, statusesFor, queueInfo, isQuotedType, ORDER_TYPES } from '../../domain/core.js';
import { isSampleOrder } from '../../data/samples.js';
import { heading, emptyState, text, price, statusBadge, extensionPanel, typeLabel } from '../components/shared.js';

// stats for forge board
function statsPanel(state) {
  const stats = orderStats(state);
  const tiles = [
    [stats.queued, 'On the work list'],
    [stats.open, 'Not yet delivered'],
    [stats.bulk, 'Bulk orders'],
    [stats.custom, 'Custom commissions'],
    [stats.repair, 'Repair requests'],
    [stats.total, 'All orders'],
  ];
  return `<div class="stats-grid">${tiles.map(([value, label]) => `<div class="surface stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>`;
}

function quoteForm(order) {
  if (!isQuotedType(order.type)) return '';
  const current = order.totalCents === null ? '' : (order.totalCents / 100).toFixed(2);
  return `<form class="quote-form" data-id="${text(order.id)}">
    <label>${order.totalCents === null ? 'Set a price (crowns)' : 'Change price (crowns)'}
      <input name="quote" inputmode="decimal" required pattern="\\d{1,6}(\\.\\d{1,2})?" value="${current}" placeholder="e.g. 240">
    </label>
    <button class="button button-secondary" type="submit">${order.totalCents === null ? 'Send quote' : 'Update quote'}</button>
  </form>`;
}

function adminOrder(state, order) {
  const queue = queueInfo(state, order.id);
  const place = queue?.stage === 'queued' ? `<span class="queue-chip">#${queue.position} in line</span>` : '';
  const details = [
    `<p>Customer: ${text(order.customer.name)}${isSampleOrder(order) ? ' <span class="sample-chip">sample</span>' : ''}</p>`,
    `<p>Email: ${text(order.customer.email)}</p>`,
    `<p>Address / pickup: ${text(order.customer.address || 'Not provided')}</p>`,
    `<p>Goods: ${order.items.map((line) => `${line.qty} × ${text(line.name)}`).join(' · ')}</p>`,
    order.title ? `<p>Position: ${text(order.title)}</p>` : '',
    order.description ? `<p>${order.type === 'repair' ? 'Damage description' : 'Custom brief'}: ${text(order.description)}</p>` : '',
    order.notes ? `<p>Notes: ${text(order.notes)}</p>` : '',
    order.recycle === 'yes' ? `<p>Recycle Your Iron Tools: ${text(order.recycleDetails || 'Yes')}</p>` : '',
  ].join('');
  const total = order.totalCents === null ? '<span class="muted">Quote pending</span>' : `<strong>${price(order.totalCents)}</strong>`;
  const options = statusesFor(order.type).map((s) => `<option value="${text(s)}" ${s === order.status ? 'selected' : ''}>${text(s)}</option>`).join('');
  return `<article class="surface admin-order ${order.type === 'custom' ? 'royal-order' : ''}" data-order="${text(order.id)}">
    <div class="split"><h3>${text(order.id)} · ${text(typeLabel(order.type))}</h3><span class="admin-badges">${place}${statusBadge(order.status)}</span></div>
    ${details}
    ${quoteForm(order)}
    <div class="split">${total}<label>Update status<select data-action="status" data-id="${text(order.id)}">${options}</select></label></div>
  </article>`;
}

function orderList(state, filter) {
  const orders = [...state.orders].reverse().filter((order) => filter === 'All' || order.type === filter);
  const filterOptions = ['All', ...ORDER_TYPES]
    .map((t) => `<option value="${t}" ${filter === t ? 'selected' : ''}>${t === 'All' ? 'All types' : text(typeLabel(t))}</option>`)
    .join('');
  return `<section>
    <div class="split section-heading"><h2>Incoming orders</h2><label>Order type<select id="admin-filter">${filterOptions}</select></label></div>
    ${orders.length ? `<div class="order-list">${orders.map((order) => adminOrder(state, order)).join('')}</div>` : emptyState('No matching orders', 'Orders appear here as soon as customers send them.')}
  </section>`;
}

function productForm() {
  return `<details class="surface admin-product">
    <summary>Add product</summary>
    <form id="add-product" class="form-fields">
      <label>Name<input name="name" required minlength="2" maxlength="120"></label>
      <label>Category<select name="group" required>${groups.map((group) => `<option value="${text(group)}">${text(group)}</option>`).join('')}</select></label>
      <label>Price (crowns)<input name="price" required inputmode="decimal" pattern="\\d{1,6}(\\.\\d{1,2})?" placeholder="0.00"></label>
      <label>Size<input name="size" maxlength="80"></label>
      <label>Description<textarea name="short" maxlength="240" rows="2"></textarea></label>
      <label>Details<textarea name="details" maxlength="1600" rows="3"></textarea></label>
      <label>Specifications<textarea name="specs" rows="3"></textarea></label>
      <label>Image (PNG, JPG, WebP; max 350 KB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="button" type="submit">Add product</button>
    </form>
  </details>`;
}

function demoTools() {
  return `<section class="surface demo-tools">
    <h2>Demo tools</h2>
    <p class="muted">Add three orders from made-up customers to show a busy forge, or clear everything before the next demo.</p>
    <div class="demo-actions">
      <button class="button button-secondary" type="button" data-action="add-samples">Add sample orders</button>
      <button class="button button-danger" type="button" data-action="reset-demo">Clear all demo data</button>
    </div>
  </section>`;
}

// forge board page rendering
export function adminPage(state, ui, features = [], activeCatalog = catalog) {
  const tabs = [{ id: 'orders', title: 'Orders' }, ...features.map((f) => ({ id: 'ext:' + f.id, title: f.title }))];
  const selected = features.find((f) => 'ext:' + f.id === ui.adminTab);
  const tabBar = tabs.length > 1
    ? `<nav class="tabs" aria-label="Forge board tabs">${tabs.map((t) => `<button type="button" data-action="admin-tab" data-id="${text(t.id)}" class="${ui.adminTab === t.id ? 'is-active' : ''}">${text(t.title)}</button>`).join('')}</nav>`
    : '';
  return `${heading("Gunter's workshop", 'Forge Board', 'Every order with customer details, prices and status. Work Tickets shows only the work to do.')}
    ${statsPanel(state)}
    ${tabBar}
    ${productForm()}
    ${selected ? extensionPanel(selected, { state, catalog: activeCatalog }) : orderList(state, ui.adminFilter)}
    ${demoTools()}`;
}
