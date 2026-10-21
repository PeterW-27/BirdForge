import { dailyPrices, mineDate } from '../domain/mining.js';
import { CARDS } from '../domain/raid.js';
import { redeemCredit } from '../domain/materials.js';
import { creditCheckbox } from '../ui/components/checkout-form.js';
import { minePage } from '../ui/pages/mine.js';
import { createBackup, parseBackup, MAX_BACKUP_BYTES } from '../domain/backup.js';
import { captureUpdates } from '../domain/orb.js';
import { mountOrb } from '../ui/components/orb.js';
import { builtInCatalog } from '../data/catalog.js';
import { addProduct, removeProduct, EXAMPLE_PRODUCT } from '../domain/products.js';
import { loadState, saveState, resetState, storageAvailable, STORAGE_KEY } from '../data/storage.js';
import { addSampleOrders } from '../data/samples.js';
import { makeState, changeQuantity, cartCount, totalCents, money, escapeHTML, nextOrderId, placeCartOrder, placeDirectOrder, placeRepairOrder, updateStatus, setQuote, toggleTicket, restoreState, queueInfo, MIN_BULK, MAX_BULK } from '../domain/core.js';
import { pageForQuery } from '../domain/search.js';
import { header, footer, mobileNav, CUSTOMER_VIEWS, SMITH_VIEWS } from '../ui/components/site-shell.js';
import { productModal, referenceModal } from '../ui/components/product-modal.js';
import { shopPage } from '../ui/pages/shop.js';
import { cartPage } from '../ui/pages/cart.js';
import { ordersPage } from '../ui/pages/orders.js';
import { adminPage, productPreview } from '../ui/pages/admin.js';
import { ticketsPage } from '../ui/pages/tickets.js';
import { repairsPage } from '../ui/pages/repairs.js';
import { featuresFor, getFeature } from '../extensions/registry.js';
import { businessReport, reportCsv } from '../domain/reports.js';
import { createSync, loadLocal, saveLocal } from '../data/sync.js';

const VIEW_TITLES = Object.freeze({ shop: 'Shop', cart: 'Satchel', mine: 'Mine', repairs: 'Repairs', orders: 'My Orders', admin: 'Forge Board', tickets: 'Work Tickets' });
const MAX_IMAGE_BYTES = 350000;
const IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const SAVE_FAILED = 'Gunter could not save this in your browser (storage is full or blocked). Nothing was changed. Try again without a photo.';

// opening the webpage and read data stored
export function mountApp(documentRoot = document, { app = 'customer' } = {}) {
  const side = ['smith', 'all'].includes(app) ? app : 'customer';
  const views = side === 'smith' ? SMITH_VIEWS : side === 'all' ? [...CUSTOMER_VIEWS, ...SMITH_VIEWS] : CUSTOMER_VIEWS;
  const sync = documentRoot.body.dataset.sync === 'server' ? createSync({ onShared: (shared) => acceptShared(shared), onStatus: (isOnline) => { online = isOnline; render(); } }) : null;
  const otherApp = side === 'all' ? null : documentRoot.body.dataset.otherApp || (sync ? null : (side === 'smith' ? 'index.html' : 'forge.html'));
  const main = documentRoot.getElementById('main');
  const modalRoot = documentRoot.getElementById('modal-root');
  const toastRoot = documentRoot.getElementById('toast-root');
  documentRoot.getElementById('shell-header').innerHTML = header(side);
  documentRoot.getElementById('shell-footer').innerHTML = footer(side, Boolean(otherApp), Boolean(sync));
  documentRoot.getElementById('shell-mobile-nav').innerHTML = mobileNav(side);
  if (sync) documentRoot.querySelector('.header-inner')?.insertAdjacentHTML('beforeend', '<span class="live-pill" data-live role="status">Live</span>');
  const searchBox = () => documentRoot.getElementById('search');

  const persistent = storageAvailable();
  const local = sync ? loadLocal() : null;
  let state = sync ? restoreState({ ...makeState(), cart: local.cart, favorites: local.favorites }, builtInCatalog) : loadState(builtInCatalog);
  let online = true;
  let catalog = [...builtInCatalog, ...state.addedProducts];
  const ui = { view: views[0], search: '', category: 'All', savedOnly: false, sort: 'featured', adminTab: 'orders', adminFilter: 'All', showDelivered: false, productFormOpen: false, lastOrder: null, recycle: false, recycleDetails: '', reportRange: '7d', reportFrom: '', reportTo: '' };
  let raidView = null;
  let raidSelection = null;
  let raidKey = '';
  let raidPending = false;
  let raidReveal = false;
  let raidEventKey = '';
  let backupRead = 0;
  let savingBackup = false;
  let activeModal = null;
  let returnFocus = null;
  let toastTimer = null;
  let shownCartCount = null;
  let previewImageUrl = null;
  let messenger = null;

  function notice(message) {
    toastRoot.textContent = message;
    toastRoot.classList.add('toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastRoot.textContent = '';
      toastRoot.classList.remove('toast-visible');
    }, 3500);
  }

  // save and render
  function commit(next, failureMessage = SAVE_FAILED, capture = true, beforeRender = null) {
    if (sync) {
      state = restoreState(next, builtInCatalog);
      catalog = [...builtInCatalog, ...state.addedProducts];
      keepLocal();
      beforeRender?.();
      render();
      return true;
    }
    const restored = restoreState(capture ? captureUpdates(state, next) : next, builtInCatalog);
    if (persistent && !saveState(restored)) {
      notice(failureMessage);
      return false;
    }
    state = restored;
    catalog = [...builtInCatalog, ...state.addedProducts];
    beforeRender?.();
    render();
    return true;
  }

  function keepLocal() {
    const shown = (state.orb?.messages || []).filter((m) => m.shown).map((m) => m.id);
    Object.assign(local, { cart: state.cart, favorites: state.favorites, shown: [...new Set([...local.shown, ...shown])].slice(-500), sessions: state.orb?.sessions || [], lastOpenedAt: state.orb?.lastOpenedAt || null });
    saveLocal(local);
  }

  function acceptShared(shared, force = false) {
    const shown = new Set(local.shown);
    const orb = shared.orb ? { messages: shared.orb.messages.map((m) => ({ ...m, shown: m.kind === 'customer' || shown.has(m.id) })), sessions: local.sessions, lastOpenedAt: local.lastOpenedAt } : undefined;
    state = restoreState({ ...shared, cart: state.cart, favorites: state.favorites, orb }, builtInCatalog);
    catalog = [...builtInCatalog, ...state.addedProducts];
    const previousTurn = raidView?.turn;
    raidView = shared.raidView ?? null;
    const nextKey = raidView ? `${raidView.id}:${raidView.turn}:${raidView.phase}` : '';
    if (raidKey !== nextKey) {
      raidSelection = null;
      raidKey = nextKey;
      if (side === 'customer' && raidView?.turn !== previousTurn && previousTurn !== undefined) globalThis.navigator?.vibrate?.(80);
    }
    ui.raidView = raidView;
    ui.raidOnline = Boolean(sync);
    if (!force && documentRoot.activeElement?.closest?.('form:not([data-orb-form])')) {
      const taken = new Set(raidView?.players.map((p) => p.color));
      documentRoot.querySelectorAll('#raid-join [name="color"]').forEach((input) => {
        input.disabled = taken.has(input.value);
        if (input.disabled) input.checked = false;
      });
      const join = documentRoot.querySelector('#raid-join button[type="submit"]');
      if (join) join.disabled = raidView?.phase !== 'lobby';
      messenger?.render();
      return;
    }
    render();
    if (activeModal?.mode === 'detail') openModal(activeModal.id, 'detail');
  }

  function act(action, onDone, onError = notice) {
    sync.send(action).then((reply) => {
      if (reply.error) {
        onError(reply.error);
        if (reply.shared) acceptShared(reply.shared);
        return;
      }
      acceptShared(reply.shared, true);
      onDone?.(reply.result || {});
    });
  }

  function saveOrbRemote(nextOrb) {
    const before = new Map((state.orb?.messages || []).map((m) => [m.id, m]));
    const added = nextOrb.messages.filter((m) => !before.has(m.id));
    const read = nextOrb.messages.filter((m) => m.read && before.has(m.id) && !before.get(m.id).read).map((m) => m.id);
    commit({ ...state, orb: nextOrb });
    const failed = (message) => { notice(message); messenger?.render(); };
    for (const m of added) act({ type: 'message.send', text: m.text, orderId: m.orderId, owner: m.owner }, null, failed);
    if (read.length) act({ type: 'message.read', ids: read }, null, () => {});
    return true;
  }

  const withoutFiles = (data) => Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === 'string'));

  function storageBanner() {
    if (sync && !online) return '<p class="storage-banner" role="status">Connection to the forge was lost. Reconnecting…</p>';
    if (persistent) return '';
    return '<p class="storage-banner" role="status">This browser is not saving data, so orders will disappear when you close the page.</p>';
  }

  // set previewImageUrl null
  function releasePreviewImage() {
    if (previewImageUrl) globalThis.URL?.revokeObjectURL?.(previewImageUrl);
    previewImageUrl = null;
  }

  function render() {
    releasePreviewImage();
    const pages = {
      shop: () => shopPage(state, ui, featuresFor('shop'), catalog),
      cart: () => cartPage(state, ui, catalog),
      orders: () => ordersPage(state, ui.lastOrder),
      repairs: () => repairsPage(),
      mine: () => minePage(state, raidView, dailyPrices(mineDate()), { online: Boolean(sync), selected: raidSelection }),
      admin: () => adminPage(state, ui, featuresFor('admin'), catalog),
      tickets: () => ticketsPage(state),
    };
    main.innerHTML = storageBanner() + (pages[ui.view] || pages.shop)();
    const count = cartCount(catalog, state);
    const grew = shownCartCount !== null && count > shownCartCount;
    shownCartCount = count;
    documentRoot.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
      if (grew) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    });
    documentRoot.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === ui.view && !button.classList.contains('role-switch');
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const role = side === 'all' ? (SMITH_VIEWS.includes(ui.view) ? 'smith' : 'customer') : side;
    documentRoot.body.dataset.role = role;
    documentRoot.querySelectorAll('[data-nav-role]').forEach((group) => {
      group.hidden = group.dataset.navRole !== role;
    });
    const search = searchBox();
    search.closest('.search-field').hidden = role === 'smith';
    if (search.value !== ui.search) search.value = ui.search;
    documentRoot.title = `${VIEW_TITLES[ui.view] || 'Shop'} · Birdforge`;
    messenger?.render();
    paintRaid();
    const live = documentRoot.querySelector('[data-live]');
    if (live) {
      live.textContent = online ? 'Live' : 'Offline';
      live.classList.toggle('is-offline', !online);
    }
  }

  function raidAction(action) {
    if (!sync) { notice('The mine needs the online shop.'); return; }
    if (raidPending) return;
    raidPending = true;
    const stamp = raidView && action.type !== 'raid.open' ? { raidId: raidView.id, phase: raidView.phase, turn: raidView.turn } : {};
    sync.send({ ...stamp, ...action }).then((reply) => {
      if (reply.shared) acceptShared(reply.shared, true);
      if (reply.error) notice(reply.error);
    }).finally(() => { raidPending = false; });
  }

  function paintRaid() {
    if (!sync || !raidView) return;
    const now = Date.now();
    const until = Date.parse(raidView.revealUntil) || 0;
    const clock = documentRoot.querySelector('[data-raid-clock]');
    if (clock && raidView.deadline) {
      const remaining = Math.max(0, Math.ceil((Date.parse(raidView.deadline) - Math.max(now, until)) / 1000));
      clock.textContent = remaining;
      clock.style.setProperty('--remaining', remaining / (raidView.phase === 'play' ? 30 : 15));
    }
    const stage = documentRoot.querySelector('#raid-stage');
    if (!stage) return;
    stage.classList.remove('is-shaking');
    stage.querySelectorAll('.is-acting,.is-blocking,.is-healing').forEach((el) => el.classList.remove('is-acting', 'is-blocking', 'is-healing'));
    stage.querySelectorAll('[data-raid-enemy-float],[data-raid-ore-flight]').forEach((el) => { el.textContent = ''; el.classList.remove('is-flying'); });
    stage.querySelectorAll('[data-raid-float]').forEach((el) => { el.textContent = ''; });
    const enemy = stage.querySelector('[data-raid-enemy]');
    enemy?.classList.remove('is-hit', 'is-attacking', 'is-down');
    stage.querySelector('[data-raid-pot]')?.classList.remove('is-gaining');
    const box = stage.querySelector('[data-raid-event]');
    if (box) box.textContent = '';
    const events = raidView.lastEvents;
    const index = Math.floor((now - (until - events.length * 700)) / 700);
    const event = now < until ? events[index] : null;
    if (!event) return;
    const person = (id) => raidView.players.find((p) => p.id === id)?.name || 'Crew';
    const player = stage.querySelector(`[data-miner="${event.player}"]`);
    const actor = stage.querySelector(`[data-miner="${event.source || event.player}"]`);
    const float = player?.querySelector('[data-raid-float]');
    if (actor) { void actor.offsetWidth; actor.classList.add('is-acting'); }
    if (event.card && box) box.textContent = `${person(event.source || event.player)} · ${CARDS[event.card]?.name || 'Card'}`;
    if (float && event.card) float.textContent = CARDS[event.card]?.name || '';
    if (event.type === 'attack') {
      enemy?.classList.add('is-hit');
      const damage = enemy?.querySelector('[data-raid-enemy-float]');
      if (damage) damage.textContent = `−${event.damage}`;
      if (box) box.textContent += ` · ${event.damage} damage${event.blocked ? ` (${event.blocked} armor)` : ''}`;
    }
    if (event.type === 'block') { player?.classList.add('is-blocking'); if (float) float.textContent = `+${event.amount} Block`; }
    if (event.type === 'heal') { player?.classList.add('is-healing'); if (float) float.textContent = `+${event.amount} HP`; }
    if (event.type === 'enemy') {
      enemy?.classList.add('is-attacking');
      stage.classList.add('is-shaking');
      if (box) box.textContent = event.intent;
      for (const t of event.targets) {
        const target = stage.querySelector(`[data-miner="${t.player}"]`);
        const label = target?.querySelector('[data-raid-float]');
        if (label) label.textContent = `−${t.damage} HP · ${t.blocked} blocked`;
        target?.classList.add('is-acting');
      }
    }
    if (event.type === 'selfDamage' && float) float.textContent = `−${event.damage} HP`;
    if (event.type === 'ko' && box) box.textContent = `${person(event.player)} is knocked out!`;
    if (event.type === 'enemyDown') { enemy?.classList.add('is-down'); if (box) box.textContent = 'Enemy defeated!'; }
    if (event.type === 'ore') {
      stage.querySelector('[data-raid-pot]')?.classList.add('is-gaining');
      const ore = stage.querySelector('[data-raid-ore-flight]');
      if (ore) { ore.textContent = '◆ ◆ ◆'; void ore.offsetWidth; ore.classList.add('is-flying'); }
      if (box) box.textContent = `Ore flies into the pot · ${Object.entries(event.haul).map(([ore, qty]) => `${qty} ${ore}`).join(', ')}`;
    }
    if (event.type === 'floor' && box) box.textContent = event.floor === 5 ? 'The Ore Wyrm awakens' : `Entering floor ${event.floor}`;
  }

  function raidTick() {
    if (!raidView || (ui.view !== 'mine' && !(ui.view === 'admin' && ui.adminTab === 'raid'))) return;
    const now = Date.now();
    const until = Date.parse(raidView.revealUntil) || 0;
    const revealing = now < until;
    const key = `${raidView.id}:${raidView.turn}:${Math.floor((now - until) / 700)}`;
    if (revealing !== raidReveal) {
      raidReveal = revealing;
      render();
    } else if (key !== raidEventKey && ui.view === 'admin') paintRaid();
    else {
      const clock = documentRoot.querySelector('[data-raid-clock]');
      if (clock && raidView.deadline) {
        const remaining = Math.max(0, Math.ceil((Date.parse(raidView.deadline) - Math.max(now, until)) / 1000));
        clock.textContent = remaining;
        clock.style.setProperty('--remaining', remaining / (raidView.phase === 'play' ? 30 : 15));
      }
    }
    raidEventKey = key;
    if (ui.view === 'admin' && ui.adminTab === 'raid' && side === 'smith' && online && raidView.deadline && now >= Date.parse(raidView.deadline)) raidAction({ type: 'raid.resolve' });
  }


  // clear popup forms
  function closeModal() {
    if (!activeModal) return;
    activeModal = null;
    modalRoot.innerHTML = '';
    documentRoot.body.classList.remove('has-modal');
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  // navigate and scroll to top
  function navigate(view) {
    if (!views.includes(view)) return;
    closeModal();
    if (SMITH_VIEWS.includes(ui.view) && !SMITH_VIEWS.includes(view)) {
      clearTimeout(toastTimer);
      toastRoot.textContent = '';
      toastRoot.classList.remove('toast-visible');
    }
    ui.view = view;
    if (view !== 'orders') ui.lastOrder = null;
    if (view !== 'shop') ui.search = '';
    render();
    globalThis.scrollTo?.({ top: 0, behavior: 'instant' });
  }

  // open good detail page
  function openModal(id, mode = 'detail') {
    const product = catalog.find((item) => item.id === id);
    if (!product) return;
    if (!activeModal) returnFocus = documentRoot.activeElement;
    activeModal = { id, mode };
    modalRoot.innerHTML = productModal(product, state.cart[id] || 0, mode, state);
    documentRoot.body.classList.add('has-modal');
    modalRoot.querySelector('.modal-close')?.focus();
  }

  // view reference image
  function openReference(orderId) {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order?.referenceImage) return;
    if (!activeModal) returnFocus = documentRoot.activeElement;
    activeModal = { id: orderId, mode: 'image' };
    modalRoot.innerHTML = referenceModal(order);
    documentRoot.body.classList.add('has-modal');
    modalRoot.querySelector('.modal-close')?.focus();
  }

  // change item quantity on shop page
  function changeCart(id, qty) {
    const before = state.cart[id] || 0;
    const result = changeQuantity(catalog, state, id, qty);
    if (result.error) {
      notice(result.error);
      return;
    }
    if (!commit(result.state)) return;
    if (activeModal?.mode === 'detail') openModal(activeModal.id, 'detail');
    if (before === 0 && qty > 0) notice(`${catalog.find((p) => p.id === id)?.name || 'Item'} added to your satchel.`);
  }

  // show and clear form and field errors
  function fieldErrorFor(control) {
    return control.closest('label')?.querySelector('.field-error') || null;
  }

  function setFieldError(control, message) {
    control.setAttribute('aria-invalid', 'true');
    let box = fieldErrorFor(control);
    if (!box) {
      box = documentRoot.createElement('span');
      box.className = 'field-error';
      box.id = `${control.form?.id || control.form?.dataset.id || 'form'}-${control.name}-error`;
      (control.closest('label') || control.parentElement).append(box);
      control.setAttribute('aria-describedby', box.id);
    }
    box.textContent = message;
  }

  function clearFieldError(control) {
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
    fieldErrorFor(control)?.remove();
  }

  function clearFormErrors(form) {
    form.querySelectorAll('[aria-invalid]').forEach(clearFieldError);
    clearFormError(form);
  }

  function firstInvalidControl(form) {
    return [...form.elements].find((el) => el.willValidate && !el.validity.valid) || null;
  }

  function showFormError(form, message, control = null) {
    const target = control || [...(form?.elements || [])].find((el) => el.dataset?.error === message);
    if (target) {
      setFieldError(target, message);
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    const box = form?.querySelector('.form-error');
    if (box) {
      box.textContent = message;
      box.hidden = false;
      box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    notice(message);
  }

  // check form input when submitting form
  function validateForm(form) {
    clearFormErrors(form);
    const invalid = firstInvalidControl(form);
    if (!invalid) return true;
    showFormError(form, invalid.dataset.error || invalid.validationMessage, invalid);
    return false;
  }

  function clearFormError(form) {
    const box = form?.querySelector('.form-error');
    if (box) {
      box.textContent = '';
      box.hidden = true;
    }
  }

  // verify order detail and jump to order page after filling form
  function finishOrder(result, form) {
    if (result.error) {
      showFormError(form, result.error);
      return;
    }
    if (!commit(result.state)) {
      showFormError(form, SAVE_FAILED);
      return;
    }
    orderPlaced(result.order);
  }

  function orderPlaced(order) {
    if (order.type === 'standard') {
      ui.recycle = false;
      ui.recycleDetails = '';
    }
    navigate('orders');
    ui.lastOrder = order.id;
    render();
    const info = queueInfo(state, order.id);
    notice(info?.stage === 'queued' ? `Order ${order.id} sent. You are #${info.position} in line.` : `Request ${order.id} sent to Gunter.`);
  }

  async function remoteOrder(action, form) {
    const reply = await sync.send(action);
    if (reply.error) {
      showFormError(form, reply.error);
      return;
    }
    if (action.type === 'order.cart') state = { ...state, cart: {} };
    acceptShared(reply.shared, true);
    keepLocal();
    orderPlaced({ id: reply.result.orderId, type: reply.result.orderType });
  }

  function submitCart(form) {
    clearFormError(form);
    const data = { ...Object.fromEntries(new FormData(form).entries()), recycle: ui.recycle ? 'yes' : 'no', recycleDetails: ui.recycle ? ui.recycleDetails : '' };
    if (sync) return remoteOrder({ type: 'order.cart', cart: state.cart, input: withoutFiles(data) }, form);
    finishOrder(placeCartOrder(catalog, state, data, nextOrderId(state.orders), new Date().toISOString()), form);
  }

  function imageIssue(file) {
    if (!file || !file.size) return '';
    if (!IMAGE_TYPES.includes(file.type)) return 'The photo must be a PNG, JPG or WebP image.';
    if (file.size > MAX_IMAGE_BYTES) return 'The photo must be smaller than 350 KB.';
    return '';
  }

  async function readImage(file) {
    if (!file || !file.size) return null;
    const issue = imageIssue(file);
    if (issue) throw Error(issue);
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('Could not read the photo. Try another file.'));
      reader.readAsDataURL(file);
    });
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(encoded)) throw Error('Unsupported image data.');
    return encoded;
  }

  // submit form with image
  async function submitWithImage(form, placeOrder) {
    const button = form.querySelector('button[type="submit"]');
    if (button?.disabled) return;
    clearFormError(form);
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    try {
      const image = await readImage(data.reference);
      await placeOrder(data, image);
    } catch (error) {
      showFormError(form, error.message || 'Unable to send the photo.', form.elements.reference || null);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  // submit bulk or commission orders
  function submitDirect(form) {
    return submitWithImage(form, (data, image) => {
      data.recycle = 'no';
      if (sync) return remoteOrder({ type: 'order.direct', productId: form.dataset.id, mode: form.dataset.mode, input: withoutFiles(data), image }, form);
      return finishOrder(placeDirectOrder(catalog, state, form.dataset.id, form.dataset.mode, data, nextOrderId(state.orders), new Date().toISOString(), image), form);
    });
  }

  // submit repair orders
  function submitRepair(form) {
    return submitWithImage(form, (data, image) => (sync
      ? remoteOrder({ type: 'order.repair', input: withoutFiles(data), image }, form)
      : finishOrder(placeRepairOrder(state, data, nextOrderId(state.orders), new Date().toISOString(), image), form)));
  }

  // submit add product form from Forge Board
  async function submitProduct(form) {
    const button = form.querySelector('button[type="submit"]');
    if (button?.disabled) return;
    clearFormError(form);
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    try {
      const image = await readImage(data.image);
      if (sync) {
        const reply = await sync.send({ type: 'product.add', input: withoutFiles(data), image });
        if (reply.error) {
          showFormError(form, reply.error);
          return;
        }
        ui.productFormOpen = true;
        acceptShared(reply.shared, true);
        notice(`${reply.result.productName} added to ${reply.result.productGroup}. It is now in the shop.`);
        return;
      }
      const result = addProduct(state, data, image);
      if (result.error) {
        showFormError(form, result.error);
        return;
      }
      ui.productFormOpen = true;
      if (commit(result.state)) notice(`${result.product.name} added to ${result.product.group}. It is now in the shop.`);
      else showFormError(form, SAVE_FAILED);
    } catch (error) {
      showFormError(form, error.message || 'Unable to read the image.', form.elements.image || null);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  // submit quote
  function submitQuote(form) {
    if (sync) {
      act({ type: 'order.quote', id: form.dataset.id, crowns: new FormData(form).get('quote') }, () => notice(`Quote saved for ${form.dataset.id}. The customer can see it under My Orders.`), (message) => showFormError(form, message));
      return;
    }
    const result = setQuote(state, form.dataset.id, new FormData(form).get('quote'));
    if (result.error) {
      showFormError(form, result.error);
      return;
    }
    if (commit(result.state)) notice(`Quote saved for ${form.dataset.id}. The customer can see it under My Orders.`);
  }

  // price calculation for recycling and bulk
  function updateEstimates() {
    const subtotal = totalCents(catalog, state);
    const cartTotal = documentRoot.getElementById('cart-estimate');
    if (cartTotal) cartTotal.textContent = money(subtotal - Number(documentRoot.querySelector('#checkout [name="creditCents"]:checked')?.value || 0));

    const preview = documentRoot.getElementById('direct-estimate');
    const form = documentRoot.getElementById('direct-order');
    if (!preview || !form) return;
    const product = catalog.find((p) => p.id === form.dataset.id);
    const qty = Number(form.querySelector('[name="qty"]')?.value);
    const credit = documentRoot.getElementById('direct-credit');
    if (credit) {
      const checked = credit.querySelector('input')?.checked;
      credit.innerHTML = creditCheckbox(state, Number.isSafeInteger(qty) && qty >= MIN_BULK && qty <= MAX_BULK ? product.priceCents * qty : 0);
      if (credit.querySelector('input')) credit.querySelector('input').checked = Boolean(checked);
    }
    preview.textContent = Number.isSafeInteger(qty) && qty >= MIN_BULK && qty <= MAX_BULK
      ? `Estimated total: ${money(product.priceCents * qty)}`
      : `Enter a whole number from ${MIN_BULK} to ${MAX_BULK}.`;
  }

  // search scrollto
  function showResults() {
    globalThis.scrollTo?.({ top: 0, behavior: 'instant' });
    const heading = documentRoot.getElementById('results-heading');
    if (heading) heading.focus({ preventScroll: true });
    else searchBox().blur();
  }

  // confirm search
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

  // click on search suggestions
  function searchFor(query) {
    ui.search = query;
    ui.view = 'shop';
    render();
    showResults();
  }

  // change product review card when there are changes when adding products
  function updateProductPreview() {
    const form = documentRoot.getElementById('add-product');
    const box = documentRoot.getElementById('product-preview');
    if (!form || !box) return;
    box.innerHTML = productPreview(Object.fromEntries(new FormData(form).entries()), previewImageUrl);
  }

  // examples when adding products 
  function fillProductExample() {
    const form = documentRoot.getElementById('add-product');
    if (!form) return;
    for (const [name, value] of Object.entries(EXAMPLE_PRODUCT)) {
      if (form.elements[name]) form.elements[name].value = value;
    }
    clearFormErrors(form);
    updateProductPreview();
    form.elements.name.focus();
  }

  // try to remove product
  function removeAddedProduct(id) {
    const product = state.addedProducts.find((item) => item.id === id);
    if (!product) return;
    if (globalThis.confirm && !globalThis.confirm(`Remove ${product.name} from the shop?`)) return;
    if (sync) {
      act({ type: 'product.remove', id }, () => notice(`${product.name} was removed from the shop.`));
      return;
    }
    const result = removeProduct(state, id);
    if (result.error) {
      notice(result.error);
      return;
    }
    if (commit(result.state)) notice(`${product.name} was removed from the shop.`);
  }

  //check input when adding product
  function checkFileInput(input) {
    clearFieldError(input);
    const file = input.files?.[0];
    const issue = imageIssue(file);
    if (issue) {
      setFieldError(input, issue);
      input.value = '';
    }
    if (input.form?.id !== 'add-product') return;
    releasePreviewImage();
    if (!issue && file?.size && globalThis.URL?.createObjectURL) previewImageUrl = URL.createObjectURL(file);
    updateProductPreview();
  }

  //backup confirmation
  function confirmBackup() {
    if (savingBackup) return;
    if (!activeModal) returnFocus = documentRoot.activeElement;
    activeModal = { mode: 'backup' };
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop"><section class="modal image-modal" role="dialog" aria-modal="true" aria-labelledby="backup-save-title">
      <button class="modal-close" type="button" data-action="close" aria-label="Close">×</button>
      <div class="modal-body"><h2 id="backup-save-title">Save backup?</h2>
        <label>File name<input id="backup-name" type="text" maxlength="180" autocomplete="off" spellcheck="false" enterkeyhint="done"></label>
        <div class="backup-save-actions"><button class="button" type="button" data-action="save-backup">Save</button>
        <button class="button button-secondary" type="button" data-action="close">Cancel</button></div>
      </div></section></div>`;
    documentRoot.body.classList.add('has-modal');
    const input = documentRoot.getElementById('backup-name');
    input.value = `Birdforge_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    input.focus();
  }

  //backup
  async function exportBackup() {
    if (savingBackup || activeModal?.mode !== 'backup') return;
    let name = documentRoot.getElementById('backup-name').value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180);
    if (!name) { documentRoot.getElementById('backup-name').focus(); return; }
    if (!/\.json$/i.test(name)) name += '.json';
    savingBackup = true;
    let writable = null;
    try {
      const content = createBackup(state, builtInCatalog);
      if (new TextEncoder().encode(content).length > MAX_BACKUP_BYTES) {
        notice('This backup exceeds the 10 MB restore limit. No file was exported.');
        return;
      }
      if (typeof globalThis.showSaveFilePicker === 'function') {
        const file = await globalThis.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
        });
        writable = await file.createWritable();
        await writable.write(content);
        await writable.close();
        writable = null;
        closeModal();
        notice('Backup saved.');
        return;
      }
      const file = new File([content], name, { type: 'application/json' });
      if (globalThis.navigator?.canShare?.({ files: [file] }) && typeof globalThis.navigator.share === 'function') {
        try {
          await globalThis.navigator.share({ files: [file] });
          closeModal();
          notice('Backup handed to your device. Save it using the system menu.');
          return;
        } catch (error) {
          if (error.name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(file);
      const link = documentRoot.createElement('a');
      link.href = url;
      link.download = name;
      documentRoot.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      closeModal();
      notice('Download started. Your browser controls the save location.');
    } catch (error) {
      if (writable) {
        try { await writable.abort(); } catch {}
      }
      if (error.name !== 'AbortError') notice('Could not save the backup. Please try again.');
    } finally {
      savingBackup = false;
    }
  }

  //choose backup to restore
  async function chooseBackup(input) {
    const request = ++backupRead;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      notice('Choose a backup of 10 MB or smaller.');
      return;
    }
    try {
      const result = parseBackup(await file.text(), builtInCatalog);
      if (request !== backupRead) return;
      if (result.error) { notice(result.error); return; }
      if (sync) {
        if (side !== 'smith') { notice('Only Gunter can restore a backup.'); return; }
        if (!globalThis.confirm?.('Restore this backup? This replaces all orders and messages on the server.')) return;
        act({ type: 'backup.restore', state: result.state }, () => {
          backupRead += 1;
          messenger?.reset();
          closeModal();
          Object.assign(ui, { lastOrder: null, recycle: false, recycleDetails: '', savedOnly: false, showDelivered: false });
          render();
          notice('Backup restored.');
        });
        return;
      }
      if (!globalThis.confirm?.('Restore this backup? This replaces all current browser data.')) return;
      if (!commit(result.state, 'Gunter could not save this backup in your browser (storage is full or blocked). Current data was kept.', false, () => messenger?.reset())) return;
      backupRead += 1;
      closeModal();
      Object.assign(ui, { lastOrder: null, recycle: false, recycleDetails: '', savedOnly: false, showDelivered: false });
      render();
      notice('Backup restored.');
    } catch {
      if (request === backupRead) notice('Could not read the backup. Nothing was changed.');
    }
  }

  // reset data
  function resetDemo() {
    if (sync) {
      if (globalThis.confirm && !globalThis.confirm('Clear all orders and messages on the server for every customer?')) return;
      act({ type: 'demo.reset' }, () => {
        messenger?.reset();
        Object.assign(ui, { lastOrder: null, recycle: false, recycleDetails: '', savedOnly: false, showDelivered: false });
        render();
        notice('Demo data cleared.');
      });
      return;
    }
    if (globalThis.confirm && !globalThis.confirm('Clear all orders, the satchel and saved items in this browser?')) return;
    backupRead += 1;
    resetState();
    messenger?.reset();
    state = makeState();
    catalog = [...builtInCatalog];
    if (persistent) saveState(state);
    Object.assign(ui, { lastOrder: null, recycle: false, recycleDetails: '', savedOnly: false, showDelivered: false });
    render();
    notice('Demo data cleared.');
  }

  // actions
  function handleAction(action, id, button, event) {
    switch (action) {
      case 'raid-open':
      case 'raid-start':
      case 'raid-close':
        raidAction({ type: `raid.${action.slice(5)}` });
        return;
      case 'raid-select':
        raidSelection = Number(id);
        render();
        return;
      case 'raid-play':
        raidAction({ type: 'raid.play', handIndex: raidSelection });
        return;
      case 'raid-reward':
        raidAction({ type: 'raid.reward', rewardIndex: Number(id) });
        return;
      case 'raid-deeper':
      case 'raid-home':
        raidAction({ type: 'raid.vote', choice: action.slice(5) });
        return;
      case 'raid-fullscreen':
        main.requestFullscreen?.().catch(() => notice('Fullscreen is unavailable on this screen.'));
        return;
      case 'export-backup':
        confirmBackup();
        return;
      case 'save-backup':
        exportBackup();
        return;
      case 'restore-backup':
        backupRead += 1;
        documentRoot.getElementById('backup-file').click();
        return;
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
      case 'open-app':
        globalThis.open?.(otherApp, '_blank');
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
        if (sync) {
          act({ type: 'ticket.complete', id }, (result) => notice(result.advanced ? 'Order finished. Status changed to Delivering.' : 'Item finished. The rest of this order stays on the list.'));
          return;
        }
        const result = toggleTicket(state, id);
        if (result.error) {
          notice(result.error);
          return;
        }
        if (commit(result.state)) notice(result.advanced ? 'Order finished. Status changed to Delivering.' : 'Item finished. The rest of this order stays on the list.');
        return;
      }
      case 'add-samples':
        if (sync) {
          act({ type: 'demo.samples' }, () => notice('3 sample orders added to the work list.'));
          return;
        }
        if (commit(addSampleOrders(catalog, state))) notice('3 sample orders added to the work list.');
        return;
      case 'reset-demo':
        resetDemo();
        return;
      case 'view-reference':
        openReference(id);
        return;
      case 'show-delivered':
        ui.showDelivered = true;
        render();
        return;
      case 'product-example':
        fillProductExample();
        return;
      case 'remove-product':
        removeAddedProduct(id);
        return;
      case 'report-print':
        globalThis.print?.();
        return;
      case 'report-csv': {
        const report = businessReport(state, { range: ui.reportRange, from: ui.reportFrom, to: ui.reportTo });
        const blob = new Blob([reportCsv(report)], { type: 'text/csv' });
        const link = documentRoot.createElement('a');
        link.href = globalThis.URL.createObjectURL(blob);
        link.download = `birdforge-report-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        setTimeout(() => globalThis.URL.revokeObjectURL(link.href), 1000);
        notice('Report downloaded.');
        return;
      }
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

  // handling click/change/submit/input events 
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
    if (el.id === 'backup-file') { chooseBackup(el); return; }
    if (el.matches('#recycle-panel input[name="recycle"]')) {
      ui.recycle = el.checked;
      const extra = documentRoot.querySelector('#recycle-panel .recycle-extra');
      if (extra) extra.hidden = !el.checked;
      updateEstimates();
      return;
    }
    if (el.name === 'creditCents') { updateEstimates(); return; }
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
    if (['report-range', 'report-from', 'report-to'].includes(el.id)) {
      const key = { 'report-range': 'reportRange', 'report-from': 'reportFrom', 'report-to': 'reportTo' }[el.id];
      ui[key] = el.value;
      if (el.id === 'report-range' && el.value === 'custom' && !ui.reportFrom) {
        const today = new Date();
        const local = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        ui.reportTo = local(today);
        ui.reportFrom = local(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000));
      }
      render();
      return;
    }
    if (el.id === 'show-delivered') {
      ui.showDelivered = el.checked;
      render();
      return;
    }
    if (el.matches('input[type="file"]')) {
      checkFileInput(el);
      return;
    }
    if (el.matches('#add-product select')) updateProductPreview();
    if (el.matches('select[data-action="status"]') && sync) {
      const current = state.orders.find((order) => order.id === el.dataset.id);
      act({ type: 'order.status', id: el.dataset.id, status: el.value, from: current?.status }, () => notice(`${el.dataset.id} is now ${el.value}.`));
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
    if (form.id === 'raid-join') {
      event.preventDefault();
      if (!validateForm(form)) return;
      const data = new FormData(form);
      raidAction({ type: 'raid.join', code: String(data.get('code') || '').toUpperCase(), name: data.get('name'), color: data.get('color') });
      return;
    }
    if (form.classList.contains('credit-form')) {
      event.preventDefault();
      const cents = Number(new FormData(form).get('creditCents') || 0);
      if (!cents) return;
      if (sync) { act({ type: 'order.credit', id: form.dataset.id, creditCents: cents }, () => notice('Forge Credit applied.')); return; }
      const result = redeemCredit(state, form.dataset.id, cents, 'local', new Date().toISOString());
      if (result.error) notice(result.error);
      else if (commit(result.state)) notice('Forge Credit applied.');
      return;
    }
    const handlers = { checkout: submitCart, 'direct-order': submitDirect, 'repair-order': submitRepair, 'add-product': submitProduct };
    const handler = handlers[form.id] || (form.classList.contains('quote-form') ? submitQuote : null);
    if (!handler) return;
    event.preventDefault();
    if (!validateForm(form)) return;
    handler(form);
  });

  documentRoot.addEventListener('input', (event) => {
    const el = event.target;
    if (el.form && el.getAttribute('aria-invalid')) clearFieldError(el);
    if (el.form) clearFormError(el.form);
    if (el.closest?.('#add-product')) updateProductPreview();
    if (el.matches('#recycle-panel [name="recycleDetails"]')) ui.recycleDetails = el.value;
    if (el.matches('#direct-order [name="qty"]')) updateEstimates();
    if (el.form?.id === 'raid-join' && el.name === 'code') el.value = el.value.toUpperCase();
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

  // keyboard controls
  documentRoot.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.id === 'backup-name') {
      event.preventDefault();
      exportBackup();
      return;
    }
    if (event.key === 'Escape' && event.target.id === 'search' && ui.search) {
      ui.search = '';
      render();
      return;
    }
    if (event.key === 'Escape') closeModal();
    if (side !== 'smith' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
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

  documentRoot.addEventListener('toggle', (event) => {
    if (event.target.id === 'add-product-panel') ui.productFormOpen = event.target.open;
  }, true);

  globalThis.addEventListener?.('storage', (event) => {
    if (sync) return;
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const typing = documentRoot.activeElement?.closest?.('form');
    state = loadState(builtInCatalog);
    catalog = [...builtInCatalog, ...state.addedProducts];
    if (typing) return;
    render();
    if (activeModal?.mode === 'detail') openModal(activeModal.id, 'detail');
  });

  // click on brand
  documentRoot.getElementById('brand').addEventListener('click', (event) => {
    event.preventDefault();
    ui.search = '';
    navigate(views[0]);
  });

  // orb
  messenger = mountOrb({ documentRoot, getState: () => state, getView: () => ui.view,
    saveOrb: (orb) => (sync ? saveOrbRemote(orb) : commit({ ...state, orb }, SAVE_FAILED, false)),
    navigate: (view) => {
      if (view === 'admin') Object.assign(ui, { adminTab: 'orders', adminFilter: 'All', showDelivered: true });
      navigate(view);
    }, notify: notice });
  render();
  sync?.connect();
  if (sync) setInterval(raidTick, side === 'smith' ? 100 : 1000);
  if (!persistent) notice('This browser is not saving data. Orders will disappear when you close the page.');

  return {
    getState: () => structuredClone(state),
    getUI: () => ({ ...ui }),
    navigate,
    render,
    reset: () => {
      resetState();
      messenger?.reset();
      state = loadState(builtInCatalog);
      catalog = [...builtInCatalog, ...state.addedProducts];
      render();
    },
  };
}
