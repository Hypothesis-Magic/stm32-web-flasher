import { importKey, decrypt, fetchBytes, validateManifest, verifyFile } from './vault-crypto.mjs';

// Shared with firmware-downloads. The path is a namespace, not a storage boundary.
export const ACCESS_KEY_STORAGE = 'hmf-access-key:v1:/firmware-downloads/';
export const CATALOG_BASE = '/firmware-downloads/protected/';
export const MAX_HEX_BYTES = 2 * 1024 * 1024;
const cancelled = () => new DOMException('Cancelled', 'AbortError');

export class FirmwareCatalog {
  #key = null;
  #files = new Map();
  #generation = 0;
  #controller = new AbortController();

  reset() {
    this.#generation++;
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#key = null;
    this.#files.clear();
  }

  async unlock(text) {
    this.reset();
    const generation = this.#generation, signal = this.#controller.signal;
    let plain;
    try {
      const key = await importKey(text);
      if (generation !== this.#generation) throw cancelled();
      const encrypted = await fetchBytes(CATALOG_BASE + 'manifest.enc', 1024 * 1024 + 33, signal);
      plain = await decrypt(key, 'manifest', encrypted);
      const manifest = validateManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)));
      if (generation !== this.#generation) throw cancelled();
      // A downloadable file is not necessarily an input supported by this flasher.
      const projects = manifest.projects.map(project => ({ ...project,
        releases: project.releases.map(release => ({ ...release,
          files: release.files.filter(file => /\.hex$/i.test(file.downloadName) && file.bytes > 0 && file.bytes <= MAX_HEX_BYTES)
        })).filter(release => release.files.length)
      })).filter(project => project.releases.length);
      for (const project of projects) for (const release of project.releases) for (const file of release.files) {
        this.#files.set(file.id, { ...file });
      }
      this.#key = key;
      return projects;
    } finally {
      if (plain) new Uint8Array(plain).fill(0);
    }
  }

  async readHex(id, signal) {
    const file = this.#files.get(id), key = this.#key, generation = this.#generation;
    if (!file || !key) throw new Error('catalog');
    const activeSignal = signal ? AbortSignal.any([signal, this.#controller.signal]) : this.#controller.signal;
    let plain;
    try {
      activeSignal.throwIfAborted();
      const encrypted = await fetchBytes(CATALOG_BASE + file.id + '.enc', file.bytes + 33, activeSignal);
      plain = await decrypt(key, 'blob/' + file.id, encrypted);
      await verifyFile(file, plain);
      activeSignal.throwIfAborted();
      if (generation !== this.#generation) throw cancelled();
      return new TextDecoder('utf-8', { fatal: true }).decode(plain);
    } finally {
      if (plain) new Uint8Array(plain).fill(0);
    }
  }
}
