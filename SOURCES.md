# Implementation references

This directory is a standalone, dependency-free GitHub Pages application.
It does not download code from a CDN or upload firmware to a server.

- [ST STM32G031G8 product page](https://www.st.com/en/microcontrollers-microprocessors/stm32g031g8.html)
- [ST RM0444, STM32G0x1 reference manual](https://www.st.com/resource/en/reference_manual/rm0444-stm32g0x1-advanced-armbased-32bit-mcus-stmicroelectronics.pdf): Flash page erase, 64-bit programming, register layouts and option bytes.
- ST's CMSIS `stm32g031xx.h` and HAL `stm32g0xx_hal_flash.c` were used to cross-check Flash registers and the two ordered 32-bit writes with an ISB barrier. These files are available in [ST's CMSIS device package](https://github.com/STMicroelectronics/cmsis-device-g0) and [STM32G0 HAL driver](https://github.com/STMicroelectronics/stm32g0xx-hal-driver).
- [stlink-org device description](https://github.com/stlink-org/stlink/blob/develop/config/chips/G03x_G04x.chip): family ID `0x466`, 2 KB pages, flash-size register and 8 KB SRAM.
- [webstlink ST-LINK/V2 protocol](https://github.com/devanlai/webstlink/blob/master/src/lib/stlinkv2.js) and [USB transport](https://github.com/devanlai/webstlink/blob/master/src/lib/stlinkusb.js): command IDs, framing, endpoint selection, version fields and API v2 memory access. The application uses its own narrow transport and a G031-specific SRAM loader; it does not use webstlink's STM32F1 flash implementation. Attribution and its MIT license are preserved below.
- [Chrome WebUSB platform requirements](https://developer.chrome.com/docs/capabilities/build-for-webusb): macOS access to unclaimed interfaces; Windows WinUSB requirement.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## webstlink license

The MIT License (MIT)

Copyright (c) 2017 Devan Lai

Portions of the libstlink code are ported from the pystlink project:
Copyright (c) 2015 Pavel Revak <pavel.revak@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
