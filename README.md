# STM32 Web Flasher

A static, browser-based tool for programming STM32 firmware through ST-LINK and WebUSB.

**[Open the web flasher](https://hypothesis-magic.github.io/stm32-web-flasher/)**

> **Automatic erase on connection:** Connecting a device at RDP level 1 immediately
> starts regression to RDP level 0 and a full Flash erase, without another confirmation.
> This includes firmware and the last 4 KB of settings, even when “Preserve last 4 KB”
> is checked. Do not connect an RDP 1 device whose contents you need to keep.

## Supported hardware and browsers

- Target: **STM32G031G8U6**, 64 KB Flash and 8 KB SRAM
- Probes: **ST-LINK/V2** (`0483:3748`) and **ST-LINK/V2-1** (`0483:374B`), J22 or newer firmware
- Browser: desktop **Chrome or Edge**, using HTTPS or a localhost development server
- macOS usually needs no additional USB driver; Windows requires a compatible **WinUSB** driver
- Safari, Firefox, ST-LINK/V1, STLINK-V3 and J-Link are not supported

There is no local service, extension, build step or CDN dependency. Firmware files
are parsed and processed locally in the browser, not uploaded to a server.

## Getting started

1. Connect SWDIO, SWCLK and GND between ST-LINK and the target. Power the target
   correctly and connect the target-voltage reference where required by your probe.
2. Close CubeProgrammer, CubeIDE debugging, or other applications using ST-LINK.
3. Open the web flasher, select the chip model, and click **Connect ST-LINK**.
4. If the target is at RDP 1, automatic unprotection and erase take priority.
   Follow the power-cycle instructions and reconnect before programming.
5. Choose **Local file** or **Online firmware**. Select a complete application
   **Intel HEX (.hex)** file, including its vector table at `0x08000000`.
   Files are limited to 2 MB.
6. Keep **Preserve last 4 KB of Flash** enabled unless your firmware intentionally
   overwrites `0x0800F000–0x0800FFFF`.
7. Click **Flash and verify**. Keep power stable, USB connected, and the tab open.

The programmer preserves unspecified bytes in each affected 2 KB page and verifies
the programmed data by reading it back. It restarts the target only after successful
verification. Connecting halts the CPU; disconnecting alone does not resume firmware.
Disconnect external loads while keeping the MCU and probe powered.

## Online firmware

If you have remembered an Access Key on [Downloads](https://hypothesis-magic.github.io/firmware-downloads/)
in the same browser profile, the flasher automatically selects **Online firmware**
and unlocks the catalog. Select a project, version, and HEX file. The file is
downloaded as ciphertext, decrypted in memory, checked against the catalog's byte
length and SHA-256, and passed to the same HEX parser as local files. No intermediate
file needs to be saved to disk. Connecting ST-LINK and starting programming remain
explicit button actions; loading the catalog or a file never accesses USB.

Without a remembered key, local files continue to work. To enable online firmware,
open Downloads, unlock and choose **Remember this Access Key**, then return here.
Opening a Downloads `#key=` link alone does not persist a key. Use **Reload catalog**
after changing the key or when publication/network errors occur; **Reload file**
retries the selected download. An invalid saved key is not silently deleted.

Only nonempty `.hex` files of at most 2 MB appear in this tool. A catalog entry is
not proof of board compatibility: choose the correct project for your physical
board. Existing vector table, address range, chip checks and last-4-KB protection
still apply. The catalog currently carries no board revision or target-chip metadata.

Both Pages sites share the `https://hypothesis-magic.github.io` origin. This tool
reads the existing storage entry `hmf-access-key:v1:/firmware-downloads/` and fetches
`/firmware-downloads/protected/manifest.enc` and the selected encrypted blob.
It does not save another copy of the key or put keys in URLs, requests or logs.
Other scripts hosted on the same origin can also read this storage; different
paths are not security boundaries. Custom domains and different browser profiles
do not automatically share it. Local development must serve the downloads path
under the same origin; the automated tests provide a synthetic catalog there.

Changing a selection immediately invalidates the previous input and cancels its
download. Changing or forgetting the key in another tab clears the catalog and
loaded online image. If programming is already in progress, its fixed image
snapshot finishes normally; the cleared input cannot be used for another flash.
Key rotation does not revoke already decrypted copies. RDP behavior is unchanged,
including the automatic RDP 1 regression and erase described above.

## Language

Use the top-right **繁體中文 / English** selector to switch languages without
reloading the page or discarding the selected file.

On the first visit, the first browser language preference determines the default:
Chinese locales use Traditional Chinese; other locales use English. A manual choice
is saved in this site's local storage and takes precedence on future visits. If
storage is unavailable, language selection still works for the current page.

Interface labels, help, status messages, logs and RDP warnings are translated.
Browser-owned USB/file pickers and their native labels follow the browser/OS language.
Language switching is disabled during hardware operations and RDP confirmation.

## Read protection (RDP)

| Level | Behavior | Extra operation confirmation |
| --- | --- | --- |
| 0 | No read protection; regression from 1 erases all main Flash and backup registers | None |
| 1 | Blocks external Flash access; firmware programming is unavailable while protected | None |
| 2 | Permanently disables debugging and ST-LINK access; cannot be reversed | Checkbox and exact typed phrase |

The selection defaults to **RDP 0**. Selecting a value alone does not write it;
click **Apply RDP** to apply a manual change. Connecting an RDP 1 target is the
exception: it automatically starts regression and erase without another prompt.

**RDP 2 is irreversible.** Verify the firmware first. Neither ST-LINK nor the ST
factory can restore normal debug access. An English confirmation requires typing
`PERMANENTLY LOCK RDP2`; the Chinese interface shows its corresponding phrase.

After any RDP write, **fully remove all power from the target board and power it on
again**. Reconnecting just the probe is not enough. The page asks you to confirm
that physical power cycle before the next connection. RDP 0/1 can then be read back;
RDP 2 prevents reconnecting. A completed write is not claimed as verification of
the newly active protection level.

Only the RDP option byte is modified. Targets with PCROP, BOOT_LOCK, secure memory,
hardware-started IWDG, or invalid option bytes are rejected. Interrupted option writes
are never automatically retried; inspect the target with the official ST tool.

## Limitations and validation

- Chip IDs identify a family, not the full part number; verify the physical marking
- If firmware disables SWD, use connect-under-reset in the official ST tool
- No arbitrary memory editor, other option-byte controls, or standalone erase button
- Firmware programming has been successfully tested on hardware by the user
- RDP transitions are covered by automated simulated-device tests but have not yet
  been validated on hardware; an RDP 2 hardware test permanently locks that device

## Hosting and source

This repository is the standalone static application. It can be hosted directly
from the repository root using GitHub Pages, with no build command required.
Serve it over HTTPS for WebUSB; do not rely on opening `index.html` as a local file.

`app.mjs` manages the UI, `i18n.mjs` handles localization, `hex.mjs` validates Intel
HEX, `stlink.mjs` implements the USB transport, and `programmer.mjs`, `loader.mjs`,
and `rdp.mjs` implement device programming and protection changes.

`online-firmware.mjs` manages catalog selection and cancellation; `catalog.mjs`
loads only verified online HEX files. `vault-crypto.mjs` is vendored from
[`firmware-downloads` at ae0e8e9](https://github.com/Hypothesis-Magic/firmware-downloads/blob/ae0e8e9a8e97245f17993d0d2062136c14267659/crypto.mjs)
to keep deployment self-contained. Keep it compatible with the publisher's HMF v1
format when updating either system. No vault or publication changes are required.

## Development checks

The site still runs without a build step or production dependencies. Node 22 and
the development-only Playwright dependency run the regression checks:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

To use an installed Chrome instead, set `PLAYWRIGHT_CHANNEL=chrome` for the browser
test command. Browser tests use fresh profiles, ephemeral test keys, a local test
server and simulated USB/programmer modules. They cover storage, language changes,
catalog/file integrity failures, cancellation, local-file fallback and the explicit
flash boundary. They never connect to real hardware. Screenshots are saved under
`test-results/`; actual ST-LINK verification remains a hardware check.

See [SOURCES.md](SOURCES.md) for technical references and third-party attribution,
including the [ST RM0444 reference manual](https://www.st.com/resource/en/reference_manual/rm0444-stm32g0x1-advanced-armbased-32bit-mcus-stmicroelectronics.pdf).
