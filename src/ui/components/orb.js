import { emptyOrb, appendMessage, openCustomerOrb, pendingMessages } from '../../domain/orb.js';
import { text } from './shared.js';

// orb start
export function mountOrb({ documentRoot, getState, saveOrb, getView, navigate }) {
  const layer = documentRoot.createElement('div');
  layer.id = 'orb-layer';
  layer.innerHTML = `<div id="orb-banners" aria-label="Order notifications" aria-live="polite"></div>
    <button type="button" id="orb-launcher" aria-label="Open messenger orb" aria-haspopup="dialog"><span class="orb-sphere" aria-hidden="true"></span><span class="orb-unread" hidden></span></button>
    <dialog id="orb-dialog" aria-labelledby="orb-title"><header class="orb-header"><div><strong id="orb-title">Messenger Orb</strong><small>Leave a message for Gunter</small></div><button type="button" data-orb-action="close" aria-label="Close messenger">×</button></header><div id="orb-chat-body"></div></dialog>`;
  documentRoot.body.append(layer);
  const dialog = layer.querySelector('#orb-dialog');
  const banners = layer.querySelector('#orb-banners');
  const launcher = layer.querySelector('#orb-launcher');
  const drafts = new Map();
  let thread = null;
  let customerOrder = '';
  let bannerTimer;
  let exitTimer;
  let bannerKey = '';
  let previousRole = null;
  let chatSignature = '';
  let boardSignature = '';
  let returnFocus;
  const orb = () => getState().orb || emptyOrb();
  const isSmith = () => ['admin', 'tickets'].includes(getView());
  const incoming = (m) => m.kind !== 'customer';
  const ownOrders = () => getState().orders.filter((o) => o.source !== 'sample');
  const draftKey = (smith) => `${smith ? 'gunter' : 'customer'}:${smith ? thread || '' : customerOrder}`;
  const time = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fullTime = (at) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  //  load history
  function history(messages, smith = false) {
    if (!messages.length) return '<p class="orb-empty">Your orb is quiet.<br>Leave Gunter a message below.</p>';
    let previousAt = null;
    const sessions = smith ? [] : orb().sessions;
    return messages.map((m) => {
      const divider = previousAt === null || Date.parse(m.at) - Date.parse(previousAt) >= 30 * 60 * 1000
        || sessions.some((at) => Date.parse(at) > Date.parse(previousAt) && Date.parse(at) <= Date.parse(m.at));
      previousAt = m.at;
      const side = m.kind === 'notification' || (smith ? m.kind === 'gunter' : m.kind === 'customer') ? 'right' : 'left';
      const label = m.kind === 'notification' ? '✦ Order update' : m.kind === 'gunter' ? 'Gunter' : smith ? 'Customer' : 'You';
      const bubble = m.kind === 'notification'
        ? `<button type="button" class="orb-bubble" data-orb-action="order" data-id="${text(m.orderId)}">${text(m.text)}</button>`
        : `<div class="orb-bubble">${text(m.text)}</div>`;
      return `${divider ? `<div class="orb-divider">${text(fullTime(m.at))}</div>` : ''}<article class="orb-message orb-${m.kind} orb-${side} ${!m.read && incoming(m) ? 'orb-new' : ''}"><small>${label}${m.kind !== 'notification' && m.orderId ? ` · #${text(m.orderId)}` : ''}</small>${bubble}<time datetime="${text(m.at)}">${text(time(m.at))}</time></article>`;
    }).join('');
  }

  // composer
  function composer(smith = false) {
    const key = draftKey(smith);
    return `<form class="orb-composer" data-orb-form="${smith ? 'gunter' : 'customer'}">
      ${smith ? '' : `<label class="orb-order-label">About<select name="orderId" aria-label="Message about"> <option value="">General inquiry</option>${ownOrders().map((o) => `<option value="${text(o.id)}" ${o.id === customerOrder ? 'selected' : ''}>#${text(o.id)} · ${text(o.items[0]?.name || 'Order')}</option>`).join('')}</select></label>`}
      <div class="orb-compose-row"><textarea name="message" rows="1" maxlength="1600" required aria-label="${smith ? 'Reply to customer' : 'Message Gunter'}" placeholder="${smith ? 'Write a reply…' : 'Message Gunter…'}">${text(drafts.get(key) || '')}</textarea><button type="submit" aria-label="Send message">↑</button></div><p class="orb-send-error" role="alert" hidden></p></form>`;
  }

  function replaceKeepingFocus(root, html) {
    const active = documentRoot.activeElement;
    const name = root.contains(active) ? active.name : null;
    const position = name === 'message' ? active.selectionStart : null;
    const timeline = root.querySelector('.orb-timeline');
    const scroll = timeline?.scrollTop || 0;
    const nearEnd = !timeline || timeline.scrollHeight - timeline.clientHeight - scroll < 70;
    root.innerHTML = html;
    const nextTimeline = root.querySelector('.orb-timeline');
    if (nextTimeline) nextTimeline.scrollTop = nearEnd ? nextTimeline.scrollHeight : scroll;
    if (name) {
      const input = root.querySelector(`[name="${name}"]`);
      input?.focus({ preventScroll: true });
      if (position !== null) input?.setSelectionRange(position, position);
    }
  }

  function renderChat() {
    const signature = JSON.stringify([orb(), ownOrders().map((o) => [o.id, o.items[0]?.name]), customerOrder]);
    if (signature === chatSignature) return;
    chatSignature = signature;
    const messages = orb().messages;
    const lastSession = orb().sessions.at(-1);
    const ending = lastSession && (!messages.length || Date.parse(lastSession) > Date.parse(messages.at(-1).at))
      ? `<div class="orb-divider">${text(fullTime(lastSession))}</div>` : '';
    replaceKeepingFocus(layer.querySelector('#orb-chat-body'), `<div class="orb-timeline" role="log" aria-label="Orb messages">${history(messages)}${ending}</div>${composer()}`);
  }

  function renderBoard() {
    const root = documentRoot.getElementById('forge-messages');
    if (!root) { boardSignature = ''; return; }
    const messages = orb().messages;
    const activeThreads = [...new Set(messages.filter((m) => m.kind !== 'notification').map((m) => m.orderId))];
    if (!activeThreads.includes(thread)) thread = activeThreads[0] ?? null;
    const unread = messages.filter((m) => m.kind === 'customer' && !m.read && m.orderId === thread);
    if (unread.length) {
      const ids = new Set(unread.map((m) => m.id));
      if (saveOrb({ ...orb(), messages: messages.map((m) => ids.has(m.id) ? { ...m, read: true } : m) })) return;
    }
    const signature = JSON.stringify([orb(), thread]);
    if (signature === boardSignature && root.children.length) return;
    boardSignature = signature;
    const threads = activeThreads.length ? activeThreads : [null];
    const selectedOrder = ownOrders().find((o) => o.id === thread);
    const items = messages.filter((m) => m.orderId === thread);
    replaceKeepingFocus(root, `<div class="forge-messenger"><aside class="forge-threads" aria-label="Message conversations">${threads.map((id) => {
      const order = ownOrders().find((o) => o.id === id);
      const count = messages.filter((m) => m.kind === 'customer' && !m.read && m.orderId === id).length;
      return `<button type="button" data-orb-action="thread" data-id="${text(id || '')}" aria-pressed="${id === thread}"><strong>${id ? `#${text(id)}` : 'General inquiry'}${count ? ` <span class="forge-unread">${count}</span>` : ''}</strong><small>${text(order?.customer.name || 'Customer messages')}</small></button>`;
    }).join('')}</aside><section class="forge-conversation"><header class="forge-conversation-title"><strong>${thread ? `#${text(thread)} · ${text(selectedOrder?.customer.name || '')}` : 'General inquiry'}</strong></header><div class="orb-timeline" role="log" aria-label="Customer conversation">${history(items, true)}</div>${composer(true)}</section></div>`);
  }

  function dismissBanners() {
    clearTimeout(bannerTimer);
    clearTimeout(exitTimer);
    banners.innerHTML = '';
    banners.classList.remove('orb-banner-exit');
    bannerKey = '';
  }

  // banner
  function showBanners() {
    const pending = pendingMessages(orb());
    if (!pending.length) return;
    const key = pending.map((m) => m.id).join('|');
    if (key === bannerKey) return;
    dismissBanners();
    bannerKey = key;
    const html = (m, grouped) => `<button type="button" class="orb-banner" data-orb-action="${grouped || m.kind === 'gunter' ? 'open' : 'order'}" data-id="${text(m.orderId || '')}">${text(m.kind === 'gunter' ? 'Gunter sent you a message.' : m.text)}</button>`;
    banners.innerHTML = pending.length >= 3
      ? `${html(pending[0], true)}<button type="button" class="orb-banner" data-orb-action="open">And ${pending.length - 1} more notifications.</button>`
      : pending.map((m) => html(m, !m.orderId)).join('');
    const ids = new Set(pending.map((m) => m.id));
    bannerTimer = setTimeout(() => {
      banners.classList.add('orb-banner-exit');
      exitTimer = setTimeout(dismissBanners, 260);
    }, 4000);
    if (!saveOrb({ ...orb(), messages: orb().messages.map((m) => ids.has(m.id) ? { ...m, shown: true } : m) })) dismissBanners();
  }

  function open() {
    if (isSmith()) return;
    returnFocus = documentRoot.activeElement;
    dismissBanners();
    if (!saveOrb(openCustomerOrb(orb()))) return;
    renderChat();
    if (!dialog.open) dialog.showModal();
    launcher.setAttribute('aria-expanded', 'true');
    const timeline = layer.querySelector('.orb-timeline');
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }

  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => {
    launcher.setAttribute('aria-expanded', 'false');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else launcher.focus({ preventScroll: true });
  });
  launcher.addEventListener('click', open);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });

  documentRoot.addEventListener('click', (event) => {
    const button = event.target.closest('[data-orb-action]');
    if (!button) return;
    const action = button.dataset.orbAction;
    if (action === 'open') open();
    if (action === 'close') close();
    if (action === 'thread') { thread = button.dataset.id || null; boardSignature = ''; renderBoard(); }
    if (action === 'order') {
      const id = button.dataset.id;
      if (!ownOrders().some((o) => o.id === id)) { open(); return; }
      close();
      dismissBanners();
      navigate(isSmith() ? 'admin' : 'orders');
      const card = [...documentRoot.querySelectorAll('[data-order]')].find((el) => el.dataset.order === id);
      if (card) {
        card.classList.add('orb-order-highlight');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.tabIndex = -1;
        card.focus({ preventScroll: true });
        setTimeout(() => card.classList.remove('orb-order-highlight'), 2400);
      }
    }
  });

  documentRoot.addEventListener('input', (event) => {
    if (!event.target.matches?.('[data-orb-form] textarea')) return;
    drafts.set(draftKey(event.target.closest('form').dataset.orbForm === 'gunter'), event.target.value);
  });
  documentRoot.addEventListener('change', (event) => {
    if (!event.target.matches?.('[data-orb-form="customer"] [name="orderId"]')) return;
    customerOrder = event.target.value;
    chatSignature = '';
    renderChat();
  });
  documentRoot.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-orb-form]');
    if (!form) return;
    event.preventDefault();
    const value = form.elements.message.value.trim();
    if (!value || value.length > 1600) return;
    const smith = form.dataset.orbForm === 'gunter';
    const orderId = (smith ? thread : customerOrder) || null;
    if (orderId && !ownOrders().some((o) => o.id === orderId)) return;
    const key = draftKey(smith);
    const oldDraft = drafts.get(key);
    drafts.delete(key);
    let next = appendMessage(orb(), smith ? 'gunter' : 'customer', value, orderId);
    if (!smith) next = openCustomerOrb(next);
    if (!saveOrb(next)) {
      drafts.set(key, oldDraft || value);
      const error = form.querySelector('.orb-send-error');
      error.textContent = 'Message was not saved. Please try again.';
      error.hidden = false;
      return;
    }
    const timeline = documentRoot.querySelector(smith ? '#forge-messages .orb-timeline' : '#orb-dialog .orb-timeline');
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
    documentRoot.querySelector(smith ? '#forge-messages textarea' : '#orb-dialog textarea')?.focus({ preventScroll: true });
  });

  function render() {
    const smith = isSmith();
    launcher.hidden = smith;
    if (smith) { close(); dismissBanners(); }
    if (previousRole !== smith) { boardSignature = ''; previousRole = smith; }
    const count = orb().messages.filter((m) => incoming(m) && !m.read).length;
    const badge = launcher.querySelector('.orb-unread');
    badge.hidden = !count;
    badge.textContent = count > 99 ? '99+' : count;
    launcher.setAttribute('aria-label', `Open messenger orb${count ? `, ${count} unread messages` : ''}`);
    const boardUnread = orb().messages.filter((m) => m.kind === 'customer' && !m.read).length;
    const tab = documentRoot.querySelector('[data-action="admin-tab"][data-id="messages"]');
    if (tab) tab.textContent = `Messages${boardUnread ? ` (${boardUnread})` : ''}`;
    if (dialog.open && count) {
      if (saveOrb(openCustomerOrb(orb()))) return;
    }
    if (dialog.open) renderChat();
    renderBoard();
    if (!smith && !dialog.open) showBanners();
  }
  return { render, close, reset() { close(); dismissBanners(); drafts.clear(); chatSignature = ''; boardSignature = ''; customerOrder = ''; thread = null; } };
}
