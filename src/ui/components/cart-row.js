import { text, price } from './shared.js';
import { quantityPicker } from './purchase-controls.js';

// render one piece of cart goods
export function cartRow(product, qty) {
  return `<article class="cart-row" data-product="${text(product.id)}">
    <img class="cart-image" src="${text(product.image)}" alt="${text(product.name)}">
    <div class="cart-details">
      <h3>${text(product.name)}</h3>
      <p>${price(product.priceCents)} each</p>
      ${quantityPicker(product, qty, 'cart')}
      <button type="button" class="text-button" data-action="remove" data-id="${text(product.id)}">Remove</button>
    </div>
    <strong class="line-price">${price(product.priceCents * qty)}</strong>
  </article>`;
}
