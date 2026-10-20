import { customerFields } from './shared.js';

// generate form for checkout
export function checkoutForm() {
  return `<form id="checkout" class="checkout-form" novalidate>
    <h3>Your details</h3>
    ${customerFields()}
    <label>Notes for Gunter (optional)<textarea name="notes" maxlength="500" rows="3"></textarea></label>
    <p class="form-error" role="alert" hidden></p>
    <button class="button button-wide" type="submit">Place order</button>
  </form>`;
}
