import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { accessKey, storageKey, first, second, manifest, hex, encrypt, response, file } from '../tests/fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
function c071Hex() {
  const record = (address, kind, payload) => {
    const b = [payload.length, address >> 8, address & 255, kind, ...payload];
    b.push(-b.reduce((a, v) => a + v, 0) & 255);
    return ':' + Buffer.from(b).toString('hex');
  };
  return [record(0, 4, [8,0]), record(0, 0, [0,96,0,32,9,0,0,8,
    ...new TextEncoder().encode('YS2-DEV-DFU-v1-C071-62K\0')]), record(0,1,[])].join('\n');
}
const mockDfu = `export { DFU_FILTERS, validateC071Image } from './dfu.mjs?implementation';
export class RomDfu {
  constructor(device) { this.device=device; this.version='ROM DFU'; }
  async open() {} async close() {}
}
export async function identifyC071() { return {size:64, canProgram:true, rdp:null}; }
export async function programC071(link,image,{update}) {
  window.dfuProgrammed=true;
  update('燒錄與驗證完成，已送出重啟請求',100);
}`;

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
          requestDevice: async options => { window.usbRequests++; window.usbFilters=options.filters; return {}; }, addEventListener() {}
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
      await page.route('**/dfu.mjs', route => route.fulfill({ contentType: 'text/javascript', body: mockDfu }));
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

    await t.test('C071 ROM DFU profile, local/online HEX, preserved settings and explicit programming', async () => {
      const content=c071Hex(), firmware=file('e','Yang_Smoke_2_rc1.3.0.hex',content);
      const catalog={version:1,projects:[{id:'yang-smoke-new',name:{en:'Yang Smoke 2','zh-TW':'Yang Smoke 2'},
        releases:[{version:'1.3.0',files:[firmware]}]}]};
      const {context,page,errors}=await open({catalog});
      try {
        await page.route('**/'+firmware.id+'.enc', route=>route.fulfill({contentType:'application/octet-stream',body:encrypt('blob/'+firmware.id,Buffer.from(content))}));
        await page.selectOption('#target','stm32c071g8u6-dfu');
        assert(await page.isHidden('.option-bytes'));
        assert(await page.isDisabled('#preserve')); assert(await page.isChecked('#preserve'));
        assert.match(await page.textContent('#preserve-label'),/4 KB/);
        await page.selectOption('#firmware-source','local');
        await page.setInputFiles('#firmware',{name:'old.hex',mimeType:'text/plain',buffer:Buffer.from(hex(1))});
        await page.waitForFunction(()=>document.getElementById('file-status').classList.contains('error'));
        assert(await page.isDisabled('#flash'));
        await page.setInputFiles('#firmware',{name:'new.hex',mimeType:'text/plain',buffer:Buffer.from(content)});
        await loaded(page); assert.equal(await page.evaluate(()=>window.usbRequests),0);
        await page.selectOption('#firmware-source','online');
        await page.waitForSelector('#online-choices',{state:'visible'});
        await page.selectOption('#online-project','yang-smoke-new');
        await page.selectOption('#online-version','1.3.0'); await page.selectOption('#online-file',firmware.id);
        await loaded(page); assert(await page.isDisabled('#flash'));
        await page.selectOption('#language','zh-Hant');
        assert.match(await page.textContent('#connect'),/ROM DFU/);
        await page.click('#connect');
        assert.deepEqual(await page.evaluate(()=>window.usbFilters),[{vendorId:0x0483,productId:0xdf11}]);
        assert(await page.isEnabled('#flash')); assert.equal(await page.evaluate(()=>window.dfuProgrammed),undefined);
        await page.setViewportSize({width:390,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        await page.screenshot({path:new URL('test-results/dfu-mobile.png',root).pathname,fullPage:true});
        await page.setViewportSize({width:1200,height:900});
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        await page.screenshot({path:new URL('test-results/dfu-desktop.png',root).pathname,fullPage:true});
        await page.click('#flash'); await page.waitForFunction(()=>window.dfuProgrammed===true);
        await page.waitForFunction(()=>document.getElementById('status').textContent.includes('已送出重啟請求'));
        await page.selectOption('#target','stm32g031g8u6');
        assert(await page.isVisible('.option-bytes')); assert(await page.isEnabled('#preserve'));
        assert.equal(await page.textContent('#file-name'),'—'); assert.deepEqual(errors,[]);
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
