import { FLASH_START, PAGE_SIZE, validateImage, mergePage, addressText } from './hex.mjs';
import { LOADER } from './loader.mjs';

export async function identify(link) {
  const cpu = await link.read32(0xe000ed00);
  const id = await link.read32(0x40015800);
  const size = (await link.read32(0x1fff75e0)) & 0xffff;
  if (((cpu >>> 4) & 0xfff) !== 0xc60 || (id & 0xfff) !== 0x466 || size !== 64) {
    throw new Error(`目標不符：CPU ${addressText(cpu)}、Device ID ${addressText(id & 0xfff)}、Flash ${size} KB；僅接受 G03x/G04x 家族、64 KB 的目標；請確認料號為 STM32G031G8U6`);
  }
  const options = await link.read32(0x40022020);
  if ((options & 0xff) !== 0xaa) throw new Error('晶片已啟用讀取保護；此工具不會解鎖或改寫 Option Bytes');
  if (!(options & 0x10000)) throw new Error('晶片設定為硬體自動啟動 IWDG；此版本不支援該設定，請使用原廠工具');
  return { id: id & 0xfff, size, revision: id >>> 16 };
}

const equal = (actual, expected, start) => {
  if (actual.length !== expected.length) throw new Error('讀回長度不符');
  const index = actual.findIndex((value, i) => value !== expected[i]);
  if (index >= 0) throw new Error(`讀回驗證失敗：${addressText(start + index)}，預期 ${expected[index].toString(16)}，實際 ${actual[index].toString(16)}`);
};

export async function program(link, image, { preserveSettings = true, update = () => {} } = {}) {
  // Snapshot the input; the UI cannot change the file halfway through a write.
  image = { ...image, pages: [...image.pages], data: new Map(image.data) };
  validateImage(image, preserveSettings);
  await identify(link);
  update('暫停並重置晶片', 0);
  await link.resetHalt();
  await identify(link);
  // Reset gives the loader HSI16 and disables DMA/peripherals from the old app.
  if (!((await link.read32(0x40021000)) & 0x400)) throw new Error('HSI16 時鐘尚未就緒');
  const status = await link.read32(0x40022010);
  if (status & 0x50000) throw new Error('Flash 正忙碌，請重新連線');
  await link.write32(0x40022010, 0xc3fb); // Clear stale EOP/error flags only.
  const pages = [];
  for (const page of image.pages) {
    const address = FLASH_START + page * PAGE_SIZE;
    update(`讀取並保留頁面 ${page}`, 5);
    const original = await link.memory(address, PAGE_SIZE);
    pages.push({ page, address, bytes: mergePage(image, page, original) });
  }
  // All originals must be readable before the first erase.
  await link.memory(0x20000000, LOADER);
  equal(await link.memory(0x20000000, LOADER.length), LOADER, 0x20000000);
  for (const [index, entry] of pages.entries()) {
    const { page, address, bytes } = entry;
    update(`燒錄頁面 ${page}（${index + 1}/${pages.length}）`, 10 + 75 * index / pages.length);
    await link.memory(0x20000800, bytes);
    equal(await link.memory(0x20000800, PAGE_SIZE), bytes, 0x20000800);
    const mailbox = new Uint8Array(16);
    new DataView(mailbox.buffer).setUint32(0, page, true);
    await link.memory(0x20000400, mailbox);
    // Cortex-M0+: MSP, SP, xPSR, special registers, PC. Enter privileged Thread
    // mode using MSP with PRIMASK=1; the loader cannot service application IRQs.
    await link.setRegister(20, 1);
    await link.setRegister(17, 0x20001ff0);
    await link.setRegister(13, 0x20001ff0);
    await link.setRegister(16, 0x01000000);
    await link.setRegister(15, 0x20000000);
    await link.write32(0xe000ed30, 0x1f); // Clear stale DFSR reasons.
    await link.write32(0xe000edf0, 0xa05f0001);
    await link.waitHalt(15000);
    const reply = await link.memory(0x20000400, 16);
    const view = new DataView(reply.buffer, reply.byteOffset, 16);
    if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== 0) {
      throw new Error(`Flash 寫入失敗：頁面 ${page}，狀態 ${view.getUint32(4, true)}，錯誤 ${addressText(view.getUint32(8, true))}，位址 ${addressText(view.getUint32(12, true))}`);
    }
    update(`驗證頁面 ${page}`, 10 + 75 * (index + 1) / pages.length);
    equal(await link.memory(address, PAGE_SIZE), bytes, address);
  }
  // Final readback catches unintended modification of an earlier page too.
  update('最終讀回驗證', 90);
  for (const entry of pages) equal(await link.memory(entry.address, PAGE_SIZE), entry.bytes, entry.address);
  update('驗證通過，正在重啟', 98);
  await link.resetRun();
  update('燒錄與驗證完成，晶片已重啟', 100);
}
