import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/data/catalog.js';
import { makeState } from '../src/domain/core.js';
import { editDistance, normalizeWords, queryWords, searchCatalog, pageForQuery, suggestQuery } from '../src/domain/search.js';
import { shopPage, visibleProducts } from '../src/ui/pages/shop.js';

const ids = (query) => searchCatalog(catalog, query).map((r) => r.product.id);
const ui = (search, extra = {}) => ({ category: 'All', savedOnly: false, sort: 'featured', search, ...extra });

test('edit distance counts swapped neighbours as one typo', () => {
  assert.equal(editDistance('sword', 'sword'), 0);
  assert.equal(editDistance('swrod', 'sword'), 1);
  assert.equal(editDistance('mial', 'mail'), 1);
  assert.equal(editDistance('pot', 'plate'), 3);
  assert.ok(editDistance('cauldron', 'sword', 2) > 2);
});

test('words are lower-cased, split on punctuation and made singular', () => {
  assert.deepEqual(normalizeWords('Swords, POTS & Chain-Mail!'), ['sword', 'pot', 'chain', 'mail']);
  assert.deepEqual(normalizeWords('Gunter’s glass'), ['gunter', 'glass']);
  assert.deepEqual(queryWords('the armour'), ['armor']);
});

test('exact name matches rank before description matches', () => {
  const swords = ids('sword');
  assert.ok(swords.slice(0, 3).every((id) => id.startsWith('sword-')));
  assert.ok(swords.includes('sword-longsword'));
  assert.deepEqual(ids('arming'), ['sword-arming']);
});

test('typos still find the right goods', () => {
  assert.ok(ids('swrod').includes('sword-arming'));
  assert.deepEqual(ids('longswrd'), ['sword-longsword']);
  assert.ok(ids('plaet armr').includes('plate-heavy'));
  assert.ok(ids('cauldorn').includes('pot-large'));
});

test('short words are not fuzzy-matched to avoid noise', () => {
  assert.deepEqual(ids('pit'), []);
});

test('synonyms and plurals match', () => {
  assert.ok(ids('armour').includes('plate-light'));
  assert.deepEqual(ids('chainmail').slice(0, 2), ['mail-short', 'mail-hauberk']);
  assert.ok(ids('pots').includes('pot-small'));
  assert.deepEqual(ids('custom').sort(), ['armor-commission', 'cookware-commission', 'sword-commission']);
});

test('every query word must match and specs are searchable', () => {
  assert.deepEqual(ids('pot 40'), ['pot-large']);
  assert.deepEqual(ids('helmet'), ['plate-heavy']);
  assert.deepEqual(ids('dragon'), []);
});

test('page names open the matching page on Enter', () => {
  assert.deepEqual(pageForQuery('repair'), { view: 'repairs', label: 'Repairs', exact: true });
  assert.deepEqual(pageForQuery('Fix'), { view: 'repairs', label: 'Repairs', exact: true });
  assert.deepEqual(pageForQuery('track my order'), { view: 'orders', label: 'My Orders', exact: true });
  assert.deepEqual(pageForQuery('orders'), { view: 'orders', label: 'My Orders', exact: true });
  assert.deepEqual(pageForQuery('cart'), { view: 'cart', label: 'Satchel', exact: true });
});

test('partial page names show a shortcut but do not jump', () => {
  assert.deepEqual(pageForQuery('rep'), { view: 'repairs', label: 'Repairs', exact: false });
  assert.deepEqual(pageForQuery('repair sword'), { view: 'repairs', label: 'Repairs', exact: false });
  assert.equal(pageForQuery('re'), null);
  assert.equal(pageForQuery('sword'), null);
  assert.equal(pageForQuery('   '), null);
});

test('Gunter pages are not reachable from customer search', () => {
  for (const query of ['forge board', 'board', 'tickets', 'work tickets', 'admin']) assert.ok(!pageForQuery(query)?.exact, query);
});

test('a spelling suggestion is offered only when it finds goods', () => {
  assert.equal(suggestQuery(catalog, 'swrdo'), 'sword');
  assert.equal(suggestQuery(catalog, 'sword'), null);
  assert.equal(suggestQuery(catalog, 'xqzv'), null);
});

test('search results page replaces the banner and highlights matched names', () => {
  const html = shopPage(makeState(), ui('arming'));
  assert.ok(!html.includes('class="hero"'));
  assert.match(html, /Results for “arming”/);
  assert.match(html, /1 item found/);
  assert.match(html, /<mark>Arming<\/mark> Sword/);
});

test('empty search keeps the normal shop with banner', () => {
  assert.match(shopPage(makeState(), ui('')), /class="hero"/);
});

test('no results shows a suggestion or popular searches', () => {
  assert.match(shopPage(makeState(), ui('swrdo')), /Did you mean/);
  assert.match(shopPage(makeState(), ui('dragon')), /data-action="search-suggest" data-id="cauldron"/);
});

test('search inside a category offers to search everything', () => {
  const html = shopPage(makeState(), ui('cauldron', { category: 'Sword' }));
  assert.match(html, /clear-filters-keep-search/);
});

test('page shortcut card appears in results', () => {
  assert.match(shopPage(makeState(), ui('rep')), /class="page-shortcut" data-view="repairs"/);
});

test('search results are escaped', () => {
  const html = shopPage(makeState(), ui('<img src=x onerror=alert(1)>'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img/);
});

test('price sort still works on search results', () => {
  assert.deepEqual(visibleProducts(makeState(), ui('pot', { sort: 'high' })).map((p) => p.id), ['pot-large', 'pot-medium', 'pot-small', 'cookware-commission']);
});
