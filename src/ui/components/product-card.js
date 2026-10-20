import { text, price, crestImage } from './shared.js';
import { favoriteButton, quantityPicker } from './purchase-controls.js';
import { normalizeWords } from '../../domain/search.js';

// separate product name and match search
function productName(name, matched) {
  if (!matched || !matched.size) return text(name);
  return name
    .split(/(\s+)/)
    .map((part) => (matched.has(normalizeWords(part)[0]) ? `<mark>${text(part)}</mark>` : text(part)))
    .join('');
}

function commissionCard(product, matched) {
  return `<article class="surface product-card commission-product" data-product="${text(product.id)}">
    <button type="button" class="product-image commission-image" data-action="commission" data-id="${text(product.id)}" aria-label="Request ${text(product.name)}">
      <img src="${text(product.image)}" alt="${text(product.name)}" loading="lazy">${crestImage('product-crest')}
    </button>
    <div class="product-body commission-body">
      <p class="card-tag">Made to order</p>
      <h3>${productName(product.name, matched)}</h3>
      <p>${text(product.short)}</p>
      <div class="product-actions">
        <button type="button" class="button commission-cta" data-action="commission" data-id="${text(product.id)}">Request a commission <span aria-hidden="true">↗</span></button>
      </div>
    </div>
  </article>`;
}

// separate the rendering of normal cards and commission cards
export function productCard(product, { quantity = 0, saved = false, matched = null } = {}) {
  if (product.type === 'custom') return commissionCard(product, matched);
  return `<article class="surface product-card" data-product="${text(product.id)}">
    <button type="button" class="product-image" data-action="detail" data-id="${text(product.id)}" aria-label="View details for ${text(product.name)}">
      ${product.image ? `<img src="${text(product.image)}" alt="${text(product.name)}" loading="lazy">` : `<span class="image-placeholder">${crestImage('placeholder-crest')}<small>No photo yet</small></span>`}
    </button>
    <div class="product-body">
      <h3>${productName(product.name, matched)}</h3>
      <p>${text(product.short)}</p>
      <div class="product-price">${price(product.priceCents)}</div>
      <div class="product-purchase">${quantityPicker(product, quantity, 'card')}${favoriteButton(product, saved)}</div>
      <div class="product-links">
        <button type="button" class="text-button" data-action="detail" data-id="${text(product.id)}">Details</button>
        <button type="button" class="text-button" data-action="bulk" data-id="${text(product.id)}">Bulk order (10+)</button>
      </div>
    </div>
  </article>`;
}
