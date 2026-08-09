/**
 * Vitest global setup.
 *
 * The test environment is jsdom, but Node 22+ ships experimental Web Storage
 * globals (`Storage`, `localStorage`, `sessionStorage` backed by
 * `internal/webstorage`) that shadow jsdom's. Node's `localStorage` getter
 * returns `undefined` unless the process was started with `--localstorage-file`
 * (and merely reading it emits an ExperimentalWarning), and its `Storage` class
 * is a native "illegal constructor" that cannot be instantiated. Together that
 * leaves browser-direct persistence code and its tests without a usable
 * `localStorage`.
 *
 * We install a small, spec-shaped Storage polyfill and point `Storage`,
 * `localStorage`, and `sessionStorage` at it. Because the instances inherit from
 * the same `Storage.prototype` the tests spy on
 * (`vi.spyOn(Storage.prototype, 'getItem')`), those spies affect `localStorage`
 * exactly as they would in a browser. jsdom does not implement IndexedDB or
 * matchMedia either, so we restore those here as well.
 */

import 'fake-indexeddb/auto';

class MemoryStorage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    const value = this.store.get(String(key));
    return value === undefined ? null : value;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

const isUsableStorage = (candidate: unknown): candidate is Storage =>
  !!candidate &&
  typeof (candidate as Storage).getItem === 'function' &&
  typeof (candidate as Storage).setItem === 'function';

const defineGlobal = (name: string, value: unknown): void => {
  const descriptor: PropertyDescriptor = {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  };
  Object.defineProperty(globalThis, name, descriptor);
  if (typeof window !== 'undefined' && window !== (globalThis as unknown)) {
    Object.defineProperty(window, name, descriptor);
  }
};

// Node's experimental Web Storage installs a getter whose source requires
// `internal/webstorage`; invoking it returns an unusable value AND emits an
// ExperimentalWarning on every test worker. Detect it by source so we can skip
// the read entirely rather than trip the warning while probing.
const isNodeExperimentalStorage = (name: string): boolean => {
  const getter =
    Object.getOwnPropertyDescriptor(globalThis, name)?.get ??
    (typeof window !== 'undefined'
      ? Object.getOwnPropertyDescriptor(window, name)?.get
      : undefined);
  return typeof getter === 'function' && /internal\/webstorage/.test(getter.toString());
};

// Only replace storage when the shadowing native global is unusable, so a real
// browser-shaped environment (if one is ever provided) is left untouched. Both
// slots move together onto one Storage class so `instanceof Storage` and
// Storage.prototype spies behave identically for localStorage and sessionStorage.
let nativeUsable = false;
if (!isNodeExperimentalStorage('localStorage')) {
  try {
    nativeUsable = isUsableStorage(globalThis.localStorage);
  } catch {
    nativeUsable = false;
  }
}

if (!nativeUsable) {
  defineGlobal('Storage', MemoryStorage);
  defineGlobal('localStorage', new MemoryStorage());
  defineGlobal('sessionStorage', new MemoryStorage());
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}
