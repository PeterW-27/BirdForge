import { crestImage } from './shared.js';

// mainpage description and two buttons to jump to browse and order page
export function hero() {
  return `<section class="hero"><div class="hero-content">
    <p class="eyebrow">Birdforge · Royal blacksmith of Mautern</p>
    <h1>Forged by Gunter, ordered from your orb</h1>
    <p>Order swords, armor, chain mail and cooking pots without waiting at the forge door. You can check your place in Gunter's line at any time.</p>
    <div class="hero-actions">
      <button class="button" data-action="browse" type="button">Browse the goods</button>
      <button class="button button-ghost" data-view="orders" type="button">Track my orders</button>
    </div>
  </div>${crestImage('hero-crest')}</section>
  <ol class="how-it-works" aria-label="How ordering works">
    <li><b>1</b><span><strong>Choose</strong> <span class="step-more">goods, or ask for a custom piece or a repair.</span></span></li>
    <li><b>2</b><span><strong>Gunter forges</strong> <span class="step-more">orders in the order they arrive.</span></span></li>
    <li><b>3</b><span><strong>Track</strong> <span class="step-more">your place in line under My Orders.</span></span></li>
  </ol><section class="surface mine-entry"><h2>Gunter's Mining Adventure</h2><p>Join a crew of 2–6 on your phone, play cards together and battle five floors on Gunter's big screen. Bring home ore for Forge Credit.</p><button class="button" type="button" data-view="mine">Join the mine</button></section>`;
}
