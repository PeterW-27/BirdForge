import { escapeHTML, money, statusesFor } from '../../domain/core.js';

// keep the data formatting consistent
export const text = escapeHTML;
export const price = money;
export const crest = 'assets/crest.png';

const TYPE_LABELS = Object.freeze({ standard: 'Standard order', bulk: 'Bulk order', custom: 'Custom commission', repair: 'Repair' });

export const typeLabel = (type) => TYPE_LABELS[type] || type;

// order status management
export function crestImage(cssClass = 'crest') {
  return `<img class="${text(cssClass)}" src="${crest}" alt="Gunter's Forge coat of arms">`;
}

export function heading(eyebrow, title, description = '') {
  return `<header class="page-heading">${crestImage('section-crest')}<div>
    <p class="eyebrow">${text(eyebrow)}</p>
    <h1>${text(title)}</h1>
    ${description ? `<p class="muted">${text(description)}</p>` : ''}
  </div></header>`;
}

export function referenceButton(order) {
  if (!order.referenceImage) return '';
  return `<button type="button" class="reference-thumb" data-action="view-reference" data-id="${text(order.id)}"><img src="${text(order.referenceImage)}" alt="">View reference image</button>`;
}

export function emptyState(title, description, action = 'shop', label = 'Browse goods') {
  return `<section class="surface empty-state">
    <h2>${text(title)}</h2>
    <p>${text(description)}</p>
    <button class="button" data-action="${text(action)}" type="button">${text(label)}</button>
  </section>`;
}

export function progress(status, type = 'standard') {
  const stages = statusesFor(type);
  const current = stages.indexOf(status);
  const variant = type === 'repair' ? 'repair-progress' : type === 'custom' ? 'commission-progress' : '';
  return `<ol class="progress ${variant}" aria-label="Order progress: ${text(status)}">${stages
    .map((stage, i) => `<li class="${i <= current ? 'is-done' : ''}" ${i === current ? 'aria-current="step"' : ''}>${text(stage)}</li>`)
    .join('')}</ol>`;
}

// handle status and show placement, show message on special status. 
export function statusBadge(status) {
  return `<span class="status" data-status="${text(status.toLowerCase().replace(/\s+/g, '-'))}">${text(status)}</span>`;
}

export function extensionPanel(feature, api) {
  let content;
  try {
    content = String(feature.render(api));
  } catch {
    content = '<p class="error-text">Feature unavailable.</p>';
  }
  return `<section class="surface extension-panel" data-extension="${text(feature.id)}"><h2>${text(feature.title)}</h2>${content}</section>`;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const WAITING_MESSAGES = Object.freeze({
  Placed: 'Gunter has received your request. He will review it before it joins his work list.',
  'Awaiting Drop-off': 'Bring the item to the forge. It joins the work list after Gunter checks it.',
  Assessing: 'Gunter is reviewing your request. It joins the work list once he starts forging.',
});

export function queuePanel(info) {
  if (!info) return '';
  if (info.stage === 'queued') {
    const ahead = info.ordersAhead === 0
      ? 'Your order is next at the anvil.'
      : `${plural(info.ordersAhead, 'order')} ahead of yours (${plural(info.itemsAhead, 'item')}).`;
    const items = info.openItems < info.totalItems ? `<span>${info.totalItems - info.openItems} of ${info.totalItems} items already forged.</span>` : '';
    return `<div class="queue-panel is-queued" data-queue-position="${info.position}">
      <div class="queue-number"><small>Place in line</small><strong>#${info.position}</strong><small>of ${info.queueLength}</small></div>
      <div class="queue-copy"><strong>On Gunter's work list</strong><span>${ahead}</span>${items}</div>
    </div>`;
  }
  const messages = {
    delivering: ['Forging finished', 'Your order has left the anvil and is on its way.'],
    delivered: ['Delivered', 'This order is complete. Thank you for choosing Gunter.'],
    finished: ['Forging finished', 'All items are done. Gunter will send them soon.'],
    waiting: ['Not on the work list yet', WAITING_MESSAGES[info.status] || 'Gunter will add this order to his work list soon.'],
  };
  const [title, body] = messages[info.stage] || messages.waiting;
  return `<div class="queue-panel is-${text(info.stage)}"><div class="queue-copy"><strong>${text(title)}</strong><span>${text(body)}</span></div></div>`;
}

export function recyclingFields({ variant = 'cart', enabled = false, details = '' } = {}) {
  const title = '<span>Recycle Your Iron Tools</span> <small>(optional)</small>';
  const toggle = `<label class="recycle-option"><input type="checkbox" name="recycle" value="yes" ${enabled ? 'checked' : ''}><span>Bring old iron tools with my order</span></label>`;
  const detailsField = `<div class="recycle-extra" ${enabled ? '' : 'hidden'}><label>Which iron tools will you bring?<textarea name="recycleDetails" maxlength="240" rows="3" placeholder="e.g. a broken hoe and two old horseshoes">${text(details)}</textarea></label></div>`;
  if (variant === 'cart') {
    return `<section class="surface recycle-panel" id="recycle-panel" aria-labelledby="recycle-heading">
      <h2 id="recycle-heading">${title}</h2>
      <p class="muted">Do you have unusable, worn-out tools? Gunter will melt them down and recycle the iron! You will be paid based on the weight of the metal.</p>
      ${toggle}${detailsField}
    </section>`;
  }
  return '';
}

// form filling fields
export function customerFields() {
  return `<div class="form-fields">
    <label>Your name<input name="name" required minlength="2" maxlength="80" placeholder="Elena of Mautern" autocomplete="name" data-error="Enter your name (2–80 characters)."></label>
    <label>Email<input name="email" required type="email" maxlength="120" placeholder="elena@example.com" autocomplete="email" data-error="Enter a valid email address, like name@example.com."></label>
    <label>Address or pickup point<input name="address" maxlength="180" placeholder="Mautern, market quarter" autocomplete="street-address"></label>
  </div>`;
}
