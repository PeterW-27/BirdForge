import { crestImage } from './shared.js';

// page header navigations initial
export const CUSTOMER_VIEWS = Object.freeze(['shop', 'cart', 'repairs', 'orders']);
export const SMITH_VIEWS = Object.freeze(['admin', 'tickets']);

const satchelLabel = 'Satchel <b class="cart-count" data-cart-count>0</b>';

const customerGroup = `<div class="nav-group" aria-label="Customer">
        <button type="button" data-view="shop">Shop</button>
        <button type="button" data-view="cart">${satchelLabel}</button>
        <button type="button" data-view="repairs">Repairs</button>
        <button type="button" data-view="orders">My Orders</button>
      </div>`;
const smithGroup = (switchButton) => `<div class="nav-group nav-group-smith" aria-label="Gunter's workshop">
        <span class="nav-group-label">Gunter</span>
        <button type="button" data-view="admin">Forge Board</button>
        <button type="button" data-view="tickets">Work Tickets</button>
        ${switchButton ? '<button type="button" class="role-switch" data-action="open-app">Shop ↗</button>' : ''}
      </div>`;

export function header(side = 'customer') {
  const smith = side === 'smith';
  const nav = side === 'all' ? customerGroup + smithGroup(false) : smith
    ? `<div class="nav-group nav-group-smith" aria-label="Gunter's workshop">
        <span class="nav-group-label">Gunter</span>
        <button type="button" data-view="admin">Forge Board</button>
        <button type="button" data-view="tickets">Work Tickets</button>
        <button type="button" class="role-switch" data-action="open-app">Shop ↗</button>
      </div>`
    : `<div class="nav-group" aria-label="Customer">
        <button type="button" data-view="shop">Shop</button>
        <button type="button" data-view="cart">${satchelLabel}</button>
        <button type="button" data-view="repairs">Repairs</button>
        <button type="button" data-view="orders">My Orders</button>
      </div>`;
  return `<header class="site-header"><div class="header-inner">
    <a href="#${smith ? 'admin' : 'shop'}" id="brand" class="brand">${crestImage('brand-crest')}<span><strong>Birdforge</strong><small>${smith ? "Gunter's workshop" : 'Royal smith of Mautern'}</small></span></a>
    <form class="search-field" id="search-form" role="search">
      <label class="sr-only" for="search">Search goods or pages</label>
      <input id="search" type="search" enterkeyhint="search" placeholder="Search swords, armor, pots…" autocomplete="off">
      <button class="search-button" type="submit" aria-label="Search"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg></button>
    </form>
    <nav class="desktop-nav" aria-label="Main navigation">
      ${nav}
    </nav>
  </div></header>`;
}

export function footer(side = 'customer', showSwitch = true, synced = false) {
  return `<footer class="site-footer"><div class="footer-inner">
    ${crestImage('footer-crest')}
    <strong>Birdforge</strong>
    <p>Market Quarter, royal town of Mautern · Open from first bell to sunset.</p>
    <p>First come, first forged: every order is made in the order it arrives.</p>
    <p class="demo-note">Competition demo: no real purchases or payments. ${synced ? 'Orders go to Gunter\'s workshop online' : 'Orders stay in this browser'}, so use made-up customer details.</p>
    <div class="footer-data-actions" role="group" aria-label="Data backup">
      <button type="button" class="footer-data-button" data-action="export-backup">Backup</button>
      <button type="button" class="footer-data-button" data-action="restore-backup">Restore</button>
    </div>
    ${showSwitch ? `<div class="footer-data-actions">
      <button type="button" class="footer-data-button" data-action="open-app">${side === 'smith' ? 'Customer shop ↗' : "Gunter's workshop ↗"}</button>
    </div>` : ''}
    <input id="backup-file" type="file" accept=".json,application/json" aria-label="Choose backup file" hidden>
  </div></footer>`;
}

// mobile navigation bar
export function mobileNav(side = 'customer') {
  if (side === 'all') {
    return `<nav class="mobile-nav" aria-label="Mobile navigation">
    <div class="mobile-nav-group" data-nav-role="customer" style="grid-template-columns:repeat(5,minmax(0,1fr))">
      <button type="button" data-view="shop">Shop</button>
      <button type="button" data-view="cart">${satchelLabel}</button>
      <button type="button" data-view="repairs">Repairs</button>
      <button type="button" data-view="orders">My Orders</button>
      <button type="button" class="role-switch" data-view="admin">Gunter ⚒</button>
    </div>
    <div class="mobile-nav-group" data-nav-role="smith" hidden>
      <button type="button" class="role-switch" data-view="shop">← Shop</button>
      <button type="button" data-view="admin">Forge Board</button>
      <button type="button" data-view="tickets">Work Tickets</button>
    </div>
  </nav>`;
  }
  if (side === 'smith') {
    return `<nav class="mobile-nav" aria-label="Mobile navigation">
    <div class="mobile-nav-group" data-nav-role="smith">
      <button type="button" data-view="admin">Forge Board</button>
      <button type="button" data-view="tickets">Work Tickets</button>
      <button type="button" class="role-switch" data-action="open-app">Shop ↗</button>
    </div>
  </nav>`;
  }
  return `<nav class="mobile-nav" aria-label="Mobile navigation">
    <div class="mobile-nav-group" data-nav-role="customer">
      <button type="button" data-view="shop">Shop</button>
      <button type="button" data-view="cart">${satchelLabel}</button>
      <button type="button" data-view="repairs">Repairs</button>
      <button type="button" data-view="orders">My Orders</button>
    </div>
  </nav>`;
}
