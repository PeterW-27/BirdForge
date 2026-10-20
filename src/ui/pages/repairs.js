import { heading, customerFields } from '../components/shared.js';

// render repair page
export function repairsPage() {
  return `${heading('Repairs', 'Ironware Repair', 'Bent hinge, cracked pot, dull blade? Gunter repairs any iron item.')}
    <form id="repair-order" class="repair-form">
      <section class="surface repair-panel">
        <h2>What needs fixing?</h2>
        <div class="form-fields">
          <label>Item name<input name="itemName" type="text" minlength="2" maxlength="120" required placeholder="e.g. Gate hinge"></label>
          <label>Quantity<input name="qty" type="number" inputmode="numeric" min="1" max="99" step="1" value="1" required></label>
          <label>What is wrong with it?<textarea name="damage" minlength="10" maxlength="1600" rows="5" required placeholder="Describe the damage, e.g. the hinge pin snapped"></textarea></label>
          <label>Photo (optional · PNG, JPG or WebP under 350 KB)<input name="reference" type="file" accept="image/png,image/jpeg,image/webp"></label>
        </div>
      </section>
      <section class="surface repair-panel">
        <h2>Contact details</h2>
        ${customerFields()}
        <ol class="repair-steps">
          <li>Send this request.</li>
          <li>Bring the item to the forge.</li>
          <li>Gunter checks it and sends a price.</li>
          <li>It joins his work list. Track it under My Orders.</li>
        </ol>
        <p class="form-error" role="alert" hidden></p>
        <button class="button button-wide" type="submit">Send repair request</button>
      </section>
    </form>`;
}
