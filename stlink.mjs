// ST-LINK/V2 wire protocol cross-checked against webstlink (Devan Lai,
// Pavel Revak) and stlink-org/stlink. See SOURCES.md for references.
const PROBES = new Map([
  [0x3748, { name: 'ST-LINK/V2', outEndpoint: 2, inEndpoint: 1 }],
  [0x374b, { name: 'ST-LINK/V2-1', outEndpoint: 1, inEndpoint: 1 }]
]);
export const FILTERS = [...PROBES.keys()].map(productId => ({ vendorId: 0x0483, productId }));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hex = n => `0x${n.toString(16)}`;
export class Stlink {
  constructor(device) {
    this.probe = device.vendorId === 0x0483 ? PROBES.get(device.productId) : null;
    if (!this.probe) throw new Error('此版本支援 ST-LINK/V2（0483:3748）及 V2-1（0483:374B）');
    this.device = device; this.broken = false; this.claimed = false;
  }

  async io(promise) {
    if (this.broken) throw new Error('USB 連線已失效，請重新連接 ST-LINK');
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('USB 傳輸逾時，請拔插 ST-LINK 後重新連接')), 5000);
      })]);
    } catch (error) {
      this.broken = true;
      // Close rather than retry an indeterminate write. No later command is safe.
      Promise.resolve(this.device.close()).catch(() => {});
      throw error;
    } finally { clearTimeout(timer); }
  }

  async command(bytes, receive = 0, payload = null) {
    if (this.broken) throw new Error('USB 連線已失效，請重新連接 ST-LINK');
    const packet = new Uint8Array(16);
    packet.set(bytes);
    const send = async data => {
      const result = await this.io(this.device.transferOut(this.probe.outEndpoint, data));
      if (result.status !== 'ok' || result.bytesWritten !== data.byteLength) {
        this.broken = true;
        throw new Error('USB 寫入失敗或資料不完整；請重新連接 ST-LINK');
      }
    };
    await send(packet);
    if (payload) await send(payload);
    if (!receive) return null;
    const result = await this.io(this.device.transferIn(this.probe.inEndpoint, Math.max(64, receive)));
    if (result.status !== 'ok' || !result.data || result.data.byteLength < receive) {
      this.broken = true;
      throw new Error('USB 回覆失敗或資料不完整；請重新連接 ST-LINK');
    }
    return new DataView(result.data.buffer, result.data.byteOffset, receive);
  }

  check(response) {
    if (response.getUint8(0) !== 0x80) throw new Error(`ST-LINK 回報 ${hex(response.getUint8(0))}；請確認供電、SWD 接線與晶片保護狀態`);
    return response;
  }
  async open() {
    await this.device.open();
    if (this.device.configuration?.configurationValue !== 1) await this.device.selectConfiguration(1);
    await this.device.claimInterface(0);
    this.claimed = true;
    await this.device.selectAlternateInterface(0, 0);
    const version = (await this.command([0xf1, 0x80], 6)).getUint16(0, false);
    const hardware = version >>> 12, jtag = (version >>> 6) & 63;
    if (hardware !== 2 || jtag < 22) throw new Error(`探針 V${hardware}J${jtag} 不符合需求，請使用 ST-LINK/V2 J22 以上韌體`);
    this.version = `${this.probe.name} · V${hardware}J${jtag}`;
    const mode = (await this.command([0xf5], 2)).getUint8(0);
    if (mode === 0) await this.command([0xf3, 7]);
    else if (mode === 2) await this.command([0xf2, 0x21]);
    else if (mode === 3) await this.command([0xf4, 1]);
    else if (mode !== 1) throw new Error(`不支援的探針模式 ${mode}`);
    this.check(await this.command([0xf2, 0x43, 3, 0], 2)); // 950 kHz
    this.check(await this.command([0xf2, 0x30, 0xa3], 2));
  }
  async close() {
    if (this.device.opened) {
      try { if (this.claimed) await this.device.releaseInterface(0); }
      finally { await this.device.close(); }
    }
  }
  async read32(address) {
    const cmd = new Uint8Array(6), view = new DataView(cmd.buffer);
    cmd.set([0xf2, 0x36]); view.setUint32(2, address, true);
    return this.check(await this.command(cmd, 8)).getUint32(4, true);
  }
  async write32(address, value) {
    const cmd = new Uint8Array(10), view = new DataView(cmd.buffer);
    cmd.set([0xf2, 0x35]); view.setUint32(2, address, true); view.setUint32(6, value, true);
    this.check(await this.command(cmd, 2));
  }
  async setRegister(index, value) {
    const cmd = new Uint8Array(7), view = new DataView(cmd.buffer);
    cmd.set([0xf2, 0x34, index]); view.setUint32(3, value, true);
    this.check(await this.command(cmd, 2));
  }
  async memory(address, dataOrSize) {
    const writing = dataOrSize instanceof Uint8Array;
    const size = writing ? dataOrSize.length : dataOrSize;
    if (!Number.isInteger(size) || size < 4 || address % 4 || size % 4) throw new Error('記憶體傳輸必須對齊 32 bit');
    const result = new Uint8Array(size);
    for (let offset = 0; offset < size;) {
      // Cortex-M0+ AHB-AP autoincrement wraps at 1 KB.
      const length = Math.min(size - offset, 1024 - ((address + offset) % 1024));
      const cmd = new Uint8Array(10), view = new DataView(cmd.buffer);
      cmd.set([0xf2, writing ? 0x08 : 0x07]);
      view.setUint32(2, address + offset, true); view.setUint16(6, length, true);
      const rx = await this.command(cmd, writing ? 0 : length, writing ? dataOrSize.subarray(offset, offset + length) : null);
      this.check(await this.command([0xf2, 0x3b], 2));
      if (!writing) result.set(new Uint8Array(rx.buffer, rx.byteOffset, length), offset);
      offset += length;
    }
    return result;
  }
  async halt() {
    await this.write32(0xe000edf0, 0xa05f0003);
    await this.waitHalt();
  }
  async waitHalt(timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if ((await this.read32(0xe000edf0)) & 0x20000) return;
      await delay(10);
    }
    throw new Error('等待 CPU 暫停逾時');
  }
  async resetHalt() {
    await this.halt();
    await this.write32(0xe000edfc, 1); // VC_CORERESET
    await this.write32(0xe000ed0c, 0x05fa0004); // SYSRESETREQ
    await delay(30);
    await this.waitHalt();
    await this.write32(0xe000edfc, 0);
  }
  async resetRun() {
    // Reset while halted; only release the core after reset has completed.
    await this.resetHalt();
    await this.write32(0xe000edf0, 0xa05f0000);
  }
}
