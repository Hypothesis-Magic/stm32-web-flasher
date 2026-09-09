import { ACCESS_KEY_STORAGE, FirmwareCatalog } from './catalog.mjs';

export function createOnlineFirmware({ document, window, i18n, isBusy, loadFirmware, clearFirmware, ready }) {
  const $ = id => document.getElementById(id);
  const catalog = new FirmwareCatalog();
  let projects = [], loading = false, generation = 0, download = new AbortController();
  const active = () => $('firmware-source').value === 'online';
  const savedKey = () => window.localStorage.getItem(ACCESS_KEY_STORAGE);
  const label = name => name[i18n.language === 'en' ? 'en' : 'zh-TW'];
  function status(message, error = false) {
    i18n.setText($('online-status'), message);
    $('online-status').classList.toggle('error', error);
  }
  function options(id, entries, placeholder) {
    const select = $(id), previous = select.value;
    const option = (value, text) => {
      const node = document.createElement('option');
      node.value = value; node.textContent = text;
      return node;
    };
    select.replaceChildren(option('', i18n.text(placeholder)), ...entries.map(([value, text]) => option(value, text)));
    select.value = entries.some(([value]) => value === previous) ? previous : '';
  }
  const project = () => projects.find(item => item.id === $('online-project').value);
  const release = () => project()?.releases.find(item => item.version === $('online-version').value);
  function render() {
    options('online-project', projects.map(item => [item.id, label(item.name)]), '選擇專案');
    const versions = [...(project()?.releases ?? [])].sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }));
    options('online-version', versions.map(item => [item.version, item.version]), '選擇版本');
    options('online-file', (release()?.files ?? []).map(file => [file.id, file.downloadName]), '選擇 HEX 檔案');
    $('online-choices').hidden = !projects.length;
    setBusy();
  }
  function setBusy() {
    const busy = isBusy();
    $('firmware-source').disabled = busy;
    $('online-refresh').disabled = busy || loading;
    $('online-project').disabled = busy || loading || !projects.length;
    $('online-version').disabled = busy || loading || !project();
    $('online-file').disabled = busy || loading || !release();
    $('online-retry').disabled = busy || loading || !$('online-file').value;
  }
  function cancelFile() {
    download.abort(); download = new AbortController();
    $('online-retry').hidden = true;
    if (active()) clearFirmware();
  }
  function reset() {
    generation++; catalog.reset(); projects = []; loading = false;
    cancelFile(); render();
  }
  async function refresh() {
    if (isBusy() || !active()) return;
    reset();
    const current = generation;
    let key;
    try { key = savedKey(); }
    catch { status('無法讀取已儲存的金鑰，請允許網站儲存或使用本機檔案', true); return; }
    if (!key) { status('尚未記住金鑰，請先到下載頁解鎖並記住 Access Key'); return; }
    if (!window.isSecureContext || !globalThis.crypto?.subtle) {
      status('線上韌體需要 HTTPS 與支援 Web Crypto 的瀏覽器', true); return;
    }
    loading = true; status('正在解鎖韌體清單…'); setBusy();
    try {
      const next = await catalog.unlock(key);
      if (current !== generation) return;
      projects = next;
      status(projects.length ? '已使用記住的金鑰解鎖，請選擇專案與版本' : '目前沒有可供此工具載入的 HEX 檔案');
    } catch {
      if (current === generation) status('無法解鎖清單，請確認金鑰、網路連線，或到下載頁更新金鑰後重試', true);
    } finally {
      key = null;
      if (current === generation) { loading = false; render(); }
    }
  }
  async function chooseFile() {
    if (isBusy()) return;
    cancelFile();
    const file = release()?.files.find(item => item.id === $('online-file').value);
    if (!file) return;
    const signal = download.signal;
    $('online-retry').hidden = false;
    await loadFirmware(file.downloadName, file.bytes, async () => {
      try { return await catalog.readHex(file.id, signal); }
      catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error('線上韌體下載或完整性驗證失敗，請重試或重新載入清單');
      }
    });
  }
  function showSource() {
    $('local-firmware').hidden = active();
    $('online-firmware').hidden = !active();
  }
  $('firmware-source').addEventListener('change', () => {
    if (isBusy()) return;
    clearFirmware(); $('firmware').value = '';
    reset(); showSource(); ready();
    if (active()) void refresh();
  });
  $('online-project').addEventListener('change', () => {
    if (isBusy()) return;
    cancelFile(); $('online-version').value = ''; $('online-file').value = ''; render();
  });
  $('online-version').addEventListener('change', () => {
    if (isBusy()) return;
    cancelFile(); $('online-file').value = ''; render();
  });
  $('online-file').addEventListener('change', chooseFile);
  $('online-retry').addEventListener('click', chooseFile);
  $('online-refresh').addEventListener('click', refresh);
  window.addEventListener('storage', event => {
    if (event.key !== ACCESS_KEY_STORAGE && event.key !== null) return;
    // Invalidate immediately; an in-progress programmer owns its own image snapshot.
    // Never interrupt an erase/write or silently replace its input after key changes.
    reset(); status('已儲存的金鑰已變更，請重新載入清單'); ready();
    if (active() && !isBusy()) void refresh();
  });
  window.addEventListener('pagehide', () => { reset(); status('請重新載入線上韌體清單'); });
  window.addEventListener('pageshow', event => { if (event.persisted && active()) void refresh(); });
  return {
    setBusy, render,
    clearSelection() { cancelFile(); $('online-file').value = ''; render(); },
    start() {
      try { if (savedKey()) $('firmware-source').value = 'online'; } catch {}
      showSource(); render();
      if (active()) void refresh();
    }
  };
}
