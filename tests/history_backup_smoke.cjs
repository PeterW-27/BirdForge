const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

async function run() {
  const root = path.resolve(__dirname, '..');
  const core = await import(pathToFileURL(path.join(root, 'src/domain/core.js')));
  const { builtInCatalog: catalog } = await import(pathToFileURL(path.join(root, 'src/data/catalog.js')));
  const { createBackup } = await import(pathToFileURL(path.join(root, 'src/domain/backup.js')));
  const seed = core.placeCartOrder(catalog, { ...core.makeState(), cart: { 'sword-short': 2 } },
    { name: 'Test Buyer', email: 'buyer@example.com' }, 'GF-0001', '2026-10-20T10:00:00.000Z').state;
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE, headless: true } : { headless: true });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const entry of ['index.html', 'dist/Birdforge_V6_1_Standalone.html']) {
      const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1350, height: 900 } });
      await context.addInitScript(() => {
        Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
        Object.defineProperty(navigator, 'canShare', { value: () => false });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/${entry}`);
      await page.evaluate((state) => localStorage.setItem('gunters-forge-v54-demo', JSON.stringify(state)), seed);
      await page.reload();
      const nav = async (view) => page.locator(`[data-view="${view}"]:visible`).first().click();
      const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('gunters-forge-v54-demo')));
      await nav('admin');
      await page.locator('select[data-action="status"]').selectOption('Processing');
      assert.equal((await saved()).orders[0].statusHistory.length, 2);
      await nav('tickets');
      await page.locator('[data-action="ticket-complete"]').click();
      assert.equal((await saved()).orders[0].status, 'Delivering');
      await nav('orders');
      await page.locator('.status-history summary').click();
      assert.equal(await page.locator('.status-history li').count(), 3);
      await nav('admin');
      const downloadPromise = page.waitForEvent('download');
      await page.locator('[data-action="export-backup"]').click();
      await page.locator('[data-action="save-backup"]').click();
      const download = await downloadPromise;
      const content = fs.readFileSync(await download.path(), 'utf8');
      assert.equal(JSON.parse(content).state.orders[0].statusHistory.length, 3);
      const upload = async (text, decision) => {
        if (decision !== undefined) page.once('dialog', (dialog) => decision ? dialog.accept() : dialog.dismiss());
        await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
        await page.waitForFunction(() => document.querySelector('#toast-root').textContent.length > 0);
      };
      await upload('{invalid');
      await page.waitForFunction(() => document.querySelector('#toast-root').textContent.includes('not valid JSON'));
      assert.equal((await saved()).orders[0].status, 'Delivering');
      const empty = createBackup(core.makeState(), catalog);
      await upload(empty, false);
      assert.equal((await saved()).orders.length, 1);
      await upload(empty, true);
      await page.waitForFunction(() => document.querySelector('#toast-root').textContent === 'Backup restored.');
      assert.equal((await saved()).orders.length, 0);
      await upload(content, true);
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('gunters-forge-v54-demo')).orders.length === 1);
      assert.equal((await saved()).orders[0].statusHistory.length, 3);
      await page.reload();
      await nav('admin');
      await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error('QuotaExceededError'); }; });
      await upload(empty, true);
      await page.waitForFunction(() => document.querySelector('#toast-root').textContent.includes('could not save'));
      assert.equal((await saved()).orders.length, 1);
      assert.match(await page.locator('#toast-root').innerText(), /could not save/);
      await page.reload();
      await nav('admin');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.locator('.footer-data-actions button').count(), 2);
      await page.locator('.site-footer').screenshot({ path: path.join(root, '..', 'backup-mobile.png') });
      await nav('shop');
      await nav('orders');
      await page.locator('.status-history summary').click();
      await page.locator('.order-card').screenshot({ path: path.join(root, '..', 'history-mobile.png') });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      console.log(`PASS ${entry}: history, footer buttons, export, invalid input, confirmation/cancel, replacement, reload, failed save and mobile layout`);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
