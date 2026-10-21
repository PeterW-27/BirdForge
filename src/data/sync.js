const CLIENT_KEY = 'birdforge-device-id';
const LOCAL_KEY = 'birdforge-local-v1';

const randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function deviceId() {
  const store = storage();
  try {
    const saved = store?.getItem(CLIENT_KEY);
    if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved;
    const created = randomId();
    store?.setItem(CLIENT_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

export function loadLocal() {
  try {
    const raw = JSON.parse(storage()?.getItem(LOCAL_KEY) || '{}');
    return {
      cart: raw.cart && typeof raw.cart === 'object' ? raw.cart : {},
      favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
      shown: Array.isArray(raw.shown) ? raw.shown.filter((id) => typeof id === 'string').slice(-500) : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions.slice(-50) : [],
      lastOpenedAt: typeof raw.lastOpenedAt === 'string' ? raw.lastOpenedAt : null,
    };
  } catch {
    return { cart: {}, favorites: [], shown: [], sessions: [], lastOpenedAt: null };
  }
}

export function saveLocal(local) {
  try {
    storage()?.setItem(LOCAL_KEY, JSON.stringify(local));
    return true;
  } catch {
    return false;
  }
}

export function createSync({ onShared, onStatus }) {
  const client = deviceId();
  const headers = { 'content-type': 'application/json', 'x-birdforge-client': client };
  let version = 0;
  let online = true;

  function setOnline(value) {
    if (online === value) return;
    online = value;
    onStatus(value);
  }

  function accept(body) {
    if (typeof body.version === 'number') version = body.version;
    if (body.shared) onShared(body.shared);
  }

  async function pull() {
    try {
      const response = await fetch('/api/state', { headers, cache: 'no-store' });
      const body = await response.json();
      setOnline(true);
      accept(body);
    } catch {
      setOnline(false);
    }
  }

  async function send(action) {
    let body;
    try {
      const response = await fetch('/api/actions', { method: 'POST', headers, body: JSON.stringify({ ...action, requestId: randomId() }) });
      body = await response.json();
    } catch {
      setOnline(false);
      return { error: "Could not reach Birdforge. Check your internet connection and try again." };
    }
    setOnline(true);
    if (typeof body.version === 'number') version = body.version;
    return body;
  }

  function connect() {
    pull();
    if (typeof globalThis.EventSource === 'function') {
      const events = new EventSource('/api/events');
      events.onmessage = (event) => {
        setOnline(true);
        if (Number(event.data) !== version) pull();
      };
      events.onerror = () => setOnline(false);
    }
    setInterval(pull, 15000);
  }

  return { connect, pull, send, client };
}
