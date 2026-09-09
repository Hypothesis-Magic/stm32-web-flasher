export const FLASH_START = 0x08000000;
export const FLASH_SIZE = 65536;
export const PAGE_SIZE = 2048;
export const SETTINGS_START = FLASH_START + 60 * 1024;
export const addressText = n => `0x${n.toString(16).toUpperCase().padStart(8, '0')}`;

// Strict Intel HEX parser: all records are checked before hardware is touched.
export function parseHex(text) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('HEX 檔案過大或內容無效。');
  const data = new Map();
  let base = 0, eof = false;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const fail = message => { throw new Error(`HEX 第 ${index + 1} 行：${message}`); };
    if (eof) fail('EOF 之後仍有資料。');
    if (!/^:([0-9a-fA-F]{2}){5,260}$/.test(line)) fail('格式錯誤。');
    const bytes = Uint8Array.from(line.slice(1).match(/../g), s => parseInt(s, 16));
    const count = bytes[0], offset = bytes[1] * 256 + bytes[2], type = bytes[3];
    if (bytes.length !== count + 5) fail('資料長度不符。');
    if (bytes.reduce((a, b) => a + b, 0) % 256) fail('checksum 不符。');
    const payload = bytes.slice(4, -1);
    if (type === 0) {
      if (offset + count > 0x10000) fail('資料跨越 64 KB 記錄邊界。');
      for (let i = 0; i < count; i++) {
        const address = base + offset + i;
        if (address < FLASH_START || address >= FLASH_START + FLASH_SIZE) fail(`位址 ${addressText(address)} 不在 64 KB 主 Flash 內。`);
        if (data.has(address)) fail(`位址 ${addressText(address)} 重複。`);
        data.set(address, payload[i]);
      }
    } else if (type === 1) {
      if (count !== 0 || offset !== 0) fail('EOF 格式錯誤。');
      eof = true;
    } else if (type === 2 || type === 4) {
      if (count !== 2 || offset !== 0) fail('延伸位址格式錯誤。');
      base = (payload[0] * 256 + payload[1]) * (type === 2 ? 16 : 65536);
    } else if (type === 3 || type === 5) {
      if (count !== 4 || offset !== 0) fail('啟動位址格式錯誤。');
      // Reset uses the Cortex-M vector table, never the HEX start record.
    } else fail(`不支援的記錄類型 ${type}。`);
  }
  if (!eof) throw new Error('HEX 缺少 EOF 記錄。');
  if (!data.size) throw new Error('HEX 沒有可燒錄資料。');
  const addresses = [...data.keys()].sort((a, b) => a - b);
  const pages = [...new Set(addresses.map(a => Math.floor((a - FLASH_START) / PAGE_SIZE)))];
  return { data, size: data.size, start: addresses[0], end: addresses.at(-1), pages };
}

export function validateImage(image, preserveSettings = true) {
  if (preserveSettings && image.end >= SETTINGS_START) throw new Error('HEX 涵蓋最後 4 KB Flash 保護區。若確定要改寫，請取消「保護最後 4 KB Flash」。');
  const vector = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    if (!image.data.has(FLASH_START + i)) throw new Error('請提供包含 0x08000000 向量表的完整應用程式 HEX。');
    vector[i] = image.data.get(FLASH_START + i);
  }
  const view = new DataView(vector.buffer);
  const sp = view.getUint32(0, true), entry = view.getUint32(4, true);
  if (sp <= 0x20000000 || sp > 0x20002000 || sp % 8) throw new Error('向量表的初始堆疊不符合 STM32G031 的 8 KB SRAM。');
  if (!(entry & 1) || entry < FLASH_START || entry >= FLASH_START + FLASH_SIZE || !image.data.has(entry - 1)) throw new Error('向量表的 Reset Handler 無效或未包含在 HEX 中。');
  return image;
}

export function mergePage(image, page, original) {
  if (original.length !== PAGE_SIZE) throw new Error('讀取的 Flash 頁面長度錯誤。');
  const merged = original.slice(), start = FLASH_START + page * PAGE_SIZE;
  for (let i = 0; i < PAGE_SIZE; i++) if (image.data.has(start + i)) merged[i] = image.data.get(start + i);
  return merged;
}
