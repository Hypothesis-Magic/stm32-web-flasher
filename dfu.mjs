// STM32 ROM DfuSe (AN3156). This profile only writes C071G8 main Flash pages 0..29.
import { FLASH_START, FLASH_SIZE, PAGE_SIZE, mergePage, addressText } from './hex.mjs';
export const DFU_FILTERS = [{ vendorId: 0x0483, productId: 0xdf11 }];
export const C071_STORAGE = FLASH_START + 0xf000;
export const DFU_ENTRY_TAG = 'YS2-DEV-DFU-v2-C071-60K\0';
const LEGACY_DFU_ENTRY_TAG = 'YS2-DEV-DFU-v1-C071-62K\0';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok, message = 'ROM DFU 回覆無效') => { if (!ok) throw new Error(message); };

export function validateC071Image(image) {
  check(image?.data instanceof Map && image.data.size > 0, 'HEX 沒有可燒錄資料');
  const vector = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    check(image.data.has(FLASH_START + i), '請提供包含 0x08000000 向量表的完整應用程式 HEX');
    vector[i] = image.data.get(FLASH_START + i);
  }
  const view = new DataView(vector.buffer), sp = view.getUint32(0, true), pc = view.getUint32(4, true);
  check(sp > 0x20000000 && sp <= 0x20006000 && sp % 8 === 0, '向量表不符合 STM32C071 的 24 KB SRAM');
  check((pc & 1) && pc >= FLASH_START && pc < C071_STORAGE && image.data.has(pc - 1), '向量表的 Reset Handler 無效或未包含在 HEX 中');
  for (const [a, byte] of image.data) check(Number.isInteger(a) && a >= FLASH_START && a < C071_STORAGE && Number.isInteger(byte) && byte >= 0 && byte <= 255,
    'C071 韌體不得覆寫最後 4 KB 工廠身分與設定區');
  const starts = [...image.data.keys()];
  check([DFU_ENTRY_TAG, LEGACY_DFU_ENTRY_TAG].some(text => {
    const tag = new TextEncoder().encode(text);
    return starts.some(a => tag.every((b, i) => image.data.get(a + i) === b));
  }),
    '請選擇保留 10 秒 USB 更新入口的相容韌體');
  return image;
}

export function dfuFunctionalDescriptor(bytes, interfaceNumber) {
  let current = -1, result;
  for (let offset = 0; offset < bytes.length;) {
    const n = bytes[offset];
    check(n >= 2 && offset + n <= bytes.length);
    if (bytes[offset + 1] === 4) { check(n >= 9); current = bytes[offset + 2]; }
    if (bytes[offset + 1] === 0x21 && current === interfaceNumber) {
      check(n === 9);
      const v = new DataView(bytes.buffer, bytes.byteOffset + offset, n);
      result = { attributes: bytes[offset + 2], transferSize: v.getUint16(5, true), version: v.getUint16(7, true) };
    }
    offset += n;
  }
  check(result && (result.attributes & 3) === 3 && result.version === 0x11a
    && result.transferSize >= 8 && result.transferSize <= 2048 && PAGE_SIZE % result.transferSize === 0,
    '不支援這個 ROM DFU 描述或傳輸大小');
  return result;
}

export class RomDfu {
  constructor(device, { transferTimeout = 10000, pollTimeout = 30000 } = {}) {
    this.device = device; this.broken = false; this.transferTimeout = transferTimeout; this.pollTimeout = pollTimeout;
  }
  async transfer(operation) {
    check(!this.broken, 'USB DFU 已中斷，請重新連接');
    let timer;
    try {
      return await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('ROM DFU 傳輸逾時，請重新連接')), this.transferTimeout);
      })]);
    } catch (e) {
      this.broken = true;
      // Closing cancels a timed-out transfer; never race an old operation with a retry.
      void this.device.close().catch(() => {});
      throw e;
    } finally { clearTimeout(timer); }
  }
  async input(request, value, length, type = 'class', index = this.interfaceNumber) {
    const r = await this.transfer(() => this.device.controlTransferIn({ requestType: type,
      recipient: type === 'class' ? 'interface' : 'device', request, value, index }, length));
    check(r.status === 'ok' && r.data?.byteLength === length, 'ROM DFU 讀取失敗或長度不符');
    return new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength).slice();
  }
  async output(request, value = 0, bytes = new Uint8Array()) {
    const r = await this.transfer(() => this.device.controlTransferOut({ requestType: 'class', recipient: 'interface',
      request, value, index: this.interfaceNumber }, bytes));
    check(r.status === 'ok' && r.bytesWritten === bytes.length, 'ROM DFU 寫入要求失敗');
  }
  async open() {
    check(this.device.vendorId === 0x0483 && this.device.productId === 0xdf11, '請選擇 STM32 ROM DFU 裝置');
    await this.transfer(() => this.device.open());
    const matches = [];
    const configs = this.device.configurations;
    for (let configIndex = 0; configIndex < configs.length; configIndex++) {
      const config = configs[configIndex];
      const header = await this.input(6, 0x0200 | configIndex, 9, 'standard', 0);
      const total = header[2] | header[3] << 8;
      check(total >= 9 && total <= 4096);
      const raw = await this.input(6, 0x0200 | configIndex, total, 'standard', 0);
      // Chromium may expose the generic interface name rather than each alternate's
      // memory string. Read iInterface from the actual descriptor for that alternate.
      const names = new Map();
      for (let offset = 0; offset < raw.length;) {
        const n = raw[offset]; check(n >= 2 && offset + n <= raw.length);
        if (raw[offset + 1] === 4) {
          check(n >= 9);
          names.set(`${raw[offset + 2]}:${raw[offset + 3]}`, raw[offset + 8]);
        }
        offset += n;
      }
      const memoryNames = [];
      for (const intf of config.interfaces) for (const alt of intf.alternates) {
        if (alt.interfaceClass !== 0xfe || alt.interfaceSubclass !== 1 || alt.interfaceProtocol !== 2) continue;
        const index = names.get(`${intf.interfaceNumber}:${alt.alternateSetting}`);
        if (!index) continue;
        const prefix = await this.input(6, 0x0300 | index, 2, 'standard', 0x0409);
        check(prefix[0] >= 2 && prefix[0] % 2 === 0 && prefix[1] === 3);
        const string = await this.input(6, 0x0300 | index, prefix[0], 'standard', 0x0409);
        const name = new TextDecoder('utf-16le').decode(string.slice(2)).replace(/\0+$/, '').trim();
        memoryNames.push(name);
        if (/^@Internal Flash\s*\/0x08000000\/(?:0*32|0*64)\*0*2Kg\s*$/i.test(name)) {
          matches.push({ config, intf, alt, raw, memoryNames });
        }
      }
    }
    const c071 = matches.filter(m => m.memoryNames.some(n => /^@ENGI Bytes\s*\/0x1FFF7500\/0*1\*0*768 e$/i.test(n)));
    check(c071.length === 1, 'ROM DFU Flash 配置不符合 C071G8 的 64 KB／2 KB 分頁');
    const { config, intf, alt, raw } = c071[0];
    this.interfaceNumber = intf.interfaceNumber;
    await this.transfer(() => this.device.selectConfiguration(config.configurationValue));
    await this.transfer(() => this.device.claimInterface(this.interfaceNumber));
    await this.transfer(() => this.device.selectAlternateInterface(this.interfaceNumber, alt.alternateSetting));
    this.functional = dfuFunctionalDescriptor(raw, this.interfaceNumber);
    this.transferSize = this.functional.transferSize;
    this.version = 'ROM DFU';
    await this.idle();
  }
  async close() {
    if (this.device.opened) {
      try { await this.device.releaseInterface(this.interfaceNumber); } catch {}
      await this.device.close();
    }
  }
  async status() {
    const b = await this.input(3, 0, 6);
    return { status: b[0], timeout: b[1] | b[2] << 8 | b[3] << 16, state: b[4] };
  }
  async poll(wanted) {
    const deadline = Date.now() + this.pollTimeout;
    for (;;) {
      const s = await this.status();
      check(s.status === 0, 'ROM DFU 回報錯誤；未解除讀取保護或修改 Option Bytes');
      if (s.state === wanted) return;
      check([3, 4].includes(s.state), 'ROM DFU 狀態不符');
      check(Date.now() + Math.max(1, s.timeout) < deadline, 'ROM DFU 等待完成逾時');
      await sleep(Math.max(1, s.timeout));
    }
  }
  async idle() {
    let s = await this.status();
    if (s.state === 10) { await this.output(4); s = await this.status(); }
    check(s.status === 0, 'ROM DFU 回報錯誤；未解除讀取保護或修改 Option Bytes');
    if ([3, 4].includes(s.state)) { await this.poll(5); s = { state: 5 }; }
    if ([5, 9].includes(s.state)) { await this.output(6); s = await this.status(); }
    check(s.state === 2 && (!s.status), 'ROM DFU 未就緒，請重新連接');
  }
  async command(command, address) {
    const b = new Uint8Array(5); b[0] = command;
    new DataView(b.buffer).setUint32(1, address, true);
    await this.idle(); await this.output(1, 0, b); await this.poll(5);
  }
  async memory(address, length) {
    check(Number.isInteger(length) && length > 0 && length <= FLASH_SIZE
      && ((address >= FLASH_START && address + length <= FLASH_START + FLASH_SIZE)
        || (address === 0x1fff75a0 && length === 2)), 'ROM DFU 讀取範圍不允許');
    await this.command(0x21, address); await this.idle();
    const bytes = new Uint8Array(length);
    for (let off = 0, block = 2; off < length; off += this.transferSize, block++) {
      bytes.set(await this.input(2, block, Math.min(this.transferSize, length - off)), off);
    }
    await this.idle(); return bytes;
  }
  async writePage(address, bytes) {
    check(address >= FLASH_START && address + PAGE_SIZE <= C071_STORAGE && (address - FLASH_START) % PAGE_SIZE === 0
      && bytes instanceof Uint8Array && bytes.length === PAGE_SIZE, 'ROM DFU 寫入範圍不允許');
    await this.command(0x41, address); // Page erase only. Never issue mass erase or READ_UNPROTECT.
    await this.command(0x21, address);
    for (let off = 0, block = 2; off < bytes.length; off += this.transferSize, block++) {
      await this.output(1, block, bytes.slice(off, off + this.transferSize)); await this.poll(5);
    }
    await this.idle();
  }
  async leave() {
    await this.command(0x21, FLASH_START); await this.idle();
    await this.output(1); // AN3156 leave: zero-byte DNLOAD, then GETSTATUS.
    this.expectedDisconnect = true;
    try {
      const s = await this.status();
      check(s.status === 0 && [6, 7, 8].includes(s.state), 'ROM DFU 重啟狀態未確認');
      if (s.state === 8) await this.transfer(() => this.device.reset());
    } catch (e) {
      // A disconnect after the accepted leave command is expected; application
      // startup cannot be proven by DFU, so the UI reports only a restart request.
      if (!['NetworkError', 'NotFoundError'].includes(e.name)) throw e;
    }
  }
}

export async function identifyC071(link) {
  const b = await link.memory(0x1fff75a0, 2), size = b[0] | b[1] << 8;
  check(size === 64, 'ROM DFU Flash 容量不符：需要 C071G8 的 64 KB');
  // Reading the vector page proves upload permission without unprotecting/erasing.
  await link.memory(FLASH_START, PAGE_SIZE);
  return { size, canProgram: true, rdp: null };
}
export async function programC071(link, image, { update = () => {} } = {}) {
  image = { ...image, data: new Map(image.data) };
  validateC071Image(image);
  await identifyC071(link);
  update('讀取並保留完整 Flash', 0);
  const original = await link.memory(FLASH_START, FLASH_SIZE), expected = original.slice();
  const pages = [...new Set([...image.data.keys()].map(a => Math.floor((a - FLASH_START) / PAGE_SIZE)))].sort((a, b) => a - b);
  for (const [i, page] of pages.entries()) {
    const address = FLASH_START + page * PAGE_SIZE;
    const bytes = mergePage(image, page, original.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    expected.set(bytes, page * PAGE_SIZE);
    update(`燒錄頁面 ${page}（${i + 1}/${pages.length}）`, 5 + 80 * i / pages.length);
    await link.writePage(address, bytes);
  }
  update('最終讀回驗證', 90);
  const actual = await link.memory(FLASH_START, FLASH_SIZE);
  check(actual.length === expected.length, '讀回長度不符');
  const mismatch = actual.findIndex((byte, i) => byte !== expected[i]);
  check(mismatch === -1, `ROM DFU 完整讀回不符：${addressText(FLASH_START + Math.max(0, mismatch))}`);
  try {
    await link.leave();
    update('燒錄與驗證完成，已送出重啟請求', 100);
    return { verified: true, restartRequested: true };
  } catch {
    update('燒錄與驗證完成；請將裝置重新上電', 100);
    return { verified: true, restartRequested: false };
  }
}
