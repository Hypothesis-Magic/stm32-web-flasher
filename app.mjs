import { parseHex, validateImage, addressText } from './hex.mjs';
import { Stlink, FILTERS } from './stlink.mjs';
import { identify, program } from './programmer.mjs';

const $ = id => document.getElementById(id);
// Each selectable chip must provide its own parser/validator and programmer.
// Only the implemented G031 profile is exposed in this version.
const targets = new Map([
  ['stm32g031g8u6', { parseHex, validateImage, identify, program, pageCount: 32 }]
]);
function selectedTarget() {
  const target = targets.get($('target').value);
  if (!target) throw new Error('請選擇目前支援的晶片型號。');
  return target;
}
let link = null, image = null, busy = false, fileReading = false;
const supported = window.isSecureContext && 'usb' in navigator;
function log(message) {
  $('log').textContent += `${new Date().toLocaleTimeString()}  ${message}\n`;
  $('log').scrollTop = $('log').scrollHeight;
}
function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
  log(message);
}
function ready() {
  let valid = false;
  try { if (image) { selectedTarget().validateImage(image, $('preserve').checked); valid = true; } } catch {}
  $('target').disabled = busy || fileReading || !!link;
  $('connect').disabled = !supported || busy || !!link || !targets.has($('target').value);
  $('disconnect').disabled = busy || !link;
  $('firmware').disabled = busy;
  $('preserve').disabled = busy || fileReading;
  $('flash').disabled = busy || fileReading || !link || !valid;
}
function showImage() {
  $('file-status').classList.remove('error');
  if (!image) {
    for (const id of ['file-size', 'file-range', 'file-pages']) $(id).textContent = '—';
    return;
  }
  $('file-size').textContent = `${image.size.toLocaleString()} bytes`;
  $('file-range').textContent = `${addressText(image.start)} – ${addressText(image.end)}`;
  try {
    const target = selectedTarget();
    $('file-pages').textContent = `${image.pages.length} / ${target.pageCount}`;
    target.validateImage(image, $('preserve').checked);
    $('file-status').textContent = 'HEX 格式、checksum 與向量表檢查通過。';
  } catch (error) {
    $('file-status').textContent = error.message;
    $('file-status').classList.add('error');
  }
}
function describeConnectionError(error) {
  if (error.name === 'NotFoundError') return '已取消選擇裝置。';
  if (['NetworkError', 'SecurityError', 'NotAllowedError'].includes(error.name)) return `${error.message} 請關閉其他使用 ST-LINK 的程式；Windows 請確認 ST-LINK 使用 WinUSB 驅動。`;
  return error.message;
}
async function closeLink() {
  const old = link; link = null;
  if (old) { try { await old.close(); } catch (e) { log(`關閉連線：${e.message}`); } }
  $('device').textContent = '尚未連線'; $('probe').textContent = '—';
}
$('compatibility').textContent = supported
  ? 'WebUSB 已就緒。macOS 通常可直接連線；Windows 11 需相容的 WinUSB 驅動。'
  : '此瀏覽器無法使用 WebUSB。請用桌面版 Chrome／Edge，從 HTTPS 或 localhost 開啟。';
if (!supported) $('compatibility').classList.add('error');
$('connect').addEventListener('click', async () => {
  if (busy) return;
  busy = true; ready();
  let candidate;
  try {
    const target = selectedTarget();
    // Keep requestDevice directly within the user gesture.
    const device = await navigator.usb.requestDevice({ filters: FILTERS });
    candidate = new Stlink(device);
    await candidate.open();
    const info = await target.identify(candidate);
    await candidate.halt();
    link = candidate;
    $('device').textContent = `已連線並暫停 · ID ${addressText(info.id)} · ${info.size} KB`;
    $('probe').textContent = candidate.version;
    status('晶片檢查通過。選擇 HEX 後即可燒錄。');
  } catch (error) {
    if (candidate) { try { await candidate.close(); } catch {} }
    status(describeConnectionError(error), error.name !== 'NotFoundError');
  } finally { busy = false; ready(); }
});
$('disconnect').addEventListener('click', async () => {
  busy = true; ready();
  try { await closeLink(); status('已中斷連線。晶片維持暫停；需要執行時請重置目標板。'); }
  finally { busy = false; ready(); }
});
let fileGeneration = 0;
$('firmware').addEventListener('change', async () => {
  const generation = ++fileGeneration;
  image = null; fileReading = true; showImage(); ready(); $('progress').value = 0;
  const file = $('firmware').files[0];
  try {
    if (!file) { $('file-status').textContent = '尚未選擇檔案'; return; }
    if (!/\.hex$/i.test(file.name)) throw new Error('請選擇 .hex 檔案。');
    if (file.size > 2 * 1024 * 1024) throw new Error('HEX 檔案超過 2 MB 上限。');
    const text = await file.text();
    if (generation !== fileGeneration) return;
    image = selectedTarget().parseHex(text); showImage();
    log(`已讀取 ${file.name}：${image.size} bytes，${image.pages.length} 頁。`);
  } catch (error) {
    if (generation !== fileGeneration) return;
    $('file-status').textContent = error.message; $('file-status').classList.add('error');
  } finally { if (generation === fileGeneration) { fileReading = false; ready(); } }
});
$('preserve').addEventListener('change', () => { showImage(); ready(); });
$('target').addEventListener('change', () => {
  // A file validated against one profile must not carry into another profile.
  image = null; $('firmware').value = ''; $('progress').value = 0;
  $('file-status').textContent = '尚未選擇檔案';
  showImage(); ready();
});
$('flash').addEventListener('click', async () => {
  if (busy || fileReading || !link || !image) return;
  busy = true; ready(); $('progress').value = 0;
  try {
    await selectedTarget().program(link, image, { preserveSettings: $('preserve').checked, update: (message, value) => {
      status(message); $('progress').value = value;
    } });
  } catch (error) {
    if (link && !link.broken) { try { await link.halt(); } catch {} }
    status(`${error.message} 燒錄未完成，請重新連接後再試；請勿依賴目前韌體內容。`, true);
  } finally { await closeLink(); busy = false; ready(); }
});
navigator.usb?.addEventListener('disconnect', event => {
  if (link?.device === event.device) {
    link.broken = true;
    $('device').textContent = 'USB 已拔除';
    if (!busy) { link = null; status('ST-LINK 已拔除，請重新連接。', true); ready(); }
  }
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
// Optional read-only WebMCP status surface; flashing remains a physical user's
// button action. Unsupported browsers need no extension or installation.
try {
  Promise.resolve(document.modelContext?.registerTool({
    name: 'read_flasher_status', description: 'Read current connection, selected HEX summary, and programming status. Does not access USB or program the device.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: input => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
      return { connected: !!link, busy, file: image ? { size: image.size, pages: image.pages.length } : null, status: $('status').textContent };
    }
  })).catch(() => {});
} catch { /* Optional API must never block the hardware UI. */ }
ready();
