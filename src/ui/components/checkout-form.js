import { money } from '../../domain/core.js';
import { availableCredit } from '../../domain/materials.js';
import { customerFields } from './shared.js';

// generate form for checkout
export function creditCheckbox(state, total) {
  const cents = availableCredit(state, total);
  return cents ? `<label class="check-toggle"><input type="checkbox" name="creditCents" value="${cents}">Use Forge Credit (−${money(cents)}, up to 25% of this order)</label>` : '';
}

export function checkoutForm(state = {}, total = 0) {
  return `<form id="checkout" class="checkout-form" novalidate>
    <h3>Your details</h3>
    ${creditCheckbox(state, total)}
    ${customerFields()}
    <label>Notes for Gunter (optional)<textarea name="notes" maxlength="500" rows="3"></textarea></label>
    <p class="form-error" role="alert" hidden></p>
    <button class="button button-wide" type="submit">Place order</button>
  </form>`;
}
