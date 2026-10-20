import { crestImage } from './shared.js';

// mainpage description and two buttons to jump to browse and order page
export function hero() {
  return `<section class="hero"><div class="hero-content">
    <p class="eyebrow">Royal blacksmith of Mautern</p>
    <h1>Forged by Gunter, ordered from your orb</h1>
    <p>Order swords, armor, chain mail and cooking pots without waiting at the forge door. You can check your place in Gunter's line at any time.</p>
    <div class="hero-actions">
      <button class="button" data-action="browse" type="button">Browse the goods</button>
      <button class="button button-ghost" data-view="orders" type="button">Track my orders</button>
    </div>
  </div>${crestImage('hero-crest')}</section>
  <ol class="how-it-works" aria-label="How ordering works">
    <li><b>1</b><span><strong>Choose</strong> goods, or ask for a custom piece or a repair.</span></li>
    <li><b>2</b><span><strong>Gunter forges</strong> orders in the order they arrive.</span></li>
    <li><b>3</b><span><strong>Track</strong> your place in line under My Orders.</span></li>
  </ol>`;
}
