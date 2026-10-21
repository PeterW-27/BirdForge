import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mountApp } from '../src/controller/app.js';
import { builtInCatalog as catalog } from '../src/data/catalog.js';
import { makeState, placeCartOrder } from '../src/domain/core.js';
import { createBackup } from '../src/domain/backup.js';

const key = 'gunters-forge-v54-demo';
const seed = () => placeCartOrder(catalog, { ...makeState(), cart: { 'sword-short': 1 } },
  { name: 'Test Buyer', email: 'test@example.com' }, 'GF-0001', '2026-10-20T10:00:00.000Z').state;

function environment(initial = seed()) {
  const listeners = {};
  const nodes = new Map();
  const values = new Map([[key, JSON.stringify(initial)]]);
  const fixture = { failWrites: false, confirmResult: true, confirmations: [], downloads: [], blobs: [], listeners };
  const node = () => ({ innerHTML: '', textContent: '', hidden: false, value: '', children: [], contains: () => false,
    classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
    addEventListener() {}, append() {}, remove() {}, click() {}, setAttribute() {}, removeAttribute() {},
    querySelectorAll: () => [], querySelector(selector) {
      if (!this.parts) this.parts = new Map();
      if (!this.parts.has(selector)) this.parts.set(selector, node());
      return this.parts.get(selector);
    },
    closest: () => ({ hidden: false }), focus() {}, scrollIntoView() {} });
  const document = { activeElement: null, body: node(),
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener(type, fn) {
      const previous = listeners[type];
      listeners[type] = previous ? (event) => { previous(event); fn(event); } : fn;
    },
    createElement() { const link = node(); link.click = () => fixture.downloads.push(link.download); return link; } };
  const storage = {
    getItem: (id) => values.get(id) ?? null,
    setItem(id, value) { if (fixture.failWrites) throw Error('QuotaExceededError'); values.set(id, value); },
    removeItem: (id) => values.delete(id),
  };
  return Object.assign(fixture, { document, storage, values,
    toast: () => document.getElementById('toast-root').textContent,
    action(name) {
      const button = { dataset: { action: name }, tagName: 'BUTTON', closest: () => null };
      listeners.click({ target: { closest: (selector) => selector === '[data-action]' ? button : null }, preventDefault() {} });
    },
    save(name) {
      this.action('export-backup');
      if (name !== undefined) document.getElementById('backup-name').value = name;
      this.action('save-backup');
    },
    async choose(content, size = Buffer.byteLength(content)) {
      listeners.change({ target: { id: 'backup-file', files: [{ size, text: async () => content }] } });
      await new Promise(setImmediate);
    },
    globals() {
      return { document, localStorage: storage, addEventListener() {}, scrollTo() {},
        confirm(message) { fixture.confirmations.push(message); return fixture.confirmResult; },
        showSaveFilePicker: undefined, navigator: {},
        URL: { createObjectURL(blob) { fixture.blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
        Blob, TextEncoder, structuredClone, setTimeout: () => 1, clearTimeout() {} };
    },
  });
}

async function mounted(callback, options = {}) {
  const fixture = environment();
  const globals = fixture.globals();
  const saved = Object.fromEntries(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const app = mountApp(fixture.document, options);
    await callback(fixture, app);
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test('restore confirmation can be cancelled and accepted from the footer', async () => mounted(async (fixture, app) => {
  const empty = createBackup(makeState(), catalog);
  let opened = false;
  fixture.document.getElementById('backup-file').click = () => { opened = true; };
  fixture.action('restore-backup');
  assert.equal(opened, true);
  fixture.confirmResult = false;
  await fixture.choose(empty);
  assert.equal(app.getState().orders.length, 1);
  assert.match(fixture.confirmations[0], /replaces all current browser data/);
  fixture.confirmResult = true;
  await fixture.choose(empty);
  assert.equal(app.getState().orders.length, 0);
  assert.equal(JSON.parse(fixture.values.get(key)).orders.length, 0);
  assert.match(fixture.toast(), /Backup restored/);
}));

test('controller refuses invalid and oversized files without changing saved data', async () => mounted(async (fixture, app) => {
  const before = fixture.values.get(key);
  await fixture.choose('{broken');
  assert.match(fixture.toast(), /not valid JSON/);
  await fixture.choose('{}', 10000001);
  assert.match(fixture.toast(), /10 MB/);
  fixture.action('restore-backup');
  assert.equal(fixture.values.get(key), before);
  assert.equal(app.getState().orders.length, 1);
}));

test('controller preserves original data when restore cannot be saved and permits a retry', async () => mounted(async (fixture, app) => {
  const before = fixture.values.get(key);
  fixture.failWrites = true;
  await fixture.choose(createBackup(makeState(), catalog));
  assert.match(fixture.toast(), /could not save/);
  assert.equal(fixture.values.get(key), before);
  assert.equal(app.getState().orders.length, 1);
  fixture.failWrites = false;
  await fixture.choose(createBackup(makeState(), catalog));
  assert.equal(app.getState().orders.length, 0);
}));

test('controller export produces a versioned JSON download without changing state', async () => mounted(async (fixture, app) => {
  const before = app.getState();
  fixture.save();
  assert.match(fixture.downloads[0], /^Birdforge_Backup_.*\.json$/);
  const data = JSON.parse(await fixture.blobs[0].text());
  assert.equal(data.format, 'gunters-forge-backup');
  assert.deepEqual(data.state, before);
  assert.deepEqual(app.getState(), before);
}));

test('cancelling save confirmation never opens a picker or downloads a backup', async () => mounted(async (fixture) => {
  globalThis.showSaveFilePicker = () => { assert.fail('Picker must not open'); };
  fixture.action('export-backup');
  assert.match(fixture.document.getElementById('modal-root').innerHTML, /Save backup\?/);
  assert.equal(fixture.downloads.length, 0);
  fixture.action('close');
  fixture.action('save-backup');
  assert.equal(fixture.downloads.length, 0);
}));

test('native Save As receives a suggested JSON filename and writes only after selection', async () => mounted(async (fixture, app) => {
  let content;
  let closed = false;
  globalThis.showSaveFilePicker = async (options) => {
    assert.match(options.suggestedName, /\.json$/);
    return { createWritable: async () => ({ write: async (value) => { content = value; }, close: async () => { closed = true; } }) };
  };
  fixture.save();
  await new Promise(setImmediate);
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(content).state, app.getState());
  assert.equal(fixture.downloads.length, 0);
  assert.equal(fixture.toast(), 'Backup saved.');
}));

test('cancelling Save As produces no download or success message and allows retry', async () => mounted(async (fixture) => {
  globalThis.showSaveFilePicker = async () => { throw Object.assign(Error('Cancelled'), { name: 'AbortError' }); };
  fixture.save();
  await new Promise(setImmediate);
  assert.equal(fixture.downloads.length, 0);
  assert.doesNotMatch(fixture.toast(), /Backup saved/);
  globalThis.showSaveFilePicker = undefined;
  fixture.save();
  assert.equal(fixture.downloads.length, 1);
}));

test('failed file write aborts the writable and preserves browser data', async () => mounted(async (fixture, app) => {
  const before = app.getState();
  let aborted = false;
  globalThis.showSaveFilePicker = async () => ({ createWritable: async () => ({
    write: async () => { throw Error('Disk full'); }, abort: async () => { aborted = true; },
  }) });
  fixture.save();
  await new Promise(setImmediate);
  assert.equal(aborted, true);
  assert.match(fixture.toast(), /Could not save/);
  assert.deepEqual(app.getState(), before);
}));

test('mobile file sharing uses the chosen filename and does not claim the file was saved', async () => mounted(async (fixture) => {
  let shared;
  globalThis.navigator = { canShare: ({ files }) => files[0].type === 'application/json', share: async (data) => { shared = data.files[0]; } };
  fixture.save('My Forge');
  await new Promise(setImmediate);
  assert.equal(shared.name, 'My Forge.json');
  assert.equal(JSON.parse(await shared.text()).format, 'gunters-forge-backup');
  assert.equal(fixture.downloads.length, 0);
  assert.doesNotMatch(fixture.toast(), /Backup saved/);
}));

test('browsers without file sharing download the user-named JSON backup', async () => mounted(async (fixture) => {
  fixture.save('Travel backup');
  assert.equal(fixture.downloads[0], 'Travel backup.json');
}));

test('an empty backup filename creates no file and keeps the save dialog open', async () => mounted(async (fixture) => {
  fixture.save('');
  assert.equal(fixture.downloads.length, 0);
  assert.match(fixture.document.getElementById('modal-root').innerHTML, /Save backup\?/);
}));

test('cancelling the mobile share sheet does not start a download', async () => mounted(async (fixture) => {
  globalThis.navigator = { canShare: () => true, share: async () => { throw Object.assign(Error('Cancelled'), { name: 'AbortError' }); } };
  fixture.save('Phone backup');
  await new Promise(setImmediate);
  assert.equal(fixture.downloads.length, 0);
  assert.match(fixture.document.getElementById('modal-root').innerHTML, /Save backup\?/);
}));

test('a blocked mobile share falls back to a named file download', async () => mounted(async (fixture) => {
  globalThis.navigator = { canShare: () => true, share: async () => { throw Object.assign(Error('Blocked'), { name: 'NotAllowedError' }); } };
  fixture.save('Phone backup');
  await new Promise(setImmediate);
  assert.equal(fixture.downloads[0], 'Phone backup.json');
}));

test('repeated Save clicks open only one native save picker', async () => mounted(async (fixture) => {
  let calls = 0;
  let cancel;
  globalThis.showSaveFilePicker = () => { calls += 1; return new Promise((resolve, reject) => { cancel = reject; }); };
  fixture.save('Only once');
  fixture.action('save-backup');
  assert.equal(calls, 1);
  cancel(Object.assign(Error('Cancelled'), { name: 'AbortError' }));
  await new Promise(setImmediate);
}));

test('opening another file chooser cancels a stale asynchronous backup read', async () => mounted(async (fixture, app) => {
  let finish;
  fixture.listeners.change({ target: { id: 'backup-file', files: [{ size: 1, text: () => new Promise((resolve) => { finish = resolve; }) }] } });
  fixture.action('restore-backup');
  finish(createBackup(makeState(), catalog));
  await new Promise(setImmediate);
  fixture.action('restore-backup');
  assert.equal(app.getState().orders.length, 1);
}));

test('rebuilt standalone script boots and renders the same feature controls', () => {
  const fixture = environment();
  const html = readFileSync(new URL('../dist/Birdforge_V6_2_Workshop_Standalone.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  runInNewContext(script, fixture.globals());
  const button = { dataset: { view: 'admin' } };
  fixture.listeners.click({ target: { closest: (selector) => selector === '[data-view]' ? button : null }, preventDefault() {} });
  const content = fixture.document.getElementById('main').innerHTML;
  assert.match(content, /Status history/);
  assert.doesNotMatch(content, /backup-panel|backup-preview|export-backup/);
  const footer = fixture.document.getElementById('shell-footer').innerHTML;
  assert.match(footer, /export-backup/);
  assert.match(footer, /restore-backup/);
  assert.match(footer, /backup-file/);
});

test('a failed status save creates neither a changed order nor a ghost notification', async () => mounted(async (fixture, app) => {
  app.navigate('admin');
  const before = fixture.values.get(key);
  fixture.failWrites = true;
  const target = { id: '', value: 'Processing', dataset: { id: 'GF-0001' }, matches: (selector) => selector === 'select[data-action="status"]' };
  fixture.listeners.change({ target });
  assert.equal(fixture.values.get(key), before);
  assert.equal(app.getState().orders[0].status, 'Placed');
  assert.equal(app.getState().orb, undefined);
  fixture.failWrites = false;
  fixture.listeners.change({ target });
  const saved = JSON.parse(fixture.values.get(key));
  assert.equal(saved.orders[0].status, 'Processing');
  assert.equal(saved.orb.messages.length, 1);
  assert.equal(saved.orb.messages[0].shown, false);
  assert.equal(saved.orb.messages[0].read, false);
}, { app: 'smith' }));
