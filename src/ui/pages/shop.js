import { catalog, groups } from '../../data/catalog.js';
import { searchCatalog, pageForQuery, suggestQuery, POPULAR_SEARCHES } from '../../domain/search.js';
import { hero } from '../components/hero.js';
import { productCard } from '../components/product-card.js';
import { emptyState, extensionPanel, crestImage, text } from '../components/shared.js';

const FILTERS = Object.freeze(['All', ...groups, 'Commission']);

// render shop page and handle filters
function matchesCategory(product, category) {
  if (category === 'All') return true;
  if (category === 'Commission') return product.type === 'custom';
  return product.groups.includes(category);
}

export function searchResults(state, ui, activeCatalog = catalog) {
  const pool = activeCatalog.filter((p) => matchesCategory(p, ui.category) && (!ui.savedOnly || (p.type === 'standard' && state.favorites.includes(p.id))));
  const query = ui.search.trim();
  let items = pool;
  const matched = new Map();
  if (query) {
    const ranked = searchCatalog(pool, query);
    items = ranked.map((result) => result.product);
    for (const result of ranked) matched.set(result.product.id, result.matched);
  }
  if (ui.sort === 'low') items = [...items].sort((a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity));
  if (ui.sort === 'high') items = [...items].sort((a, b) => (b.priceCents ?? -1) - (a.priceCents ?? -1));
  return { items, matched };
}

export function visibleProducts(state, ui, activeCatalog = catalog) {
  return searchResults(state, ui, activeCatalog).items;
}

function filterBar(state, ui) {
  const buttons = FILTERS.map(
    (g) => `<button class="filter ${ui.category === g ? 'is-active' : ''}" type="button" data-action="filter" data-id="${text(g)}" aria-pressed="${ui.category === g}">${text(g)}</button>`,
  ).join('');
  const savedCount = state.favorites.length;
  return `<div class="catalog-tools">
    <div class="filters">${buttons}<button class="filter ${ui.savedOnly ? 'is-active' : ''}" type="button" data-action="saved-filter" aria-pressed="${ui.savedOnly}">Your ♡${savedCount ? ` <span class="filter-count">${savedCount}</span>` : ''}</button></div>
    <label>Sort<select id="sort">
      <option value="featured">${ui.search.trim() ? 'Best match' : 'Featured'}</option>
      <option value="low" ${ui.sort === 'low' ? 'selected' : ''}>Price: low to high</option>
      <option value="high" ${ui.sort === 'high' ? 'selected' : ''}>Price: high to low</option>
    </select></label>
  </div>`;
}

const searchChip = (query) => `<button type="button" class="filter search-chip" data-action="search-suggest" data-id="${text(query)}">${text(query)}</button>`;

function noResults(ui, activeCatalog = catalog) {
  const query = ui.search.trim();
  if (query && pageForQuery(query)) return `<p class="muted search-page-only">No goods match “${text(query)}”. Use the button above to open the page.</p>`;
  if (!query) {
    if (ui.savedOnly) return emptyState('No saved goods yet', 'Tap the ♡ on any product to save it here.', 'clear-filters', 'Show all goods');
    return emptyState('No matching goods', 'Change the filters to see more goods.', 'clear-filters', 'Reset filters');
  }
  const filtered = ui.category !== 'All' || ui.savedOnly;
  const suggestion = suggestQuery(activeCatalog, query);
  return `<section class="surface empty-state search-empty">
    <h2>No goods match “${text(query)}”</h2>
    ${suggestion ? `<p>Did you mean ${searchChip(suggestion)}?</p>` : '<p>Check the spelling, or try one of these:</p>'}
    ${suggestion ? '' : `<div class="search-chips">${POPULAR_SEARCHES.map(searchChip).join('')}</div>`}
    ${filtered ? '<button class="button button-secondary" type="button" data-action="clear-filters-keep-search">Search all categories</button>' : ''}
  </section>`;
}

function shortcutCard(query) {
  const page = pageForQuery(query);
  if (!page) return '';
  return `<button type="button" class="page-shortcut" data-view="${text(page.view)}">
    <span>Looking for <strong>${text(page.label)}</strong>?</span><span aria-hidden="true">Go →</span>
  </button>`;
}

function productGrid(state, items, matched) {
  return `<div class="product-grid">${items
    .map((p) => productCard(p, { quantity: state.cart[p.id] || 0, saved: state.favorites.includes(p.id), matched: matched.get(p.id) }))
    .join('')}</div>`;
}

function searchView(state, ui, activeCatalog) {
  const query = ui.search.trim();
  const { items, matched } = searchResults(state, ui, activeCatalog);
  return `<section id="catalog" class="catalog-section search-results">
    <div class="split search-heading">
      <div>
        <p class="eyebrow">Search</p>
        <h1 id="results-heading" tabindex="-1">Results for “${text(query)}”</h1>
        <p class="result-count muted" aria-live="polite">${items.length} ${items.length === 1 ? 'item' : 'items'} found · <button class="text-button" type="button" data-action="clear-search">Clear search</button></p>
      </div>
    </div>
    ${shortcutCard(query)}
    ${filterBar(state, ui)}
    ${items.length ? productGrid(state, items, matched) : noResults(ui, activeCatalog)}
  </section>`;
}

// show items that are searched, or show everything when search is blank
export function shopPage(state, ui, features = [], activeCatalog = catalog) {
  if (ui.search.trim()) return searchView(state, ui, activeCatalog);
  const { items, matched } = searchResults(state, ui, activeCatalog);
  return `${hero()}
    <section id="catalog" class="catalog-section">
      <div class="split section-heading"><div><h2>Our collections ${crestImage('inline-crest')}</h2></div></div>
      ${filterBar(state, ui)}
      <p class="result-count muted" aria-live="polite">${items.length} ${items.length === 1 ? 'item' : 'items'}</p>
      ${items.length ? productGrid(state, items, matched) : noResults(ui, activeCatalog)}
    </section>
    ${features.map((f) => extensionPanel(f, { state, catalog: activeCatalog })).join('')}
    <section class="surface theme-note">${crestImage('note-crest')}
      <h2>First come, first forged</h2>
      <p>Gunter has one anvil, so he works through orders in the order they arrive. Custom pieces and repairs join the line once he has checked them. Old iron you bring is melted down for new work.</p>
    </section>`;
}
