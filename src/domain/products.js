import { groups } from '../data/catalog.js';
import { PRICE_ERROR } from './prices.js';

const maxImageLength = 510000;
const imagePattern = /^data:image\/(?:png|jpeg|webp);base64,/;

// validate restored added product
export function validAddedProduct(product) {
  return product && typeof product === 'object'
    && /^product-\d+$/.test(product.id)
    && product.type === 'standard'
    && typeof product.name === 'string' && product.name.length >= 2 && product.name.length <= 120
    && groups.includes(product.group)
    && Array.isArray(product.groups) && product.groups.length === 1 && product.groups[0] === product.group
    && Number.isSafeInteger(product.priceCents) && product.priceCents > 0 && product.priceCents <= 10000000
    && typeof product.size === 'string' && product.size.length <= 80
    && typeof product.short === 'string' && product.short.length <= 240
    && typeof product.details === 'string' && product.details.length <= 1600
    && Array.isArray(product.specs) && product.specs.length <= 12
    && product.specs.every((spec) => typeof spec === 'string' && spec.length <= 120)
    && (product.image === '' || (typeof product.image === 'string' && imagePattern.test(product.image) && product.image.length <= maxImageLength));
}

// set up list of added products
export function addProduct(state, input, image = null) {
  const name = String(input.name ?? '').trim();
  const group = String(input.group ?? '');
  const value = String(input.price ?? '').trim();
  const size = String(input.size ?? '').trim();
  const short = String(input.short ?? '').trim();
  const details = String(input.details ?? '').trim();
  const specs = String(input.specs ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (name.length < 2 || name.length > 120) return { error: 'Name must contain 2–120 characters.' };
  if (!groups.includes(group)) return { error: 'Select a category.' };
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(value)) return { error: PRICE_ERROR };
  const [whole, fraction = ''] = value.split('.');
  const priceCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (priceCents < 1 || priceCents > 10000000) return { error: PRICE_ERROR };
  if (size.length > 80 || short.length > 240 || details.length > 1600 || specs.length > 12 || specs.some((spec) => spec.length > 120)) return { error: 'Product fields exceed their limits.' };
  const ids = (state.addedProducts || []).map((product) => Number(product.id.slice(8))).filter(Number.isFinite);
  const id = `product-${Math.max(0, ...ids) + 1}`;
  const product = { id, name, group, groups: [group], priceCents, size, short, details, specs, image: image || '', type: 'standard' };
  if (!validAddedProduct(product)) return { error: 'Invalid product data.' };
  if ((state.addedProducts || []).length >= 100) return { error: 'Product limit reached.' };
  return { product, state: { ...state, addedProducts: [...(state.addedProducts || []), product] } };
}

// example added product
export const EXAMPLE_PRODUCT = Object.freeze({
  name: 'Training Sword',
  group: 'Sword',
  price: '42.00',
  size: '80 cm blunt blade',
  short: 'A blunt practice blade for squires and town guards.',
  details: 'Forged with a rounded tip and dulled edges so new fighters can practise safely in the castle yard.',
  specs: 'Blunt edges\nRounded tip\nAsh wood grip',
});

export function productInUse(state, id) {
  return (state.orders || []).some((order) => order.items.some((line) => line.id === id));
}

// remove product not in use
export function removeProduct(state, id) {
  const added = state.addedProducts || [];
  const product = added.find((item) => item.id === id);
  if (!product) return { error: 'Only products added on the Forge Board can be removed.' };
  if (productInUse(state, id)) return { error: `${product.name} is part of an order, so it cannot be removed.` };
  const cart = { ...state.cart };
  delete cart[id];
  return {
    product,
    state: { ...state, addedProducts: added.filter((item) => item.id !== id), cart, favorites: (state.favorites || []).filter((item) => item !== id) },
  };
}
