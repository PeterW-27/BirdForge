import http from 'node:http';
import { readFile, writeFile, rename, mkdir, appendFile } from 'node:fs/promises';
import { readFileSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { builtInCatalog } from '../src/data/catalog.js';
import { makeState, restoreState } from '../src/domain/core.js';
import { applyAction, customerView } from '../src/domain/actions.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const MAX_BODY = 1_500_000;
const CLIENT_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const TYPES = Object.freeze({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.json': 'application/json' });
const STATIC_DIRS = Object.freeze(['/src/', '/styles/', '/assets/']);

function loadSaved(file) {
  try {
    return restoreState(JSON.parse(readFileSync(file, 'utf8')), builtInCatalog);
  } catch {
    return makeState();
  }
}

export function startServer(options = {}) {
  const dataDir = options.dataDir || process.env.BIRDFORGE_DATA || path.join(ROOT, 'data');
  const publicPort = Number(options.publicPort ?? process.env.PUBLIC_PORT ?? 8789);
  const publicHost = options.publicHost || process.env.PUBLIC_HOST || '127.0.0.1';
  const publicSocket = options.publicSocket || process.env.PUBLIC_SOCKET || null;
  const adminPort = Number(options.adminPort ?? process.env.ADMIN_PORT ?? 8790);
  const adminHost = options.adminHost || process.env.ADMIN_HOST || '127.0.0.1';
  const shopUrl = options.shopUrl || process.env.SHOP_URL || `http://${publicHost}:${publicPort}/`;
  const stateFile = path.join(dataDir, 'state.json');
  const logFile = path.join(dataDir, 'actions.log');

  let state = loadSaved(stateFile);
  let version = 1;
  let writing = Promise.resolve();
  const streams = new Set();
  const replies = new Map();
  const rate = new Map();

  function persist(entry) {
    const snapshot = JSON.stringify(state);
    writing = writing.then(async () => {
      await mkdir(dataDir, { recursive: true });
      await writeFile(`${stateFile}.tmp`, snapshot);
      await rename(`${stateFile}.tmp`, stateFile);
      await appendFile(logFile, JSON.stringify(entry) + '\n');
    }).catch((error) => console.error('save failed', error));
    return writing;
  }

  function broadcast() {
    for (const res of streams) res.write(`data: ${version}\n\n`);
  }

  function viewFor(role, owner) {
    return role === 'smith' ? state : customerView(state, owner);
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  }

  async function readBody(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw Object.assign(Error('too large'), { status: 413 });
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  function limited(key) {
    const now = Date.now();
    const recent = (rate.get(key) || []).filter((time) => now - time < 60000);
    recent.push(now);
    rate.set(key, recent);
    return recent.length > 40;
  }

  async function handleAction(req, res, role, owner) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (role === 'customer' && limited(`${owner}|${ip}`)) return send(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
    let action;
    try {
      action = await readBody(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.status === 413 ? 'The photo is too large.' : 'Invalid request.' });
    }
    const replyKey = typeof action?.requestId === 'string' ? `${role}|${owner}|${action.requestId}` : null;
    if (replyKey && replies.has(replyKey)) return send(res, 200, { ...replies.get(replyKey), shared: viewFor(role, owner), version });
    const at = new Date().toISOString();
    const outcome = applyAction(builtInCatalog, state, action, { role, owner, at });
    if (outcome.error) return send(res, 200, { error: outcome.error, shared: viewFor(role, owner), version });
    state = outcome.state;
    version += 1;
    const reply = { ok: true, result: outcome.result };
    if (replyKey) {
      replies.set(replyKey, reply);
      if (replies.size > 1000) replies.delete(replies.keys().next().value);
    }
    await persist({ at, role, type: action.type, orderId: outcome.result.orderId ?? action.id ?? null });
    broadcast();
    return send(res, 200, { ...reply, shared: viewFor(role, owner), version });
  }

  async function serveFile(res, urlPath, role) {
    const page = role === 'smith' ? 'forge.html' : 'index.html';
    const isPage = urlPath === '/' || urlPath === `/${page}`;
    if (!isPage && !STATIC_DIRS.some((dir) => urlPath.startsWith(dir))) return send(res, 404, { error: 'Not found.' });
    const file = path.join(ROOT, isPage ? page : urlPath);
    if (!file.startsWith(ROOT + path.sep)) return send(res, 404, { error: 'Not found.' });
    try {
      let body = await readFile(file);
      if (isPage) {
        const other = role === 'smith' ? ` data-other-app="${shopUrl}"` : '';
        body = Buffer.from(body.toString('utf8').replace('<body>', `<body data-sync="server"${other}>`));
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': isPage || file.endsWith('.js') || file.endsWith('.css') ? 'no-cache' : 'public, max-age=3600', 'x-content-type-options': 'nosniff', ...(role === 'smith' ? { 'x-robots-tag': 'noindex' } : {}) });
      res.end(body);
    } catch {
      send(res, 404, { error: 'Not found.' });
    }
  }

  function handler(role) {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const client = req.headers['x-birdforge-client'];
      const owner = role === 'customer' ? (CLIENT_PATTERN.test(client || '') ? client : null) : null;
      try {
        if (url.pathname === '/api/health') return send(res, 200, { ok: true, version });
        if (url.pathname === '/api/events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
          res.write(`retry: 3000\ndata: ${version}\n\n`);
          streams.add(res);
          req.on('close', () => streams.delete(res));
          return;
        }
        if (url.pathname.startsWith('/api/') && role === 'customer' && !owner) return send(res, 400, { error: 'Missing device ID.' });
        if (url.pathname === '/api/state' && req.method === 'GET') return send(res, 200, { shared: viewFor(role, owner), version });
        if (url.pathname === '/api/actions' && req.method === 'POST') return handleAction(req, res, role, owner);
        if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
        return serveFile(res, url.pathname, role);
      } catch (error) {
        console.error(error);
        if (!res.headersSent) send(res, 500, { error: 'Server error.' });
      }
    };
  }

  const heartbeat = setInterval(() => { for (const res of streams) res.write(': ping\n\n'); }, 20000);
  const publicServer = http.createServer(handler('customer'));
  const adminServer = http.createServer(handler('smith'));
  const ready = Promise.all([
    new Promise((resolve) => {
      if (!publicSocket) return publicServer.listen(publicPort, publicHost, resolve);
      rmSync(publicSocket, { force: true });
      publicServer.listen(publicSocket, () => {
        chmodSync(publicSocket, 0o666);
        resolve();
      });
    }),
    new Promise((resolve) => adminServer.listen(adminPort, adminHost, resolve)),
  ]);

  return {
    ready,
    publicAddress: () => publicServer.address(),
    adminAddress: () => adminServer.address(),
    getState: () => structuredClone(state),
    async close() {
      clearInterval(heartbeat);
      for (const res of streams) res.end();
      await Promise.all([new Promise((resolve) => publicServer.close(resolve)), new Promise((resolve) => adminServer.close(resolve))]);
      await writing;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startServer();
  server.ready.then(() => {
    const pub = server.publicAddress();
    const admin = server.adminAddress();
    console.log(typeof pub === 'string' ? `Customer shop socket: ${pub}` : `Customer shop: http://${pub.address}:${pub.port}/`);
    console.log(`Gunter's workshop: http://${admin.address}:${admin.port}/`);
  });
  const stop = () => server.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
