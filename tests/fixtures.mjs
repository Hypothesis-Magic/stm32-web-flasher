import { randomBytes, createCipheriv, hkdfSync, createHash } from 'node:crypto';

// Ephemeral test keys only; never read the real vault config or browser profile.
export const rawKey = randomBytes(32);
export const accessKey = 'HMF1-' + rawKey.toString('base64url');
export const storageKey = 'hmf-access-key:v1:/firmware-downloads/';
function record(address, type, data) {
  const bytes = [data.length, address >> 8, address & 255, type, ...data];
  bytes.push((-bytes.reduce((a, b) => a + b, 0)) & 255);
  return ':' + Buffer.from(bytes).toString('hex').toUpperCase();
}
export const hex = value => [record(0, 4, [8, 0]), record(0, 0, [0, 32, 0, 32, 9, 0, 0, 8, value, 0, 0, 0]), record(0, 1, [])].join('\n');
export function file(id, name, content) {
  return { id: id.repeat(64), name: { en: name, 'zh-TW': name }, downloadName: name,
    bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') };
}
export const first = file('a', 'first.hex', hex(1));
export const second = file('b', 'second.hex', hex(2));
export const binary = file('c', 'other.bin', 'binary');
export const oversized = { ...file('d', 'large.hex', ''), bytes: 2 * 1024 * 1024 + 1 };
export const manifest = { version: 1, projects: [
  { id: 'alpha', name: { en: 'Alpha board', 'zh-TW': '甲板專案' }, releases: [
    { version: '1.2', files: [first] }, { version: '1.10', files: [second, binary, oversized] }
  ] }
] };
export function encrypt(context, plain, raw = rawKey) {
  const magic = Buffer.from([72, 77, 70, 87, 1]), iv = randomBytes(12), domain = 'Hypothesis-Magic/firmware/v1/';
  const key = Buffer.from(hkdfSync('sha256', raw, Buffer.from(domain), Buffer.from(context), 32));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.concat([magic, Buffer.from(domain + context)]));
  return Buffer.concat([magic, iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}
export function response(path, catalog = manifest) {
  if (String(path).endsWith('manifest.enc')) return new Response(encrypt('manifest', Buffer.from(JSON.stringify(catalog))));
  const id = String(path).split('/').at(-1).replace('.enc', '');
  if (![first.id, second.id].includes(id)) return new Response('', { status: 404 });
  return new Response(encrypt('blob/' + id, Buffer.from(hex(id === first.id ? 1 : 2))));
}
