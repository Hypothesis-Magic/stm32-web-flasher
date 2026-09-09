// Original messages remain language-neutral inputs to the hardware/UI boundary.
// Translate only presentation; never translate protocol checks or confirmation tokens.
export const messages = [
  ['STM32 韌體燒錄工具', 'STM32 Web Flasher'],
  ['STM32 韌體燒錄與驗證工具', 'Flash and verify STM32 firmware'],
  ['STM32 韌體燒錄', 'STM32 Web Flasher'],
  ['連接晶片', 'Connect device'], ['晶片型號', 'Chip model'],
  ['連接 ST-LINK', 'Connect ST-LINK'], ['中斷連線', 'Disconnect'],
  ['連線狀態', 'Connection'], ['晶片狀態', 'Chip state'], ['讀取保護', 'Read protection'], ['探針韌體', 'Probe firmware'],
  ['未連線', 'Disconnected'], ['未知', 'Unknown'], ['暫停', 'Halted'], ['已連線', 'Connected'],
  ['等待選擇裝置', 'Waiting for device selection'], ['連線中', 'Connecting'],
  ['選擇韌體', 'Select firmware'], ['Intel HEX 檔案（.hex）', 'Intel HEX file (.hex)'],
  ['尚未選擇檔案', 'No file selected'], ['資料大小', 'Data size'], ['位址範圍', 'Address range'], ['涉及頁數', 'Pages used'],
  ['保護最後 4 KB Flash（0x0800F000–0x0800FFFF）', 'Preserve last 4 KB of Flash (0x0800F000–0x0800FFFF)'],
  ['燒錄與驗證', 'Flash and verify'], ['等待連線與韌體', 'Connect a device and select firmware'], ['燒錄並驗證', 'Flash and verify'],
  ['燒錄進度', 'Programming progress'], ['燒錄時請勿拔除 USB 或關閉分頁', 'Keep USB connected and this tab open while programming'],
  ['操作紀錄', 'Activity log'], ['保護等級', 'Protection level'], ['套用 RDP', 'Apply RDP'],
  ['RDP 0 · 無保護', 'RDP 0 · Unprotected'], ['RDP 1 · 禁止外部讀取', 'RDP 1 · Read protected'], ['RDP 2 · 永久關閉除錯', 'RDP 2 · Debug permanently disabled'],
  ['永久關閉 SWD／除錯，無法解除或再用 ST-LINK 燒錄', 'Permanently disables SWD/debug; cannot be undone or reprogrammed using ST-LINK'],
  ['阻止外部讀取 Flash，日後解除保護會清除內容', 'Blocks external Flash access; removing protection later erases its contents'],
  ['連線疑難與使用說明', 'Troubleshooting and usage'],
  ['使用桌面版 Chrome／Edge 與 HTTPS 網址，Safari／Firefox 不支援', 'Use desktop Chrome or Edge over HTTPS; Safari and Firefox are not supported'],
  ['無法連線時，先關閉 CubeProgrammer、CubeIDE 偵錯或其他占用 ST-LINK 的程式', 'If connection fails, close CubeProgrammer, CubeIDE debugging, and other apps using ST-LINK'],
  ['macOS 通常不需額外驅動；Windows 需使用 WinUSB', 'macOS usually needs no additional driver; Windows requires WinUSB'],
  ['支援 ST-LINK/V2（3748）與 V2-1（374B），韌體需為 J22 以上', 'Supports ST-LINK/V2 (3748) and V2-1 (374B), with J22 or newer firmware'],
  ['不支援 V1、V3、J-Link，Option Bytes 僅支援 RDP', 'V1, V3 and J-Link are not supported; RDP is the only supported option byte'],
  ['RDP 變更後須將目標板完全斷電再上電，不是只重插 ST-LINK', 'After changing RDP, fully power-cycle the target board, not just ST-LINK'],
  ['RDP 2 無法解除，也無法再透過 ST-LINK 燒錄或讀取狀態', 'RDP 2 cannot be reversed; ST-LINK can no longer program or read the device state'],
  ['已啟用 PCROP、BOOT_LOCK、安全區域或硬體 IWDG 的晶片，請使用原廠工具設定 RDP', 'Use the official ST tool for RDP on devices with PCROP, BOOT_LOCK, secure memory, or hardware IWDG enabled'],
  ['識別碼無法確認完整料號，請核對晶片標示與選單', 'Device IDs cannot verify the exact part number; check the chip marking against the selected model'],
  ['若韌體關閉 SWD，請使用原廠工具的 under-reset 功能', 'If firmware disables SWD, use connect-under-reset in the official ST tool'],
  ['僅擦除 HEX 涵蓋的頁面，同頁未指定的資料會保留', 'Only pages covered by the HEX are erased; unspecified bytes in those pages are preserved'],
  ['燒錄時請讓外部負載斷電，維持 MCU 與 ST-LINK 供電', 'Disconnect external loads while programming; keep the MCU and ST-LINK powered'],
  ['確認變更 RDP', 'Confirm RDP change'],
  ['請保持供電穩定，完成後將目標板完全斷電再上電', 'Keep power stable; fully power-cycle the target board after completion'],
  ['我了解這次變更的影響', 'I understand the consequences'], ['取消', 'Cancel'], ['確認套用', 'Confirm and apply'],
  ['永久鎖定', 'Permanently lock'], ['清除並解除保護', 'Erase and unprotect'], ['啟用保護', 'Enable protection'],
  ['永久鎖定晶片，無法降級或解除保護，ST-LINK 將無法再連線、燒錄或除錯，ST 原廠也無法恢復，請先確認韌體可正常運作', 'Permanently locks the device. Protection cannot be downgraded or removed. ST-LINK can no longer connect, program, or debug, and ST cannot recover it. Verify that your firmware works before proceeding'],
  ['將清除整個 Flash 與備份暫存器，包含韌體和最後 4 KB 設定，無法復原，「保護最後 4 KB」不適用於解除 RDP', 'Erases all Flash and backup registers, including firmware and the last 4 KB of settings. This cannot be undone; Preserve last 4 KB does not apply to RDP regression'],
  ['將禁止外部讀取 Flash，ST-LINK 無法直接燒錄，日後降回 RDP 0 會清除韌體與設定', 'Blocks external Flash access and ST-LINK programming. Returning to RDP 0 later erases firmware and settings'],
  ['永久鎖定 RDP2', 'PERMANENTLY LOCK RDP2'], ['清除 FLASH', 'ERASE FLASH'], ['啟用 RDP1', 'ENABLE RDP1'],
  ['請輸入「{0}」', 'Type “{0}”'],
  ['請選擇目前支援的晶片型號', 'Select a supported chip model'], ['HEX 檢查通過', 'HEX validation passed'],
  ['已取消選擇裝置', 'Device selection cancelled'], ['已中斷連線', 'Disconnected'], ['晶片檢查通過', 'Device checks passed'],
  ['無法使用 WebUSB，請用 Chrome／Edge 開啟 HTTPS 網址', 'WebUSB is unavailable; open this HTTPS page in Chrome or Edge'],
  ['上次曾寫入 RDP\n請先將目標板所有電源完全斷開再重新上電，不是只重插 ST-LINK\n\n已完成重新上電？', 'RDP was written previously\nFully disconnect all target board power and power it on again, not just ST-LINK\n\nHave you power-cycled the target?'],
  ['請選擇 .hex 檔案', 'Select a .hex file'], ['HEX 檔案超過 2 MB 上限', 'HEX file exceeds the 2 MB limit'],
  ['已重啟', 'Restarted'], ['燒錄中', 'Programming'], ['設定 RDP 中', 'Setting RDP'],
  ['ST-LINK 已中斷，請重新連接', 'ST-LINK disconnected; reconnect the probe'],
  ['USB 已拔除', 'USB unplugged'], ['ST-LINK 已拔除，請重新連接', 'ST-LINK unplugged; reconnect the probe'],
  ['RDP 設定已寫入，等待重新上電', 'RDP setting written; power-cycle the target'],
  ['{0} 請關閉其他使用 ST-LINK 的程式；Windows 請確認 ST-LINK 使用 WinUSB 驅動', '{0} Close other apps using ST-LINK; on Windows, check that ST-LINK uses WinUSB'],
  ['關閉連線：{0}', 'Closing connection: {0}'], ['晶片 ID {0} · {1} KB', 'Device ID {0} · {1} KB'],
  ['RDP {0} · 無法燒錄韌體', 'RDP {0} · Firmware programming unavailable'],
  ['已讀取 {0}：{1} bytes，{2} 頁', 'Loaded {0}: {1} bytes, {2} pages'],
  ['RDP {0} 設定已寫入，請將目標板完全斷電再上電，生效後 ST-LINK 將無法連線', 'RDP {0} setting written; fully power-cycle the target board. ST-LINK will no longer connect once it takes effect'],
  ['RDP {0} 設定已寫入，請將目標板完全斷電再上電，再連線確認保護等級', 'RDP {0} setting written; fully power-cycle the target board, then reconnect to check the protection level'],
  ['{0}，設定結果未確認，請重新上電後使用原廠工具檢查，勿直接重試', '{0}. The result is unconfirmed; power-cycle and inspect with the official ST tool. Do not retry directly'],
  ['{0} 燒錄未完成，請重新連接後再試；請勿依賴目前韌體內容', '{0}. Programming did not complete; reconnect before trying again. Do not rely on the current firmware contents'],
  ['HEX 檔案過大或內容無效', 'HEX file is too large or invalid'], ['HEX 第 {0} 行：{1}', 'HEX line {0}: {1}'],
  ['EOF 之後仍有資料', 'Data found after EOF'], ['格式錯誤', 'Invalid format'], ['資料長度不符', 'Data length mismatch'], ['checksum 不符', 'Checksum mismatch'],
  ['資料跨越 64 KB 記錄邊界', 'Data crosses a 64 KB record boundary'], ['位址 {0} 不在 64 KB 主 Flash 內', 'Address {0} is outside the 64 KB main Flash'], ['位址 {0} 重複', 'Duplicate address {0}'],
  ['EOF 格式錯誤', 'Invalid EOF record'], ['延伸位址格式錯誤', 'Invalid extended address record'], ['啟動位址格式錯誤', 'Invalid start address record'],
  ['不支援的記錄類型 {0}', 'Unsupported record type {0}'], ['HEX 缺少 EOF 記錄', 'HEX is missing an EOF record'], ['HEX 沒有可燒錄資料', 'HEX contains no programmable data'],
  ['HEX 涵蓋最後 4 KB Flash 保護區；若確定要改寫，請取消「保護最後 4 KB Flash」', 'HEX overlaps the protected last 4 KB of Flash; uncheck Preserve last 4 KB of Flash if you intend to overwrite it'],
  ['請提供包含 0x08000000 向量表的完整應用程式 HEX', 'Provide a complete application HEX with the vector table at 0x08000000'],
  ['向量表的初始堆疊不符合 STM32G031 的 8 KB SRAM', 'Initial stack pointer does not match the STM32G031 8 KB SRAM'],
  ['向量表的 Reset Handler 無效或未包含在 HEX 中', 'Reset Handler is invalid or missing from the HEX'], ['讀取的 Flash 頁面長度錯誤', 'Invalid Flash page read length'],
  ['目標不符：CPU {0}、Device ID {1}、Flash {2} KB；僅接受 G03x/G04x 家族、64 KB 的目標；請確認料號為 STM32G031G8U6', 'Target mismatch: CPU {0}, Device ID {1}, Flash {2} KB; requires a 64 KB G03x/G04x device. Verify the part number is STM32G031G8U6'],
  ['請先將 RDP 設為 0，重新上電後再燒錄', 'Set RDP to 0 and power-cycle before programming'],
  ['晶片設定為硬體自動啟動 IWDG；此版本不支援該設定，請使用原廠工具', 'Hardware-started IWDG is not supported; use the official ST tool'],
  ['讀回長度不符', 'Readback length mismatch'], ['讀回驗證失敗：{0}，預期 {1}，實際 {2}', 'Readback verification failed at {0}: expected {1}, got {2}'],
  ['暫停並重置晶片', 'Halt and reset device'], ['HSI16 時鐘尚未就緒', 'HSI16 clock is not ready'], ['Flash 正忙碌，請重新連線', 'Flash is busy; reconnect the device'],
  ['讀取並保留頁面 {0}', 'Read and preserve page {0}'], ['燒錄頁面 {0}（{1}/{2}）', 'Program page {0} ({1}/{2})'],
  ['Flash 寫入失敗：頁面 {0}，狀態 {1}，錯誤 {2}，位址 {3}', 'Flash programming failed: page {0}, status {1}, error {2}, address {3}'],
  ['驗證頁面 {0}', 'Verify page {0}'], ['最終讀回驗證', 'Final readback verification'], ['驗證通過，正在重啟', 'Verification passed; restarting'], ['燒錄與驗證完成，晶片已重啟', 'Programming and verification complete; device restarted'],
  ['無效的 RDP 等級', 'Invalid RDP level'], ['RDP 2 為永久保護，無法變更', 'RDP 2 is permanent and cannot be changed'], ['目前已是這個 RDP 等級', 'This RDP level is already active'],
  ['等待 Flash 完成逾時', 'Timed out waiting for Flash'], ['Option Bytes 已變更，請重新連線確認', 'Option bytes changed; reconnect to check them'],
  ['硬體 IWDG 模式不支援變更 RDP，請使用原廠工具', 'Changing RDP with hardware IWDG is not supported; use the official ST tool'],
  ['已啟用 BOOT_LOCK 或安全區域，請使用原廠工具設定 RDP', 'BOOT_LOCK or secure memory is enabled; use the official ST tool to set RDP'],
  ['已啟用 PCROP，請使用原廠工具設定 RDP', 'PCROP is enabled; use the official ST tool to set RDP'],
  ['缺少目前 Option Bytes', 'Current option bytes are missing'], ['尚未完成 RDP 變更確認', 'RDP change has not been authorized'],
  ['請先將目標板完全斷電再上電，並重新連線', 'Fully power-cycle the target board, then reconnect'], ['準備設定 RDP', 'Preparing RDP change'],
  ['Option Bytes 有效性錯誤，請使用原廠工具檢查', 'Option byte validity error; inspect with the official ST tool'],
  ['Flash 解鎖失敗', 'Flash unlock failed'], ['Option Bytes 解鎖失敗', 'Option byte unlock failed'], ['Flash 控制器狀態不符，已停止設定', 'Unexpected Flash controller state; operation stopped'],
  ['寫入 RDP {0}，請勿中斷供電', 'Writing RDP {0}; do not disconnect power'], ['Option Bytes 寫入錯誤 0x{0}', 'Option byte programming error 0x{0}'],
  ['此版本支援 ST-LINK/V2（0483:3748）及 V2-1（0483:374B）', 'Supported probes: ST-LINK/V2 (0483:3748) and V2-1 (0483:374B)'],
  ['USB 連線已失效，請重新連接 ST-LINK', 'USB connection is invalid; reconnect ST-LINK'], ['USB 傳輸逾時，請拔插 ST-LINK 後重新連接', 'USB transfer timed out; unplug and reconnect ST-LINK'],
  ['USB 寫入失敗或資料不完整；請重新連接 ST-LINK', 'USB write failed or was incomplete; reconnect ST-LINK'], ['USB 回覆失敗或資料不完整；請重新連接 ST-LINK', 'USB response failed or was incomplete; reconnect ST-LINK'],
  ['ST-LINK 回報 {0}；請確認供電、SWD 接線與晶片保護狀態', 'ST-LINK reported {0}; check power, SWD wiring, and chip protection'],
  ['探針 V{0}J{1} 不符合需求，請使用 ST-LINK/V2 J22 以上韌體', 'Probe V{0}J{1} is not supported; use ST-LINK/V2 with J22 or newer firmware'],
  ['不支援的探針模式 {0}', 'Unsupported probe mode {0}'], ['記憶體傳輸必須對齊 32 bit', 'Memory transfers must be 32-bit aligned'], ['等待 CPU 暫停逾時', 'Timed out waiting for the CPU to halt']
];

const exact = new Map(messages.filter(([key]) => !key.includes('{0}')));
const patterns = messages.filter(([key]) => key.includes('{0}')).map(([key, value]) => {
  const expression = key.split(/\{\d+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]+?)');
  return [new RegExp(`^${expression}$`), value];
});
export function translate(message, language = 'zh-Hant', depth = 0) {
  const source = String(message);
  if (language !== 'en' || depth > 5) return source;
  if (exact.has(source)) return exact.get(source);
  for (const [pattern, output] of patterns) {
    const match = source.match(pattern);
    if (match) return output.replace(/\{(\d+)\}/g, (_, index) => translate(match[Number(index) + 1], language, depth + 1));
  }
  return source;
}

export function chooseLanguage(saved, languages = []) {
  if (['zh-Hant', 'en'].includes(saved)) return saved;
  // The first browser preference determines the default; unsupported languages
  // use English. All Chinese locales use the Traditional Chinese translation.
  return /^zh(?:-|$)/i.test(languages[0] ?? '') ? 'zh-Hant' : 'en';
}

export function createI18n(document, navigator, storage) {
  let saved;
  try { saved = storage?.getItem('stm32-flasher-language'); } catch {}
  let language = chooseLanguage(saved, navigator.languages?.length ? navigator.languages : [navigator.language]);
  const texts = [], attributes = [], dynamic = new Map();
  const walker = document.createTreeWalker(document.documentElement, 4);
  for (let node; (node = walker.nextNode());) {
    if (!node.parentElement?.closest('[translate="no"], script, style') && /\p{Script=Han}/u.test(node.nodeValue)) texts.push([node, node.nodeValue]);
  }
  for (const node of document.querySelectorAll('[aria-label], meta[name="description"]')) {
    const attribute = node.tagName === 'META' ? 'content' : 'aria-label';
    attributes.push([node, attribute, node.getAttribute(attribute)]);
  }
  const text = message => translate(message, language);
  function setText(node, message) { dynamic.set(node, String(message)); node.textContent = text(message); }
  function render() {
    document.documentElement.lang = language;
    for (const [node, source] of texts) if (node.isConnected) {
      const trimmed = source.trim();
      node.nodeValue = source.replace(trimmed, () => text(trimmed));
    }
    for (const [node, attribute, source] of attributes) node.setAttribute(attribute, text(source));
    for (const [node, source] of dynamic) node.textContent = text(source);
    document.getElementById('language').value = language;
  }
  function change(value) {
    if (!['zh-Hant', 'en'].includes(value)) return;
    language = value;
    try { storage?.setItem('stm32-flasher-language', language); } catch {}
    render();
  }
  render();
  return { text, setText, change, get language() { return language; } };
}
