import { parseHex, validateImage, addressText } from './hex.mjs';
import { Stlink, FILTERS } from './stlink.mjs';
import { identify, program } from './programmer.mjs';
import { setRdp, rdpConfirmation } from './rdp.mjs';
import { createI18n } from './i18n.mjs';

const $ = id => document.getElementById(id);
let languageStorage;
try { languageStorage = window.localStorage; } catch {}
const i18n = createI18n(document, navigator, languageStorage);
const setText = (node, message) => i18n.setText(node, message);
const logEntries = [];
// Each selectable chip must provide its own parser/validator and programmer.
// Only the implemented G031 profile is exposed in this version.
const targets = new Map([
  ['stm32g031g8u6', { parseHex, validateImage, identify, program, setRdp, pageCount: 32 }]
]);
function selectedTarget() {
  const target = targets.get($('target').value);
  if (!target) throw new Error('請選擇目前支援的晶片型號');
  return target;
}
let link = null, deviceInfo = null, image = null, busy = false, fileReading = false;
let powerCycleRequired = false;
try { powerCycleRequired = sessionStorage.getItem('rdp-power-cycle') === 'yes'; } catch {}
function requirePowerCycle(value) {
  powerCycleRequired = value;
  try { sessionStorage.setItem('rdp-power-cycle', value ? 'yes' : 'no'); } catch {}
}
const supported = window.isSecureContext && 'usb' in navigator;
function log(message) {
  logEntries.push({ time: new Date(), message });
  renderLog();
}
function renderLog() {
  $('log').textContent = logEntries.map(entry => `${entry.time.toLocaleTimeString(i18n.language)}  ${i18n.text(entry.message)}\n`).join('');
  $('log').scrollTop = $('log').scrollHeight;
}
function status(message, error = false) {
  setText($('status'), message);
  $('status').classList.toggle('error', error);
  log(message);
}
function ready() {
  $('language').disabled = busy;
  let valid = false;
  try { if (image) { selectedTarget().validateImage(image, $('preserve').checked); valid = true; } } catch {}
  $('target').disabled = busy || fileReading || !!link;
  $('connect').disabled = !supported || busy || !!link || !targets.has($('target').value);
  $('disconnect').disabled = busy || !link;
  $('firmware').disabled = busy;
  $('preserve').disabled = busy || fileReading;
  $('flash').disabled = busy || fileReading || !link || link.broken || deviceInfo?.rdp !== 0 || !valid;
  $('rdp-level').disabled = busy;
  $('rdp-apply').disabled = busy || !link || link.broken || !deviceInfo || deviceInfo.rdp === 2 || Number($('rdp-level').value) === deviceInfo.rdp;
}
function showImage() {
  $('file-status').classList.remove('error');
  if (!image) {
    for (const id of ['file-size', 'file-range', 'file-pages']) setText($(id), '—');
    return;
  }
  setText($('file-size'), `${image.size.toLocaleString()} bytes`);
  setText($('file-range'), `${addressText(image.start)} – ${addressText(image.end)}`);
  try {
    const target = selectedTarget();
    setText($('file-pages'), `${image.pages.length} / ${target.pageCount}`);
    target.validateImage(image, $('preserve').checked);
    setText($('file-status'), 'HEX 檢查通過');
  } catch (error) {
    setText($('file-status'), error.message);
    $('file-status').classList.add('error');
  }
}
function describeConnectionError(error) {
  if (error.name === 'NotFoundError') return '已取消選擇裝置';
  if (['NetworkError', 'SecurityError', 'NotAllowedError'].includes(error.name)) return `${error.message} 請關閉其他使用 ST-LINK 的程式；Windows 請確認 ST-LINK 使用 WinUSB 驅動`;
  return error.message;
}
async function closeLink() {
  const old = link; link = null; deviceInfo = null;
  if (old) { try { await old.close(); } catch (e) { log(`關閉連線：${e.message}`); } }
  setText($('device'), '未連線'); setText($('chip-state'), '未知'); setText($('probe'), '—');
  setText($('rdp-current'), '—');
}
if (!supported) {
  $('compatibility').hidden = false;
  setText($('compatibility'), '無法使用 WebUSB，請用 Chrome／Edge 開啟 HTTPS 網址');
  $('compatibility').classList.add('error');
}
$('connect').addEventListener('click', async () => {
  if (busy) return;
  if (powerCycleRequired) {
    if (!window.confirm(i18n.text('上次曾寫入 RDP\n請先將目標板所有電源完全斷開再重新上電，不是只重插 ST-LINK\n\n已完成重新上電？'))) return;
    requirePowerCycle(false);
  }
  busy = true; ready();
  let candidate;
  try {
    const target = selectedTarget();
    setText($('device'), '等待選擇裝置');
    // Keep requestDevice directly within the user gesture.
    const device = await navigator.usb.requestDevice({ filters: FILTERS });
    setText($('device'), '連線中');
    candidate = new Stlink(device);
    await candidate.open();
    const info = await target.identify(candidate);
    await candidate.halt();
    link = candidate;
    deviceInfo = info;
    setText($('device'), '已連線');
    setText($('chip-state'), '暫停');
    setText($('probe'), candidate.version);
    setText($('rdp-current'), `RDP ${info.rdp}`);
    // The requested setting defaults off; actual protection is shown separately.
    $('rdp-level').value = '0'; showRdpHint();
    $('rdp-result').hidden = true;
    log(`晶片 ID ${addressText(info.id)} · ${info.size} KB`);
    status(info.rdp === 0 ? '晶片檢查通過' : `RDP ${info.rdp} · 無法燒錄韌體`);
  } catch (error) {
    if (candidate) { try { await candidate.close(); } catch {} }
    setText($('device'), '未連線'); setText($('chip-state'), '未知');
    status(describeConnectionError(error), error.name !== 'NotFoundError');
  } finally { busy = false; ready(); }
  // Connecting an RDP1 target intentionally starts regression and mass erase.
  if (link && !link.broken && deviceInfo?.rdp === 1) await applyRdp(0);
});
$('disconnect').addEventListener('click', async () => {
  busy = true; ready();
  try { await closeLink(); status('已中斷連線'); }
  finally { busy = false; ready(); }
});
let fileGeneration = 0;
$('firmware').addEventListener('change', async () => {
  const generation = ++fileGeneration;
  image = null; fileReading = true; showImage(); ready(); $('progress').value = 0;
  const file = $('firmware').files[0];
  try {
    if (!file) { setText($('file-status'), '尚未選擇檔案'); return; }
    if (!/\.hex$/i.test(file.name)) throw new Error('請選擇 .hex 檔案');
    if (file.size > 2 * 1024 * 1024) throw new Error('HEX 檔案超過 2 MB 上限');
    const text = await file.text();
    if (generation !== fileGeneration) return;
    image = selectedTarget().parseHex(text); showImage();
    log(`已讀取 ${file.name}：${image.size} bytes，${image.pages.length} 頁`);
  } catch (error) {
    if (generation !== fileGeneration) return;
    setText($('file-status'), error.message); $('file-status').classList.add('error');
  } finally { if (generation === fileGeneration) { fileReading = false; ready(); } }
});
$('preserve').addEventListener('change', () => { showImage(); ready(); });
$('target').addEventListener('change', () => {
  // A file validated against one profile must not carry into another profile.
  image = null; $('firmware').value = ''; $('progress').value = 0;
  setText($('file-status'), '尚未選擇檔案');
  showImage(); ready();
});
function showRdpHint() {
  const next = Number($('rdp-level').value);
  setText($('rdp-hint'), next === 2
    ? '永久關閉 SWD／除錯，無法解除或再用 ST-LINK 燒錄'
    : next === 1 ? '阻止外部讀取 Flash，日後解除保護會清除內容'
      : 'RDP 1 降回 0 會清除 Flash，包含最後 4 KB');
  $('rdp-hint').classList.toggle('error', next === 2);
  $('rdp-apply').classList.toggle('danger', next === 2);
}
$('rdp-level').addEventListener('change', () => { showRdpHint(); ready(); });
function confirmRdp(current, next) {
  const phrase = rdpConfirmation(current, next), dialog = $('rdp-dialog');
  const displayedPhrase = i18n.text(phrase);
  setText($('rdp-title'), `RDP ${current} → RDP ${next}`);
  setText($('rdp-warning'), next === 2
    ? '永久鎖定晶片，無法降級或解除保護，ST-LINK 將無法再連線、燒錄或除錯，ST 原廠也無法恢復，請先確認韌體可正常運作'
    : next === 0 ? '將清除整個 Flash 與備份暫存器，包含韌體和最後 4 KB 設定，無法復原，「保護最後 4 KB」不適用於解除 RDP'
      : '將禁止外部讀取 Flash，ST-LINK 無法直接燒錄，日後降回 RDP 0 會清除韌體與設定');
  setText($('rdp-confirm-label'), `請輸入「${phrase}」`);
  $('rdp-ack').checked = false; $('rdp-confirm-text').value = '';
  $('rdp-confirm').disabled = true;
  setText($('rdp-confirm'), next === 2 ? '永久鎖定' : next === 0 ? '清除並解除保護' : '啟用保護');
  $('rdp-confirm').classList.toggle('danger', next !== 1);
  return new Promise(resolve => {
    const valid = () => $('rdp-ack').checked && $('rdp-confirm-text').value === displayedPhrase;
    const refresh = () => { $('rdp-confirm').disabled = !valid(); };
    $('rdp-ack').onchange = refresh; $('rdp-confirm-text').oninput = refresh;
    $('rdp-cancel').onclick = () => dialog.close('cancel');
    $('rdp-confirm').onclick = () => { if (valid()) dialog.close('confirm'); };
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' && valid() ? phrase : null), { once: true });
    dialog.returnValue = ''; dialog.showModal();
  });
}
async function applyRdp(next) {
  if (busy || !link || link.broken || !deviceInfo) return;
  const activeLink = link, expectedOptions = deviceInfo.options;
  busy = true; ready();
  let attempted = false;
  try {
    // Only permanent level 2 needs another UI confirmation. Levels 0/1 are
    // authorized by Apply, or by connecting a protected target for regression.
    const confirmation = next === 2
      ? await confirmRdp(deviceInfo.rdp, next)
      : rdpConfirmation(deviceInfo.rdp, next);
    if (!confirmation) return;
    if (activeLink.broken) throw new Error('ST-LINK 已中斷，請重新連接');
    attempted = true;
    await selectedTarget().setRdp(activeLink, next, { expectedOptions, confirmation, update: message => {
      // Persist before the first option write, including an interrupted transfer.
      if (message.startsWith('寫入 RDP')) requirePowerCycle(true);
      setText($('chip-state'), '設定 RDP 中'); status(message);
    } });
    setText($('rdp-result'), `RDP ${next} 設定已寫入，請將目標板完全斷電再上電${next === 2 ? '，生效後 ST-LINK 將無法連線' : '，再連線確認保護等級'}`);
    $('rdp-result').hidden = false;
    $('rdp-result').classList.remove('error');
    status('RDP 設定已寫入，等待重新上電');
  } catch (error) {
    const message = `${error.message}${activeLink.optionWriteAttempted ? '，設定結果未確認，請重新上電後使用原廠工具檢查，勿直接重試' : ''}`;
    status(message, true);
    setText($('rdp-result'), message); $('rdp-result').hidden = false; $('rdp-result').classList.add('error');
  } finally {
    if (attempted || activeLink.broken) await closeLink();
    busy = false; ready();
  }
}
$('rdp-apply').addEventListener('click', () => applyRdp(Number($('rdp-level').value)));
$('flash').addEventListener('click', async () => {
  if (busy || fileReading || !link || !image) return;
  busy = true; ready(); $('progress').value = 0;
  try {
    await selectedTarget().program(link, image, { preserveSettings: $('preserve').checked, update: (message, value) => {
      status(message); $('progress').value = value;
      setText($('chip-state'), value === 100 ? '已重啟' : '燒錄中');
    } });
  } catch (error) {
    if (link && !link.broken) { try { await link.halt(); } catch {} }
    status(`${error.message} 燒錄未完成，請重新連接後再試；請勿依賴目前韌體內容`, true);
  } finally { await closeLink(); busy = false; ready(); }
});
navigator.usb?.addEventListener('disconnect', event => {
  if (link?.device === event.device) {
    link.broken = true;
    setText($('device'), 'USB 已拔除');
    setText($('chip-state'), '未知');
    setText($('rdp-current'), '—');
    if ($('rdp-dialog').open) $('rdp-dialog').close('cancel');
    if (!busy) { link = null; deviceInfo = null; status('ST-LINK 已拔除，請重新連接', true); ready(); }
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
$('language').addEventListener('change', () => {
  if (busy) return;
  i18n.change($('language').value);
  renderLog();
});
$('rdp-level').value = '0'; showRdpHint();
ready();
