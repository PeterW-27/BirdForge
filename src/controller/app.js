import { builtInCatalog } from '../data/catalog.js';
import { addProduct } from '../domain/products.js';
import { loadState, saveState, resetState, storageAvailable, STORAGE_KEY } from '../data/storage.js';
import { addSampleOrders } from '../data/samples.js';
import { makeState, changeQuantity, cartCount, totalCents, money, nextOrderId, placeCartOrder, placeDirectOrder, placeRepairOrder, updateStatus, setQuote, toggleTicket, restoreState, queueInfo, MIN_BULK, MAX_BULK } from '../domain/core.js';
import { pageForQuery } from '../domain/search.js';
import { header, footer, mobileNav, SMITH_VIEWS } from '../ui/components/site-shell.js';
import { productModal } from '../ui/components/product-modal.js';
import { shopPage } from '../ui/pages/shop.js';
import { cartPage } from '../ui/pages/cart.js';
import { ordersPage } from '../ui/pages/orders.js';
import { adminPage } from '../ui/pages/admin.js';
import { ticketsPage } from '../ui/pages/tickets.js';
import { repairsPage } from '../ui/pages/repairs.js';
import { featuresFor, getFeature } from '../extensions/registry.js';

const VIEWS = Object.freeze(['shop', 'cart', 'repairs', 'orders', 'admin', 'tickets']);
const VIEW_TITLES = Object.freeze({ shop: 'Shop', cart: 'Satchel', repairs: 'Repairs', orders: 'My Orders', admin: 'Forge Board', tickets: 'Work Tickets' });
const MAX_IMAGE_BYTES = 350000;
const IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const SAVE_FAILED = 'Gunter could not save this in your browser (storage is full or blocked). Nothing was changed. Try again without a photo.';

// initial setup when opening the webpage. Read stored data. 
export function mountApp(documentRoot = document) {
  const main = documentRoot.getElementById('main');
  const modalRoot = documentRoot.getElementById('modal-root');
  const toastRoot = documentRoot.getElementById('toast-root');
  documentRoot.getElementById('shell-header').innerHTML = header();
  documentRoot.getElementById('shell-footer').innerHTML = footer();
  documentRoot.getElementById('shell-mobile-nav').innerHTML = mobileNav();
  const searchBox = () => documentRoot.getElementById('search');

  const persistent = storageAvailable();
  let state = loadState(builtInCatalog);
  let catalog = [...builtInCatalog, ...state.addedProducts];
  const ui = { view: 'shop', search: '', category: 'All', savedOnly: false, sort: 'featured', adminTab: 'orders', adminFilter: 'All', lastOrder: null, recycle: false, recycleDetails: '' };
  let activeModal = null;
  let returnFocus = null;
  let toastTimer = null;

  function notice(message) {
    toastRoot.textContent = message;
    toastRoot.classList.add('toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastRoot.textContent = '';
      toastRoot.classList.remove('toast-visible');
    }, 3500);
  }

  function commit(next) {
    const restored = restoreState(next, builtInCatalog);
    if (persistent && !saveState(restored)) {
      notice(SAVE_FAILED);
      return false;
    }
    state = restored;
    catalog = [...builtInCatalog, ...state.addedProducts];
    render();
    return true;
  }

  function storageBanner() {
    if (persistent) return '';
    return '<p class="storage-banner" role="status">This browser is not saving data, so orders will disappear when you close the page.</p>';
  }

  function render() {
    const pages = {
      shop: () => shopPage(state, ui, featuresFor('shop'), catalog),
      cart: () => cartPage(state, ui, catalog),
      orders: () => ordersPage(state, ui.lastOrder),
      repairs: () => repairsPage(),
      admin: () => adminPage(state, ui, featuresFor('admin'), catalog),
      tickets: () => ticketsPage(state),
    };
    main.innerHTML = storageBanner() + (pages[ui.view] || pages.shop)();
    const count = cartCount(catalog, state);
    documentRoot.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
    });
    documentRoot.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === ui.view && !button.classList.contains('role-switch');
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const role = SMITH_VIEWS.includes(ui.view) ? 'smith' : 'customer';
    documentRoot.body.dataset.role = role;
    documentRoot.querySelectorAll('[data-nav-role]').forEach((group) => {
      group.hidden = group.dataset.navRole !== role;
    });
    const search = searchBox();
    search.closest('.search-field').hidden = role === 'smith';
    if (search.value !== ui.search) search.value = ui.search;
    documentRoot.title = `${VIEW_TITLES[ui.view] || 'Shop'} · Gunter's Forge`;
  }

  // clear popup filled forms and write changes in cart.
  function closeModal() {
    if (!activeModal) return;
    activeModal = null;
    modalRoot.innerHTML = '';
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  function navigate(view) {
    if (!VIEWS.includes(view)) return;
    closeModal();
    ui.view = view;
    if (view !== 'orders') ui.lastOrder = null;
    if (view !== 'shop') ui.search = '';
    render();
    globalThis.scrollTo?.({ top: 0, behavior: 'instant' });
  }

  function openModal(id, mode = 'detail') {
    const product = catalog.find((item) => item.id === id);
    if (!product) return;
    if (!activeModal) returnFocus = documentRoot.activeElement;
    activeModal = { id, mode };
    modalRoot.innerHTML = productModal(product, state.cart[id] || 0, mode);
    modalRoot.querySelector('.modal-close')?.focus();
  }

  function changeCart(id, qty) {
    const result = changeQuantity(catalog, state, id, qty);
    if (result.error) {
      notice(result.error);
      return;
    }
    if (!commit(result.state)) return;
    if (activeModal?.mode === 'detail') openModal(activeModal.id, 'detail');
  }

  function showFormError(form, message) {
    const box = form?.querySelector('.form-error');
    if (box) {
      box.textContent = message;
      box.hidden = false;
    }
    notice(message);
  }

  function clearFormError(form) {
    const box = form?.querySelector('.form-error');
    if (box) {
      box.textContent = '';
      box.hidden = true;
    }
  }

  // verify order detail and jump to order page after filling form. 
  function finishOrder(result, form) {
    if (result.error) {
      showFormError(form, result.error);
      return;
    }
    if (!commit(result.state)) {
      showFormError(form, SAVE_FAILED);
      return;
    }
    if (result.order.type === 'standard') {
      ui.recycle = false;
      ui.recycleDetails = '';
    }
    navigate('orders');
    ui.lastOrder = result.order.id;
    render();
    const info = queueInfo(state, result.order.id);
    notice(info?.stage === 'queued' ? `Order ${result.order.id} sent. You are #${info.position} in line.` : `Request ${result.order.id} sent to Gunter.`);
  }

  function submitCart(form) {
    clearFormError(form);
    const data = { ...Object.fromEntries(new FormData(form).entries()), recycle: ui.recycle ? 'yes' : 'no', recycleDetails: ui.recycle ? ui.recycleDetails : '' };
    finishOrder(placeCartOrder(catalog, state, data, nextOrderId(state.orders), new Date().toISOString()), form);
  }

  async function readImage(file) {
    if (!file || !file.size) return null;
    if (!IMAGE_TYPES.includes(file.type)) throw Error('The photo must be a PNG, JPG or WebP image.');
    if (file.size > MAX_IMAGE_BYTES) throw Error('The photo must be smaller than 350 KB.');
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('Could not read the photo. Try another file.'));
      reader.readAsDataURL(file);
    });
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(encoded)) throw Error('Unsupported image data.');
    return encoded;
  }

  async function submitWithImage(form, placeOrder) {
    const button = form.querySelector('button[type="submit"]');
    if (button?.disabled) return;
    clearFormError(form);
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    try {
      const image = await readImage(data.reference);
      finishOrder(placeOrder(data, image), form);
    } catch (error) {
      showFormError(form, error.message || 'Unable to send the photo.');
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  // read and store uploaded image.
  function submitDirect(form) {
    return submitWithImage(form, (data, image) => {
      data.recycle = 'no';
      return placeDirectOrder(catalog, state, form.dataset.id, form.dataset.mode, data, nextOrderId(state.orders), new Date().toISOString(), image);
    });
  }

  function submitRepair(form) {
    return submitWithImage(form, (data, image) => placeRepairOrder(state, data, nextOrderId(state.orders), new Date().toISOString(), image));
  }

  async function submitProduct(form) {
    const button = form.querySelector('button[type="submit"]');
    if (button?.disabled) return;
    clearFormError(form);
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    try {
      const image = await readImage(data.image);
      const result = addProduct(state, data, image);
      if (result.error) {
        showFormError(form, result.error);
        return;
      }
      if (commit(result.state)) notice('Product added.');
      else showFormError(form, SAVE_FAILED);
    } catch (error) {
      showFormError(form, error.message || 'Unable to read the image.');
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  function submitQuote(form) {
    const result = setQuote(state, form.dataset.id, new FormData(form).get('quote'));
    if (result.error) {
      notice(result.error);
      return;
    }
    if (commit(result.state)) notice(`Quote saved for ${form.dataset.id}. The customer can see it under My Orders.`);
  }

  // price calculation, (price might change later). 
  function updateEstimates() {
    const subtotal = totalCents(catalog, state);
    const cartTotal = documentRoot.getElementById('cart-estimate');
    if (cartTotal) cartTotal.textContent = money(subtotal);

    const preview = documentRoot.getElementById('direct-estimate');
    const form = documentRoot.getElementById('direct-order');
    if (!preview || !form) return;
    const product = catalog.find((p) => p.id === form.dataset.id);
    const qty = Number(form.querySelector('[name="qty"]')?.value);
    preview.textContent = Number.isSafeInteger(qty) && qty >= MIN_BULK && qty <= MAX_BULK
      ? `Estimated total: ${money(product.priceCents * qty)}`
      : `Enter a whole number from ${MIN_BULK} to ${MAX_BULK}.`;
  }

  function showResults() {
    globalThis.scrollTo?.({ top: 0, behavior: 'instant' });
    const heading = documentRoot.getElementById('results-heading');
    if (heading) heading.focus({ preventScroll: true });
    else searchBox().blur();
  }

  function submitSearch() {
    const query = searchBox().value.trim();
    ui.search = searchBox().value;
    if (!query) return;
    const page = pageForQuery(query);
    if (page?.exact) {
      navigate(page.view);
      searchBox().blur();
      notice(`Opened ${page.label}.`);
      return;
    }
    if (ui.view !== 'shop') {
      closeModal();
      ui.view = 'shop';
    }
    render();
    showResults();
  }

  function searchFor(query) {
    ui.search = query;
    ui.view = 'shop';
    render();
    showResults();
  }

  function resetDemo() {
    if (globalThis.confirm && !globalThis.confirm('Clear all orders, the satchel and saved items in this browser?')) return;
    resetState();
    state = makeState();
    catalog = [...builtInCatalog];
    if (persistent) saveState(state);
    Object.assign(ui, { lastOrder: null, recycle: false, recycleDetails: '', savedOnly: false });
    render();
    notice('Demo data cleared.');
  }

  function handleAction(action, id, button, event) {
    switch (action) {
      case 'backdrop':
        if (event.target === button) closeModal();
        return;
      case 'close':
        closeModal();
        return;
      case 'browse':
        documentRoot.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
        return;
      case 'shop':
        navigate('shop');
        return;
      case 'clear-filters':
        Object.assign(ui, { category: 'All', savedOnly: false, sort: 'featured', search: '' });
        render();
        return;
      case 'clear-filters-keep-search':
        Object.assign(ui, { category: 'All', savedOnly: false });
        render();
        return;
      case 'clear-search':
        ui.search = '';
        render();
        searchBox().focus();
        return;
      case 'search-suggest':
        searchFor(id);
        return;
      case 'filter':
        Object.assign(ui, { category: id, savedOnly: false });
        render();
        return;
      case 'saved-filter':
        Object.assign(ui, { savedOnly: !ui.savedOnly, category: 'All' });
        render();
        return;
      case 'favorite': {
        if (catalog.find((p) => p.id === id)?.type !== 'standard') return;
        const favorites = state.favorites.includes(id) ? state.favorites.filter((item) => item !== id) : [...state.favorites, id];
        commit({ ...state, favorites });
        return;
      }
      case 'detail':
        openModal(id);
        return;
      case 'commission':
        openModal(id, 'custom');
        return;
      case 'bulk':
        if (catalog.find((product) => product.id === id)?.type === 'custom') {
          notice('Bulk orders are not available for custom commissions.');
          return;
        }
        openModal(id, 'bulk');
        return;
      case 'increase':
      case 'decrease':
        changeCart(id, (state.cart[id] || 0) + (action === 'increase' ? 1 : -1));
        return;
      case 'remove':
        changeCart(id, 0);
        return;
      case 'admin-tab':
        ui.adminTab = id;
        render();
        return;
      case 'ticket-complete': {
        const result = toggleTicket(state, id);
        if (result.error) {
          notice(result.error);
          return;
        }
        if (commit(result.state)) notice(result.advanced ? 'Order finished. Status changed to Delivering.' : 'Item finished. The rest of this order stays on the list.');
        return;
      }
      case 'add-samples':
        if (commit(addSampleOrders(catalog, state))) notice('3 sample orders added to the work list.');
        return;
      case 'reset-demo':
        resetDemo();
        return;
      default: {
        const feature = getFeature(button.closest('[data-extension]')?.dataset.extension);
        if (!feature?.onAction) return;
        try {
          feature.onAction(action, id, { state: structuredClone(state), updateState: commit, notify: notice, render });
        } catch {
          notice('Extension action failed.');
        }
      }
    }
  }

  // handling CLICK/CHANGE/SUBMIT/INPUT events. 
  documentRoot.addEventListener('click', (event) => {
    const view = event.target.closest('[data-view]');
    if (view) {
      event.preventDefault();
      navigate(view.dataset.view);
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button || button.tagName === 'SELECT') return;
    handleAction(button.dataset.action, button.dataset.id, button, event);
  });

  documentRoot.addEventListener('change', (event) => {
    const el = event.target;
    if (el.matches('#recycle-panel input[name="recycle"]')) {
      ui.recycle = el.checked;
      const extra = documentRoot.querySelector('#recycle-panel .recycle-extra');
      if (extra) extra.hidden = !el.checked;
      updateEstimates();
      return;
    }
    if (el.id === 'sort') {
      ui.sort = el.value;
      render();
      return;
    }
    if (el.id === 'admin-filter') {
      ui.adminFilter = el.value;
      render();
      return;
    }
    if (el.matches('select[data-action="status"]')) {
      const result = updateStatus(state, el.dataset.id, el.value);
      if (result.error) {
        notice(result.error);
        return;
      }
      if (commit(result.state)) notice(`${el.dataset.id} is now ${el.value}.`);
    }
  });

  documentRoot.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.id === 'search-form') {
      event.preventDefault();
      submitSearch();
      return;
    }
    const handlers = { checkout: submitCart, 'direct-order': submitDirect, 'repair-order': submitRepair, 'add-product': submitProduct };
    if (handlers[form.id]) {
      event.preventDefault();
      handlers[form.id](form);
      return;
    }
    if (form.classList.contains('quote-form')) {
      event.preventDefault();
      submitQuote(form);
    }
  });

  documentRoot.addEventListener('input', (event) => {
    const el = event.target;
    if (el.matches('#recycle-panel [name="recycleDetails"]')) ui.recycleDetails = el.value;
    if (el.matches('#direct-order [name="qty"]')) updateEstimates();
    if (el.id === 'search') {
      const wasEmpty = !ui.search.trim();
      ui.search = el.value;
      if (SMITH_VIEWS.includes(ui.view)) return;
      if (ui.view !== 'shop' && !el.value.trim()) return;
      if (ui.view !== 'shop') {
        closeModal();
        ui.view = 'shop';
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      render();
      searchBox().focus();
      if (start !== null && end !== null) searchBox().setSelectionRange(start, end);
      if (wasEmpty && el.value.trim()) globalThis.scrollTo?.({ top: 0, behavior: 'instant' });
    }
  });

  // keyboard controls. 
  documentRoot.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target.id === 'search' && ui.search) {
      ui.search = '';
      render();
      return;
    }
    if (event.key === 'Escape') closeModal();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      navigate('shop');
      searchBox().focus();
    }
    if (event.key === 'Tab' && activeModal) {
      const controls = [...modalRoot.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) return;
      if (event.shiftKey && documentRoot.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRoot.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  globalThis.addEventListener?.('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const typing = documentRoot.activeElement?.closest?.('form');
    state = loadState(builtInCatalog);
    catalog = [...builtInCatalog, ...state.addedProducts];
    if (typing) return;
    render();
    if (activeModal?.mode === 'detail') openModal(activeModal.id, 'detail');
  });

  documentRoot.getElementById('brand').addEventListener('click', (event) => {
    event.preventDefault();
    ui.search = '';
    navigate('shop');
  });

  render();
  if (!persistent) notice('This browser is not saving data. Orders will disappear when you close the page.');

  return {
    getState: () => structuredClone(state),
    getUI: () => ({ ...ui }),
    navigate,
    render,
    reset: () => {
      resetState();
      state = loadState(builtInCatalog);
      catalog = [...builtInCatalog, ...state.addedProducts];
      render();
    },
  };
}
