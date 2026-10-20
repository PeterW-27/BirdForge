import { text, price, customerFields } from './shared.js';
import { quantityPicker } from './purchase-controls.js';
import { MIN_BULK, MAX_BULK } from '../../domain/core.js';

const specList = (product) =>
  product.specs?.length ? `<ul class="spec-list">${product.specs.map((spec) => `<li>${text(spec)}</li>`).join('')}</ul>` : '';

// render popup frames
function modalFrame(product, body, extraClass = '') {
  return `<div class="modal-backdrop" data-action="backdrop"><section class="modal surface ${extraClass}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <button class="modal-close" data-action="close" type="button" aria-label="Close">×</button>
    <div class="modal-image">${product.image ? `<img src="${text(product.image)}" alt="${text(product.name)}">` : ''}</div>
    <div class="modal-body">${body}</div>
  </section></div>`;
}

function detailBody(product, quantity) {
  return `<h2 id="modal-title">${text(product.name)}</h2>
    <p>${text(product.details)}</p>
    ${specList(product)}
    <p class="product-price">${price(product.priceCents)}</p>
    <p class="muted forge-note">Forged to order. It joins Gunter's work list as soon as you order.</p>
    <div class="modal-cart-controls">${quantityPicker(product, quantity, 'modal')}</div>
    <div class="modal-bulk-section">
      <p class="muted">Need ${MIN_BULK} or more for a guard, kitchen or guild?</p>
      <button class="button button-secondary button-wide" type="button" data-action="bulk" data-id="${text(product.id)}">Bulk order (10+)</button>
    </div>`;
}

function directOrderBody(product, bulk) {
  const custom = product.type === 'custom';
  const intro = bulk ? 'Bulk orders skip the satchel and go straight to Gunter.' : 'Gunter reads your brief, sends a price, then starts forging.';
  const bulkFields = `<label>Your title or position<input name="title" required minlength="2" maxlength="80" placeholder="Steward, captain, guild master…"></label>
    <label>Quantity (${MIN_BULK}–${MAX_BULK})<input type="number" name="qty" inputmode="numeric" required min="${MIN_BULK}" max="${MAX_BULK}" step="1" value="${MIN_BULK}"></label>
`;
  const customFields = `<label>Describe your design<textarea name="description" required minlength="10" maxlength="1600" rows="5" placeholder="Size, look, symbols, how you will use it…"></textarea></label>
    <label>Reference sketch (optional · PNG, JPG or WebP under 350 KB)<input name="reference" type="file" accept="image/png,image/jpeg,image/webp"></label>`;
  return `<p class="eyebrow">${bulk ? 'Bulk order' : 'Custom commission'}</p>
    <h2 id="modal-title">${text(product.name)}</h2>
    <p>${custom ? 'Price quoted after Gunter reviews your design.' : `${price(product.priceCents)} each`}</p>
    <p class="muted">${intro}</p>
    ${custom ? specList(product) : `<p class="direct-price-preview" id="direct-estimate" aria-live="polite">Estimated total: ${price(product.priceCents * MIN_BULK)}</p>`}
    <form id="direct-order" data-id="${text(product.id)}" data-mode="${bulk ? 'bulk' : 'custom'}">
      ${bulk ? bulkFields : '<input type="hidden" name="qty" value="1">'}
      ${customerFields()}
      ${custom ? customFields : ''}
      <label>Notes for Gunter (optional)<textarea name="notes" maxlength="500" rows="3"></textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="button button-wide" type="submit">${custom ? 'Send for a quote' : 'Place bulk order'}</button>
    </form>`;
}

// handling clicks on normal or commission cards
export function productModal(product, quantity = 0, mode = 'detail') {
  const custom = product.type === 'custom';
  if (mode === 'detail' && !custom) return modalFrame(product, detailBody(product, quantity), 'detail-modal');
  const bulk = mode === 'bulk' && !custom;
  return modalFrame(product, directOrderBody(product, bulk), bulk ? 'direct-order-modal bulk-order-modal' : 'direct-order-modal commission-order-modal');
}
