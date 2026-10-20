import { text } from './shared.js';

// show the saved state and update the saved list 
export function favoriteButton(product, saved) {
  const label = saved ? `Remove ${product.name} from saved products` : `Save ${product.name}`;
  return `<button type="button" class="favorite-icon ${saved ? 'is-saved' : ''}" data-action="favorite" data-id="${text(product.id)}" aria-pressed="${saved}" aria-label="${text(label)}" title="${saved ? 'Saved' : 'Save for later'}">
    <svg viewBox="0 0 24 24" width="23" height="23" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>
  </button>`;
}

// show add to cart when quantity is 0 and show - 1 + when quantity >0
export function quantityPicker(product, quantity, context = 'card') {
  const id = text(product.id);
  const name = text(product.name);
  if (quantity <= 0) {
    return `<button class="button add-cart-button" type="button" data-action="increase" data-id="${id}">Add to satchel</button>`;
  }
  return `<div class="quantity ${context === 'card' ? 'card-quantity' : 'modal-quantity'}" role="group" aria-label="Quantity for ${name}">
    <button type="button" data-action="decrease" data-id="${id}" aria-label="Decrease ${name}">−</button>
    <strong aria-live="polite">${quantity}</strong>
    <button type="button" data-action="increase" data-id="${id}" aria-label="Increase ${name}" ${quantity >= 99 ? 'disabled' : ''}>+</button>
  </div>`;
}
