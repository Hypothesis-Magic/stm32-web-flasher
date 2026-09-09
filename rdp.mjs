import { identify, rdpLevel } from './programmer.mjs';

const KEYR = 0x40022008, OPTKEYR = 0x4002200c, SR = 0x40022010;
const CR = 0x40022014, OPTR = 0x40022020;
const LOCK = 0x80000000, OPTLOCK = 0x40000000, OPTSTRT = 0x20000;
const BUSY = 0x50000, ERRORS = 0xc3fa;
const values = [0xaa, 0xbb, 0xcc];

export function rdpConfirmation(current, next) {
  if (![0, 1, 2].includes(current) || ![0, 1, 2].includes(next)) throw new Error('無效的 RDP 等級');
  if (current === 2) throw new Error('RDP 2 為永久保護，無法變更');
  if (current === next) throw new Error('目前已是這個 RDP 等級');
  return next === 2 ? '永久鎖定 RDP2' : next === 0 ? '清除 FLASH' : '啟用 RDP1';
}

async function idle(link) {
  const deadline = Date.now() + 15000;
  while (true) {
    const sr = await link.read32(SR);
    if (!(sr & BUSY)) return sr;
    if (Date.now() >= deadline) throw new Error('等待 Flash 完成逾時');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function inspect(link, expectedOptions) {
  const info = await identify(link);
  if (info.options !== expectedOptions) throw new Error('Option Bytes 已變更，請重新連線確認');
  if (!(info.options & 0x10000)) throw new Error('硬體 IWDG 模式不支援變更 RDP，請使用原廠工具');
  // Reject security combinations outside this tool's narrowly supported profile.
  // BOOT_LOCK + RDP1 can disable recovery, even though RDP1 is normally reversible.
  if ((await link.read32(0x40022080)) & 0x1003f) throw new Error('已啟用 BOOT_LOCK 或安全區域，請使用原廠工具設定 RDP');
  for (const start of [0x40022024, 0x40022034]) {
    if (((await link.read32(start)) & 0x7f) <= ((await link.read32(start + 4)) & 0x7f)) {
      throw new Error('已啟用 PCROP，請使用原廠工具設定 RDP');
    }
  }
  return info;
}

// RM0444 §3.4.2 / §3.5.1: program only RDP, preserving every other option.
// Never auto-retry an option write. OPTR reads the last LOADED value, so it
// cannot verify the new nonvolatile value until a power-on option reload.
export async function setRdp(link, next, { expectedOptions, confirmation, update = () => {} } = {}) {
  if (!Number.isInteger(expectedOptions) || expectedOptions < 0 || expectedOptions > 0xffffffff) throw new Error('缺少目前 Option Bytes');
  const current = rdpLevel(expectedOptions);
  if (confirmation !== rdpConfirmation(current, next)) throw new Error('尚未完成 RDP 變更確認');
  if (link.optionWriteAttempted) throw new Error('請先將目標板完全斷電再上電，並重新連線');
  await inspect(link, expectedOptions);
  update('準備設定 RDP');
  await link.resetHalt(); // Stop application/DMA and any software watchdog.
  await inspect(link, expectedOptions);
  if (!((await link.read32(0x40021000)) & 0x400)) throw new Error('HSI16 時鐘尚未就緒');
  if ((await idle(link)) & 0x8000) throw new Error('Option Bytes 有效性錯誤，請使用原廠工具檢查');
  let unlocked = false;
  try {
    let cr = await link.read32(CR);
    if (cr & LOCK) {
      await link.write32(KEYR, 0x45670123);
      await link.write32(KEYR, 0xcdef89ab);
    }
    cr = await link.read32(CR);
    if (cr & LOCK) throw new Error('Flash 解鎖失敗');
    unlocked = true;
    if (cr & OPTLOCK) {
      await link.write32(OPTKEYR, 0x08192a3b);
      await link.write32(OPTKEYR, 0x4c5d6e7f);
    }
    cr = await link.read32(CR);
    if (cr & (LOCK | OPTLOCK)) throw new Error('Option Bytes 解鎖失敗');
    // A clean controller is required; never carry a pending erase/program bit.
    if (cr & 0x080303ff) throw new Error('Flash 控制器狀態不符，已停止設定');
    await link.write32(SR, ERRORS | 1);
    update(`寫入 RDP ${next}，請勿中斷供電`);
    link.optionWriteAttempted = true;
    await link.write32(OPTR, ((expectedOptions & 0xffffff00) | values[next]) >>> 0);
    await link.write32(CR, (cr | OPTSTRT) >>> 0);
    const sr = await idle(link);
    if (sr & ERRORS) throw new Error(`Option Bytes 寫入錯誤 0x${(sr & ERRORS).toString(16)}`);
    await link.write32(CR, cr);
    await link.write32(CR, (cr | LOCK | OPTLOCK) >>> 0);
    unlocked = false;
    // No OBL_LAUNCH / resume: debugger-attached protection needs a real POR.
    return { requestedRdp: next, requiresPowerCycle: true, verified: false };
  } finally {
    // Best-effort relock only when idle; do not reset, reload, or retry on error.
    if (unlocked && !link.broken) {
      try {
        if (!((await link.read32(SR)) & BUSY)) await link.write32(CR, (LOCK | OPTLOCK) >>> 0);
      } catch { /* Preserve the original error and require a fresh connection. */ }
    }
  }
}
