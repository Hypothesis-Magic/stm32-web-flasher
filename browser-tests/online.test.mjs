import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { accessKey, storageKey, first, second, manifest, hex, encrypt, response } from '../tests/fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const mockStlink = `export const FILTERS = []; export class Stlink {
  constructor(device) { this.device = device; this.version = 'TEST'; }
  async open() {} async halt() {} async close() {}
}`;
const mockProgrammer = `export const rdpLevel = () => 0; export async function identify() { return { id: 0x466, size: 64, rdp: 0, options: 0x100aa }; }
export async function program(link, image, { update }) {
  window.programmed = image.data.get(0x08000008);
  update('燒錄中', 10);
  await new Promise(resolve => { window.finishProgramming = resolve; });
  update('燒錄與驗證完成，晶片已重啟', 100);
}`;

test('online firmware in a real browser, with simulated USB only', { timeout: 120000 }, async t => {
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.startsWith('/firmware-downloads/protected/')) {
        const reply = response(pathname);
        res.writeHead(reply.status, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(Buffer.from(await reply.arrayBuffer())); return;
      }
      if (pathname === '/firmware-downloads/') { res.end('<!doctype html><title>Test downloads</title>'); return; }
      const file = pathname === '/stm32-web-flasher/' ? 'index.html' : pathname.replace('/stm32-web-flasher/', '');
      if (!/^[a-z0-9-]+\.(html|mjs|css)$/.test(file)) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(await readFile(new URL(file, root)));
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const open = async ({ key = accessKey, blockedStorage = false, catalog = manifest } = {}) => {
      const context = await browser.newContext({ locale: 'en-US' });
      await context.addInitScript(({ blockedStorage }) => {
        window.usbRequests = 0;
        Object.defineProperty(navigator, 'usb', { value: {
          requestDevice: async () => { window.usbRequests++; return {}; }, addEventListener() {}
        } });
        if (blockedStorage) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      }, { blockedStorage });
      if (key && !blockedStorage) {
        const seed = await context.newPage(); await seed.goto(origin + '/firmware-downloads/');
        await seed.evaluate(({ storageKey, key }) => localStorage.setItem(storageKey, key), { storageKey, key });
        await seed.close();
      }
      const page = await context.newPage(), requests = [], errors = [];
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.url().includes('/protected/')) requests.push(request); });
      await page.route('**/stlink.mjs', route => route.fulfill({ contentType: 'text/javascript', body: mockStlink }));
      await page.route('**/programmer.mjs', route => route.fulfill({ contentType: 'text/javascript', body: mockProgrammer }));
      await page.route('**/protected/manifest.enc', route => route.fulfill({ contentType: 'application/octet-stream', body: encrypt('manifest', Buffer.from(JSON.stringify(catalog))) }));
      await page.goto(origin + '/stm32-web-flasher/');
      await page.waitForFunction(() => document.documentElement.lang === 'en').catch(error => { throw new Error(errors.join('\n') || error.message); });
      return { context, page, requests, errors };
    };
    const choose = async (page, version = '1.2', id = first.id) => {
      await page.selectOption('#online-project', 'alpha');
      await page.selectOption('#online-version', version);
      await page.selectOption('#online-file', id);
    };
    const loaded = page => page.waitForFunction(() => document.getElementById('file-status').textContent === 'HEX validation passed');

    await t.test('auto unlock, lazy file download, language switch and explicit flash', async () => {
      const { context, page, requests, errors } = await open();
      try {
        await page.waitForSelector('#online-choices', { state: 'visible' });
        assert.equal(await page.inputValue('#firmware-source'), 'online');
        assert.equal(requests.length, 1);
        assert.equal(await page.evaluate(() => window.usbRequests), 0);
        await choose(page); await loaded(page);
        assert.equal(requests.length, 2); assert.equal(await page.textContent('#file-name'), first.downloadName);
        assert(await page.isDisabled('#flash'));
        assert.deepEqual(await page.locator('#online-version option').evaluateAll(nodes => nodes.map(n => n.value)), ['', '1.10', '1.2']);
        await page.selectOption('#online-version', '1.10');
        assert.equal(await page.textContent('#file-name'), '—');
        assert.deepEqual(await page.locator('#online-file option').evaluateAll(nodes => nodes.map(n => n.value)), ['', second.id]);
        await page.selectOption('#online-file', second.id); await loaded(page);
        await page.selectOption('#language', 'zh-Hant');
        assert.equal(await page.textContent('#file-status'), 'HEX 檢查通過');
        assert.equal(await page.locator('#online-project option:checked').textContent(), '甲板專案');
        assert.equal(await page.inputValue('#online-file'), second.id);
        await mkdir(new URL('test-results/', root), { recursive: true });
        await page.screenshot({ path: new URL('test-results/online-desktop.png', root).pathname, fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: new URL('test-results/online-mobile.png', root).pathname, fullPage: true });
        await page.selectOption('#language', 'en');
        await page.click('#connect');
        await page.waitForFunction(() => !document.getElementById('flash').disabled);
        await page.click('#flash');
        await page.waitForFunction(() => window.programmed === 2);
        for (const id of ['firmware-source', 'online-project', 'online-version', 'online-file', 'online-retry', 'online-refresh', 'firmware']) assert(await page.isDisabled('#' + id));
        // Forget on another same-origin page while writing: let the active snapshot finish.
        const other = await context.newPage(); await other.goto(origin + '/firmware-downloads/');
        await other.evaluate(key => localStorage.removeItem(key), storageKey);
        await page.waitForFunction(() => document.getElementById('file-name').textContent === '—');
        assert.equal(await page.evaluate(() => window.programmed), 2);
        await page.evaluate(() => window.finishProgramming());
        await page.waitForFunction(() => !document.getElementById('firmware-source').disabled);
        assert(await page.isDisabled('#flash'));
        assert.equal(await page.locator('#progress').evaluate(node => node.value), 100);
        assert.equal(await page.evaluate(() => window.usbRequests), 1);
        for (const request of requests) {
          assert(!request.url().includes(accessKey)); assert.equal(request.postData(), null);
          assert.equal(request.headers().authorization, undefined);
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });

    await t.test('no key or blocked storage makes no catalog requests and local files still work', async () => {
      for (const blockedStorage of [false, true]) {
        const { context, page, requests, errors } = await open({ key: null, blockedStorage });
        try {
          assert.equal(await page.inputValue('#firmware-source'), 'local'); assert.equal(requests.length, 0);
          await page.setInputFiles('#firmware', { name: 'local.hex', mimeType: 'text/plain', buffer: Buffer.from(hex(1)) });
          await loaded(page); assert.equal(await page.textContent('#file-name'), 'local.hex');
          await page.selectOption('#firmware-source', 'online');
          assert.equal(await page.textContent('#file-name'), '—');
          assert.match(await page.textContent('#online-status'), blockedStorage ? /Saved key is unavailable/ : /No saved key/);
          assert.equal(requests.length, 0); assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    });

    await t.test('wrong key can be replaced from Downloads; clearing storage removes online input', async () => {
      const { context, page } = await open({ key: 'HMF1-' + randomBytes(32).toString('base64url') });
      try {
        await page.waitForFunction(() => document.getElementById('online-status').textContent.includes('Could not unlock'));
        assert(await page.isHidden('#online-choices'));
        const other = await context.newPage(); await other.goto(origin + '/firmware-downloads/');
        await other.evaluate(({ storageKey, accessKey }) => localStorage.setItem(storageKey, accessKey), { storageKey, accessKey });
        await choose(page); await loaded(page);
        await other.evaluate(() => localStorage.clear());
        await page.waitForFunction(() => document.getElementById('online-status').textContent.includes('No saved key'));
        assert.equal(await page.textContent('#file-name'), '—'); assert(await page.isDisabled('#flash'));
      } finally { await context.close(); }
    });

    await t.test('tampered files never become flashable; retry recovers', async () => {
      const { context, page } = await open();
      try {
        const pattern = '**/' + first.id + '.enc';
        await page.route(pattern, route => route.fulfill({ contentType: 'application/octet-stream', body: Buffer.alloc(first.bytes + 33) }));
        await choose(page);
        await page.waitForFunction(() => document.getElementById('file-status').textContent.includes('integrity verification failed'));
        assert.equal(await page.textContent('#file-size'), '—'); assert(await page.isDisabled('#flash'));
        await page.unroute(pattern); await page.click('#online-retry'); await loaded(page);
      } finally { await context.close(); }
    });

    await t.test('changing selection or source discards late downloads', async () => {
      const { context, page } = await open();
      try {
        let release, seen;
        const started = new Promise(resolve => { seen = resolve; });
        await page.route('**/' + first.id + '.enc', async route => {
          seen(); await new Promise(resolve => { release = resolve; });
          await route.fulfill({ contentType: 'application/octet-stream', body: encrypt('blob/' + first.id, Buffer.from(hex(1))) }).catch(() => {});
        });
        await choose(page); await started;
        await page.selectOption('#online-version', '1.10'); await page.selectOption('#online-file', second.id); await loaded(page);
        release(); await page.waitForLoadState('networkidle');
        assert.equal(await page.textContent('#file-name'), second.downloadName);
        await page.selectOption('#firmware-source', 'local');
        assert.equal(await page.textContent('#file-name'), '—');
        await page.setInputFiles('#firmware', { name: 'local.hex', mimeType: 'text/plain', buffer: Buffer.from(hex(1)) }); await loaded(page);
        await page.selectOption('#firmware-source', 'online');
        assert.equal(await page.textContent('#file-name'), '—');
        assert(await page.isDisabled('#flash'));
      } finally { await context.close(); }
    });

    await t.test('empty catalog remains usable', async () => {
      const { context, page } = await open({ catalog: { version: 1, projects: [] } });
      try {
        await page.waitForFunction(() => document.getElementById('online-status').textContent.includes('No HEX files'));
        assert(await page.isHidden('#online-choices')); assert(!(await page.isDisabled('#online-refresh')));
      } finally { await context.close(); }
    });
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
