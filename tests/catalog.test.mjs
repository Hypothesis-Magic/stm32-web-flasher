import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { FirmwareCatalog, CATALOG_BASE, ACCESS_KEY_STORAGE } from '../catalog.mjs';
import { parseHex, validateImage } from '../hex.mjs';
import { accessKey, storageKey, first, second, manifest, hex, response, encrypt } from './fixtures.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test('unlocks publisher-compatible catalog, filters unsupported files and lazily verifies HEX', async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(url);
    assert(!url.includes(accessKey));
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    return response(url);
  };
  assert.equal(ACCESS_KEY_STORAGE, storageKey);
  const catalog = new FirmwareCatalog();
  const projects = await catalog.unlock(accessKey);
  assert.deepEqual(requests, [CATALOG_BASE + 'manifest.enc']);
  assert.deepEqual(projects[0].releases.map(r => r.files.map(f => f.downloadName)), [['first.hex'], ['second.hex']]);
  const text = await catalog.readHex(first.id);
  assert.equal(text, hex(1)); assert.equal(validateImage(parseHex(text)).size, 12);
  assert.equal(requests.length, 2);
  await assert.rejects(catalog.readHex('../secret'));
});
test('missing or wrong keys never unlock the catalog', async () => {
  let requests = 0;
  globalThis.fetch = async url => { requests++; return response(url); };
  const catalog = new FirmwareCatalog();
  await assert.rejects(catalog.unlock('invalid')); assert.equal(requests, 0);
  await assert.rejects(catalog.unlock('HMF1-' + randomBytes(32).toString('base64url')));
  await assert.rejects(catalog.readHex(first.id));
});
test('rejects blob tampering, context substitution, digest and length mismatches', async () => {
  const catalog = new FirmwareCatalog();
  globalThis.fetch = async url => response(url); await catalog.unlock(accessKey);
  const valid = encrypt('blob/' + first.id, Buffer.from(hex(1)));
  const tampered = valid.slice(); tampered[tampered.length - 1] ^= 1;
  for (const bytes of [tampered, encrypt('blob/' + second.id, Buffer.from(hex(1))),
    encrypt('blob/' + first.id, Buffer.from(hex(2))), encrypt('blob/' + first.id, Buffer.from('short'))]) {
    globalThis.fetch = async () => new Response(bytes);
    await assert.rejects(catalog.readHex(first.id));
  }
});
test('rejects malformed catalog and oversize or unavailable responses', async () => {
  const unsafe = structuredClone(manifest); unsafe.projects[0].releases[0].files[0].id = '../secret';
  const catalog = new FirmwareCatalog();
  globalThis.fetch = async url => response(url, unsafe); await assert.rejects(catalog.unlock(accessKey));
  globalThis.fetch = async () => new Response(new Uint8Array(1024 * 1024 + 34));
  await assert.rejects(catalog.unlock(accessKey));
  globalThis.fetch = async () => new Response('', { status: 404 }); await assert.rejects(catalog.unlock(accessKey));
  globalThis.fetch = async url => response(url); await catalog.unlock(accessKey);
  globalThis.fetch = async () => new Response(new Uint8Array(first.bytes + 34)); await assert.rejects(catalog.readHex(first.id));
});
test('reset invalidates pending unlock even when transport ignores abort', async () => {
  let release, started;
  const fetching = new Promise(resolve => { started = resolve; });
  globalThis.fetch = url => { started(); return new Promise(resolve => { release = () => resolve(response(url)); }); };
  const catalog = new FirmwareCatalog(), pending = catalog.unlock(accessKey);
  await fetching; catalog.reset(); release();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(catalog.readHex(first.id));
});
test('key changes or cancelled selection discard pending plaintext', async () => {
  for (const reset of [false, true]) {
    const catalog = new FirmwareCatalog();
    globalThis.fetch = async url => response(url); await catalog.unlock(accessKey);
    let release;
    globalThis.fetch = url => new Promise(resolve => { release = () => resolve(response(url)); });
    const controller = new AbortController();
    const pending = catalog.readHex(first.id, controller.signal);
    if (reset) catalog.reset(); else controller.abort();
    release(); await assert.rejects(pending, { name: 'AbortError' });
  }
});
