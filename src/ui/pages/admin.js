import { statusHistory } from '../components/status-history.js';
import { catalog, groups } from '../../data/catalog.js';
import { orderStats, statusesFor, queueInfo, isQuotedType, parseCrowns, ORDER_TYPES } from '../../domain/core.js';
import { productInUse } from '../../domain/products.js';
import { PRICE_PATTERN, PRICE_ERROR } from '../../domain/prices.js';
import { isSampleOrder } from '../../data/samples.js';
import { heading, emptyState, text, price, statusBadge, extensionPanel, typeLabel, referenceButton } from '../components/shared.js';
import { productCard } from '../components/product-card.js';
import { reportsPanel } from './reports.js';

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
  return `<form class="quote-form" data-id="${text(order.id)}" novalidate>
    <label>${order.totalCents === null ? 'Set a price (crowns)' : 'Change price (crowns)'}
      <input name="quote" inputmode="decimal" required maxlength="9" pattern="${PRICE_PATTERN}" value="${current}" placeholder="e.g. 240" data-error="${PRICE_ERROR}">
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
    referenceButton(order),
  ].join('');
  const total = order.totalCents === null ? '<span class="muted">Quote pending</span>' : `<strong>${price(order.totalCents)}</strong>`;
  const options = statusesFor(order.type).map((s) => `<option value="${text(s)}" ${s === order.status ? 'selected' : ''}>${text(s)}</option>`).join('');
  return `<article class="surface admin-order ${order.type === 'custom' ? 'royal-order' : ''}" data-order="${text(order.id)}">
    <div class="split"><h3>${text(order.id)} · ${text(typeLabel(order.type))}</h3><span class="admin-badges">${place}${statusBadge(order.status)}</span></div>
    ${details}
    ${quoteForm(order)}
    ${statusHistory(order)}
    <div class="split">${total}<label>Update status<select data-action="status" data-id="${text(order.id)}">${options}</select></label></div>
  </article>`;
}

function emptyOrders(deliveredCount, showDelivered) {
  if (deliveredCount && !showDelivered) {
    const done = deliveredCount === 1 ? '1 matching order is delivered' : `${deliveredCount} matching orders are delivered`;
    return emptyState('No open orders', `${done}. Turn on Show delivered to see finished work.`, 'show-delivered', 'Show delivered orders');
  }
  return emptyState('No matching orders', 'Orders appear here as soon as customers send them.');
}

function orderList(state, ui) {
  const filter = ui.adminFilter || 'All';
  const showDelivered = Boolean(ui.showDelivered);
  const matching = [...state.orders].reverse().filter((order) => filter === 'All' || order.type === filter);
  const deliveredCount = matching.filter((order) => order.status === 'Delivered').length;
  const orders = showDelivered ? matching : matching.filter((order) => order.status !== 'Delivered');
  const filterOptions = ['All', ...ORDER_TYPES]
    .map((t) => `<option value="${t}" ${filter === t ? 'selected' : ''}>${t === 'All' ? 'All types' : text(typeLabel(t))}</option>`)
    .join('');
  const deliveredToggle = `<label class="check-toggle"><input type="checkbox" id="show-delivered" ${showDelivered ? 'checked' : ''}>Show delivered${deliveredCount ? ` (${deliveredCount})` : ''}</label>`;
  return `<section>
    <div class="section-heading admin-list-heading"><h2>Incoming orders</h2><div class="admin-list-tools"><label>Order type<select id="admin-filter">${filterOptions}</select></label>${deliveredToggle}</div></div>
    ${orders.length ? `<div class="order-list">${orders.map((order) => adminOrder(state, order)).join('')}</div>` : emptyOrders(deliveredCount, showDelivered)}
  </section>`;
}

export function productPreview(data = {}, image = '') {
  const group = groups.includes(data.group) ? data.group : groups[0];
  const product = {
    id: 'preview',
    type: 'standard',
    name: String(data.name ?? '').trim() || 'New product',
    group,
    groups: [group],
    priceCents: parseCrowns(data.price),
    short: String(data.short ?? '').trim() || 'The short description appears here.',
    image: image || '',
  };
  return productCard(product);
}

function addedProductList(state) {
  const added = state.addedProducts || [];
  if (!added.length) return '';
  const rows = added.map((product) => {
    const used = productInUse(state, product.id);
    const action = used
      ? '<span class="muted added-product-lock">In an order</span>'
      : `<button type="button" class="text-button danger-link" data-action="remove-product" data-id="${text(product.id)}">Remove</button>`;
    return `<li><span><strong>${text(product.name)}</strong> <span class="muted">· ${text(product.group)} · ${price(product.priceCents)}</span></span>${action}</li>`;
  }).join('');
  return `<div class="added-products"><h3>Products you added</h3><ul>${rows}</ul></div>`;
}

function productForm(state, ui) {
  return `<details class="surface admin-product" id="add-product-panel" ${ui.productFormOpen ? 'open' : ''}>
    <summary>Add product</summary>
    <div class="add-product-layout">
      <form id="add-product" class="form-fields" novalidate>
        <p class="form-hint muted">New products join the shop right away as standard items. Not sure what to write? <button type="button" class="text-button" data-action="product-example">Fill in an example</button></p>
        <label>Name<input name="name" required minlength="2" maxlength="120" placeholder="e.g. Training Sword" data-error="Name must contain 2–120 characters."></label>
        <label>Category<select name="group" required>${groups.map((group) => `<option value="${text(group)}">${text(group)}</option>`).join('')}</select></label>
        <label>Price (crowns)<input name="price" required inputmode="decimal" maxlength="9" pattern="${PRICE_PATTERN}" placeholder="e.g. 42.00" data-error="${PRICE_ERROR}"></label>
        <label><span>Size <small>(optional)</small></span><input name="size" maxlength="80" placeholder="e.g. 80 cm blunt blade"></label>
        <label><span>Description <small>(optional · shown on the product card)</small></span><textarea name="short" maxlength="240" rows="2" placeholder="e.g. A blunt practice blade for squires and town guards."></textarea></label>
        <label><span>Details <small>(optional · shown in Details)</small></span><textarea name="details" maxlength="1600" rows="3" placeholder="e.g. Forged with a rounded tip so new fighters can practise safely."></textarea></label>
        <label><span>Specifications <small>(optional · one per line, up to 12)</small></span><textarea name="specs" rows="3" placeholder="e.g. Blunt edges&#10;Rounded tip&#10;Ash wood grip" data-error="Product fields exceed their limits."></textarea></label>
        <label><span>Image <small>(optional · PNG, JPG or WebP under 350 KB)</small></span><input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <p class="form-error" role="alert" hidden></p>
        <button class="button" type="submit">Add product</button>
      </form>
      <aside class="product-preview-panel" aria-label="Product card preview">
        <p class="eyebrow">Shop preview</p>
        <div id="product-preview" class="product-preview" inert>${productPreview()}</div>
      </aside>
    </div>
    ${addedProductList(state)}
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
  const tabs = [{ id: 'orders', title: 'Orders' }, { id: 'messages', title: 'Messages' }, { id: 'reports', title: 'Reports' }, ...features.map((f) => ({ id: 'ext:' + f.id, title: f.title }))];
  const selected = features.find((f) => 'ext:' + f.id === ui.adminTab);
  const tabBar = tabs.length > 1
    ? `<nav class="tabs" aria-label="Forge board tabs">${tabs.map((t) => `<button type="button" data-action="admin-tab" data-id="${text(t.id)}" class="${ui.adminTab === t.id ? 'is-active' : ''}">${text(t.title)}</button>`).join('')}</nav>`
    : '';
  return `${heading("Gunter's workshop", 'Forge Board', 'Every order with customer details, prices and status. Work Tickets shows only the work to do.')}
    ${statsPanel(state)}
    ${tabBar}
    ${ui.adminTab === 'reports' ? reportsPanel(state, ui) : ui.adminTab === 'messages' ? '<section class="surface" id="forge-messages" aria-label="Messages"></section>' : `${productForm(state, ui)}${selected ? extensionPanel(selected, { state, catalog: activeCatalog }) : orderList(state, ui)}${demoTools()}`}`;
}
