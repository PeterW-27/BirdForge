const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'with', 'to', 'in', 'my', 'some']);

// search synonyms
const SYNONYMS = Object.freeze({
  armour: ['armor'],
  chainmail: ['chain', 'mail'],
  maille: ['mail'],
  blade: ['sword'],
  saber: ['sword'],
  sabre: ['sword'],
  kettle: ['pot'],
  cookpot: ['pot'],
  pan: ['cookware'],
  custom: ['commission'],
  bespoke: ['commission'],
});

// page shortcuts
const PAGE_SHORTCUTS = Object.freeze([
  { view: 'mine', label: 'Mine', words: ['mine', 'mining', 'ore', 'dig', 'canary'] },
  { view: 'repairs', label: 'Repairs', words: ['repair', 'repairs', 'fix', 'broken', 'mend'] },
  { view: 'orders', label: 'My Orders', words: ['order', 'orders', 'my orders', 'track', 'tracking', 'queue', 'status'] },
  { view: 'cart', label: 'Satchel', words: ['satchel', 'cart', 'basket', 'checkout'] },
]);

// search relatability
const SCORES = Object.freeze({
  name: { exact: 100, prefix: 70, fuzzy: 50 },
  other: { exact: 40, prefix: 25, fuzzy: 15 },
  phraseBonus: 50,
});

// singularize
export function singular(word) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// normalize input
export function normalizeWords(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular);
}

// search matching
export function queryWords(query) {
  return normalizeWords(query)
    .filter((word) => !STOP_WORDS.has(word))
    .flatMap((word) => SYNONYMS[word] || [word]);
}

// fuzzy search distance calculation
export function editDistance(a, b, limit = Infinity) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let beforePrevious = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      rowBest = Math.min(rowBest, current[j]);
    }
    if (rowBest > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

export const allowedTypos = (word) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

// return matchkind
function matchKind(queryWord, word) {
  if (word === queryWord) return 'exact';
  if (word.startsWith(queryWord)) return 'prefix';
  const typos = allowedTypos(queryWord);
  if (typos && editDistance(queryWord, word, typos) <= typos) return 'fuzzy';
  return null;
}

//searchable fields
function productFields(product) {
  return {
    name: normalizeWords(product.name),
    other: normalizeWords(`${product.groups.join(' ')} ${product.size} ${product.short} ${(product.specs || []).join(' ')}`),
  };
}

// find match
function bestMatch(queryWord, fields) {
  let best = { score: 0, nameWord: null };
  for (const field of ['name', 'other']) {
    for (const word of fields[field]) {
      const kind = matchKind(queryWord, word);
      if (!kind) continue;
      const score = SCORES[field][kind];
      if (score > best.score) best = { score, nameWord: field === 'name' ? word : best.nameWord };
    }
  }
  return best;
}

// product scores to query
export function scoreProduct(product, query) {
  const words = queryWords(query);
  if (!words.length) return { score: 0, matched: new Set() };
  const fields = productFields(product);
  const matched = new Set();
  let score = 0;
  for (const word of words) {
    const best = bestMatch(word, fields);
    if (!best.score) return { score: 0, matched: new Set() };
    score += best.score;
    if (best.nameWord) matched.add(best.nameWord);
  }
  if (fields.name.join(' ').includes(words.join(' '))) score += SCORES.phraseBonus;
  return { score, matched };
}

export function searchCatalog(products, query) {
  return products
    .map((product, index) => ({ product, index, ...scoreProduct(product, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export function pageForQuery(query) {
  const words = normalizeWords(query).filter((word) => !STOP_WORDS.has(word));
  const phrase = words.join(' ');
  if (!phrase) return null;
  for (const shortcut of PAGE_SHORTCUTS) {
    const keywords = new Set(shortcut.words.flatMap((w) => normalizeWords(w)).filter((word) => !STOP_WORDS.has(word)));
    if (words.every((word) => keywords.has(word))) return { view: shortcut.view, label: shortcut.label, exact: true };
  }
  if (phrase.length < 3) return null;
  for (const shortcut of PAGE_SHORTCUTS) {
    const keywords = shortcut.words.map((w) => normalizeWords(w).join(' '));
    if (keywords.some((keyword) => keyword.startsWith(phrase) || words.includes(keyword))) return { view: shortcut.view, label: shortcut.label, exact: false };
  }
  return null;
}

// search suggestions
export function suggestQuery(products, query) {
  const vocabulary = [...new Set(products.flatMap((p) => normalizeWords(`${p.name} ${p.groups.join(' ')}`)))];
  const words = normalizeWords(query).filter((word) => !STOP_WORDS.has(word));
  if (!words.length) return null;
  let changed = false;
  const fixed = words.map((word) => {
    if (vocabulary.includes(word)) return word;
    let best = null;
    let bestDistance = Math.max(2, Math.floor(word.length / 3)) + 1;
    for (const candidate of vocabulary) {
      const distance = editDistance(word, candidate, bestDistance - 1);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (!best) return word;
    changed = true;
    return best;
  });
  if (!changed) return null;
  const suggestion = fixed.join(' ');
  return searchCatalog(products, suggestion).length ? suggestion : null;
}

export const POPULAR_SEARCHES = Object.freeze(['sword', 'plate armor', 'chain mail', 'cauldron', 'commission']);
