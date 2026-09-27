import test from 'node:test';
import assert from 'node:assert/strict';
import { RomDfu, validateC071Image, identifyC071, programC071, dfuFunctionalDescriptor, DFU_ENTRY_TAG } from '../dfu.mjs';
import { FLASH_START, FLASH_SIZE, PAGE_SIZE } from '../hex.mjs';

export function c071Image() {
  const data = new Map();
  const vector = Uint8Array.from([0, 0x60, 0, 0x20, 9, 0, 0, 8]);
  vector.forEach((v, i) => data.set(FLASH_START + i, v));
  new TextEncoder().encode(DFU_ENTRY_TAG).forEach((v, i) => data.set(FLASH_START + 8 + i, v));
  data.set(FLASH_START + 2050, 42);
  return { data, size: data.size, start: FLASH_START, end: FLASH_START + 2050, pages: [0, 1] };
}
const view = bytes => new DataView(Uint8Array.from(bytes).buffer);
const configBytes = Uint8Array.from([9,2,36,0,1,1,0,0x80,50,9,4,0,0,0,0xfe,1,2,6,9,4,0,2,0,0xfe,1,2,7,9,0x21,0xb,0xff,0,0,4,0x1a,1]);
class Usb {
  constructor() {
    this.vendorId = 0x0483; this.productId = 0xdf11; this.opened = false;
    this.configurations = [{ configurationValue: 1, interfaces: [{ interfaceNumber: 0,
      alternates: [{ interfaceClass: 0xfe, interfaceSubclass: 1, interfaceProtocol: 2, alternateSetting: 0,
        interfaceName: '@Internal Flash    /0x08000000/64*02Kg' },
        { interfaceClass:0xfe,interfaceSubclass:1,interfaceProtocol:2,alternateSetting:2,
          interfaceName:'@ENGI Bytes        /0x1FFF7500/01*768 e' }] }] }];
    this.flash = new Uint8Array(FLASH_SIZE).fill(0xa5); this.flash.fill(0x5c, 0xf000); this.flash.fill(0x9d, 0xf800);
    this.state = 2; this.address = FLASH_START; this.size = 64;
    this.erases = []; this.writes = []; this.requests = []; this.reads = 0;
  }
  async open() { this.opened = true; }
  async close() { this.opened = false; }
  async selectConfiguration(n) { assert.equal(n,1); }
  async claimInterface(n) { assert.equal(n,0); }
  async releaseInterface() {}
  async selectAlternateInterface(n,a) { assert.equal(n,0); assert.equal(a,0); }
  async reset() { this.resetRequested = true; }
  async controlTransferIn(s, n) {
    this.requests.push(s);
    if (s.requestType === 'standard') {
      const name=this.configurations[0].interfaces[0].alternates[(s.value & 255) === 7 ? 1 : 0].interfaceName;
      const string=Buffer.from(name,'utf16le');
      const bytes=(s.value>>8)===3 ? Uint8Array.from([string.length+2,3,...string]) : configBytes;
      return { status:'ok', data:view(bytes.slice(0,n)) };
    }
    assert.equal(s.recipient,'interface'); assert.equal(s.index,0);
    if (s.request === 3) {
      if (this.state === 3) this.state = 4;
      else if (this.state === 4) this.state = 5;
      return { status:'ok', data:view([this.error || 0,1,0,0,this.state,0]) };
    }
    assert.equal(s.request,2);
    assert([2,9].includes(this.state)); this.state = 9; this.reads++;
    const a = this.address + (s.value - 2) * 1024;
    if (this.failRead) return { status:'stall', data:null };
    if (a === 0x1fff75a0) return { status:'ok', data:view([this.size,0]) };
    if (this.corrupt && this.writes.length && a === FLASH_START + 0xf000) this.flash[0xf000] ^= 1;
    return { status:'ok', data:view(this.flash.slice(a - FLASH_START, a - FLASH_START + n)) };
  }
  async controlTransferOut(s, bytes) {
    this.requests.push(s);
    if (s.request === 4) { this.error=0; this.state=2; }
    else if (s.request === 6) this.state=2;
    else {
      assert.equal(s.request,1);
      if (!bytes.length) { this.left = true; this.state = 8; }
      else if (s.value === 0) {
        assert.equal(bytes.length,5); assert([0x21,0x41].includes(bytes[0]));
        const a = new DataView(bytes.buffer,bytes.byteOffset,5).getUint32(1,true);
        if (bytes[0] === 0x21) this.address=a;
        else {
          this.erases.push(a);
          if (this.failErase) throw new DOMException('Unplugged','NetworkError');
          this.flash.fill(255,a-FLASH_START,a-FLASH_START+PAGE_SIZE);
        }
        this.state = 3;
      } else {
        const a=this.address+(s.value-2)*1024;
        this.writes.push(a); this.flash.set(bytes,a-FLASH_START); this.state=3;
      }
    }
    return { status:'ok',bytesWritten:bytes.length };
  }
}
async function connect(device=new Usb()) { const link=new RomDfu(device); await link.open(); return link; }

test('C071 vectors, retained DFU entry and fixed settings boundary',()=>{
  assert(validateC071Image(c071Image()));
  for (const edit of [i=>i.data.delete(FLASH_START), i=>i.data.set(FLASH_START+1,0x70),
    i=>i.data.set(FLASH_START+4,8), i=>i.data.delete(FLASH_START+8), i=>i.data.set(FLASH_START+0xf000,1),
    i=>i.data.set(FLASH_START-1,1)]) {
    const image=c071Image(); edit(image); assert.throws(()=>validateC071Image(image));
  }
});
test('legacy DFU images remain compatible only below the new factory page',()=>{
  const image=c071Image();
  new TextEncoder().encode('YS2-DEV-DFU-v1-C071-62K\0').forEach((b,i)=>image.data.set(FLASH_START+8+i,b));
  assert(validateC071Image(image));
  image.data.set(FLASH_START+0xf000,0);
  assert.throws(()=>validateC071Image(image));
});
test('functional descriptors reject malformed lengths, missing upload and unsupported transfer size',()=>{
  assert.equal(dfuFunctionalDescriptor(configBytes,0).transferSize,1024);
  for(const edit of [b=>b[0]=0,b=>b[29]=8,b=>b[33]=3,b=>b[34]=0]) {
    const b=configBytes.slice();edit(b);assert.throws(()=>dfuFunctionalDescriptor(b,0));
  }
});
test('ROM DFU only erases covered pages, keeps gaps/settings and verifies all 64 KiB before leave',async()=>{
  const link=await connect(), original=link.device.flash.slice(), image=c071Image(), messages=[];
  const result=await programC071(link,image,{update:(m,n)=>messages.push([m,n])});
  assert.deepEqual(result,{verified:true,restartRequested:true});
  const expected=original.slice();for(const [a,b]of image.data)expected[a-FLASH_START]=b;
  assert.deepEqual(link.device.flash,expected);
  assert.deepEqual(link.device.erases,[FLASH_START,FLASH_START+PAGE_SIZE]);
  assert.equal(link.device.writes.length,4);assert(link.device.left && link.device.resetRequested);
  assert.equal(messages.at(-1)[1],100);
  assert(link.device.reads >= 130);
});
test('wrong VID/layout/capacity, unreadable Flash and invalid image never erase',async()=>{
  for(const edit of [d=>d.vendorId=1,d=>d.configurations[0].interfaces[0].alternates[0].interfaceName='@Option Bytes',
    d=>d.configurations[0].interfaces[0].alternates[1].interfaceName='@OTP Memory',
    d=>d.size=128,d=>d.failRead=true]) {
    const d=new Usb();edit(d);
    await assert.rejects(async()=>programC071(await connect(d),c071Image()));
    assert.equal(d.erases.length,0);
  }
  const link=await connect(), image=c071Image();image.data.set(FLASH_START+0xf000,1);
  await assert.rejects(programC071(link,image));assert.equal(link.device.erases.length,0);
});
test('full readback detects modified settings and does not start application',async()=>{
  const link=await connect();link.device.corrupt=true;
  await assert.rejects(programC071(link,c071Image()),/完整讀回/);assert(!link.device.left);
});
test('disconnect on erase is never retried or followed by writes',async()=>{
  const link=await connect();link.device.failErase=true;
  await assert.rejects(programC071(link,c071Image()),/Unplugged/);
  assert.equal(link.device.erases.length,1);assert.equal(link.device.writes.length,0);assert(!link.device.left);
});
test('timeouts close the device, poison the connection and bound poll loops',async()=>{
  const d=new Usb(), link=new RomDfu(d,{transferTimeout:5,pollTimeout:5});
  await link.open();d.controlTransferIn=()=>new Promise(()=>{});
  await assert.rejects(link.status(),/逾時/);assert(link.broken);assert(!d.opened);
  await assert.rejects(link.status(),/已中斷/);
  const another=await connect();another.pollTimeout=2;another.status=async()=>({status:0,state:4,timeout:100});
  await assert.rejects(another.poll(5),/逾時/);
});
test('read/erase/write address bounds and no option-byte or mass erase path',async()=>{
  const link=await connect();
  await assert.rejects(link.memory(0x40022020,4));
  await assert.rejects(link.writePage(FLASH_START+0xf000,new Uint8Array(2048)));
  await assert.rejects(link.writePage(FLASH_START+1,new Uint8Array(2048)));
  await assert.rejects(link.writePage(FLASH_START,new Uint8Array(1)));
  assert.equal(link.device.erases.length,0);
});
test('initial DFU error may be cleared, but programming status errors stop',async()=>{
  const d=new Usb();d.state=10;d.error=10;
  const link=await connect(d);assert.equal(d.state,2);
  d.error=7;await assert.rejects(identifyC071(link),/回報錯誤/);assert.equal(d.erases.length,0);
});
test('verified firmware is reported distinctly when restart cannot be confirmed',async()=>{
  const link=await connect();link.leave=async()=>{throw Error('restart timeout');};
  const result=await programC071(link,c071Image());assert.deepEqual(result,{verified:true,restartRequested:false});
});
