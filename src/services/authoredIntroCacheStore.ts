/**
 * Browser-local store for author-generated intro caches (issue #70).
 *
 * The shipped corpus (issue #68) lives at `public/intro-cache/<caseId>.json`.
 * Cases an educator creates in Case Studio have no static host path, so the
 * runtime falls back to this store. Records are keyed by `caseId` and hold a
 * validated `IntroCacheV1` — same schema as the shipped artifact, so runtime
 * treats both identically.
 *
 * Isolation: this uses its own IndexedDB database (`caseattend-authored-intro-caches`),
 * separate from the case package store, so schema migration on either side does
 * not accidentally require bumping the other.
 */

import { validateIntroCacheV1, type IntroCacheV1 } from '../core/introCache';

const DATABASE_NAME = 'caseattend-authored-intro-caches';
const DATABASE_VERSION = 1;
const CACHE_STORE = 'intro-caches';

export type AuthoredIntroCacheListener = () => void;

export interface AuthoredIntroCacheStoreOptions {
  /** Test seam. Production uses the current browser's IndexedDB. */
  indexedDB?: IDBFactory | null;
  databaseName?: string;
}

interface StoredIntroCacheRecord {
  id: string;
  cache: IntroCacheV1;
  updatedAt: string;
}

function browserIndexedDb(): IDBFactory | null {
  try {
    return typeof globalThis.indexedDB === 'undefined' ? null : globalThis.indexedDB;
  } catch {
    return null;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error ?? new Error('IndexedDB transaction was aborted.'),
    );
    transaction.onerror = () => reject(
      transaction.error ?? new Error('IndexedDB transaction failed.'),
    );
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DATABASE_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked by another tab.'));
  });
}

/**
 * A minimal IndexedDB-backed intro-cache store. Refuses to persist artifacts
 * that fail the shared schema check, so a corrupt or partially-generated cache
 * cannot silently ship to a learner. Fails soft on missing IndexedDB (memory
 * fallback) so browser sessions in restricted contexts still function.
 */
export class AuthoredIntroCacheStore {
  private readonly factory: IDBFactory | null;
  private readonly databaseName: string;
  private databasePromise: Promise<IDBDatabase | null> | null = null;
  private memoryFallback = new Map<string, StoredIntroCacheRecord>();
  private listeners = new Set<AuthoredIntroCacheListener>();

  constructor(options: AuthoredIntroCacheStoreOptions = {}) {
    this.factory = options.indexedDB === undefined ? browserIndexedDb() : options.indexedDB;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
  }

  subscribe(listener: AuthoredIntroCacheListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async save(cache: IntroCacheV1): Promise<void> {
    const validation = validateIntroCacheV1(cache);
    if (!validation.valid) {
      throw new Error(
        `Refusing to persist an invalid Intro Cache v1 artifact:\n${validation.errors.map((e) => `- ${e}`).join('\n')}`,
      );
    }
    const record: StoredIntroCacheRecord = {
      id: cache.caseId,
      cache: structuredClone(cache),
      updatedAt: new Date().toISOString(),
    };
    const database = await this.getDatabase();
    if (!database) {
      this.memoryFallback.set(record.id, record);
      this.notifyChanged();
      return;
    }
    try {
      const transaction = database.transaction(CACHE_STORE, 'readwrite');
      const complete = transactionComplete(transaction);
      transaction.objectStore(CACHE_STORE).put(record);
      await complete;
      this.memoryFallback.delete(record.id);
    } catch {
      this.memoryFallback.set(record.id, record);
    }
    this.notifyChanged();
  }

  async get(caseId: string): Promise<IntroCacheV1 | null> {
    const database = await this.getDatabase();
    if (database) {
      try {
        const transaction = database.transaction(CACHE_STORE, 'readonly');
        const complete = transactionComplete(transaction);
        const record = await requestResult(
          transaction.objectStore(CACHE_STORE).get(caseId),
        ) as StoredIntroCacheRecord | undefined;
        await complete;
        if (record) return structuredClone(record.cache);
      } catch {
        // fall through to memory
      }
    }
    const record = this.memoryFallback.get(caseId);
    return record ? structuredClone(record.cache) : null;
  }

  async delete(caseId: string): Promise<boolean> {
    let deleted = this.memoryFallback.delete(caseId);
    const database = await this.getDatabase();
    if (database) {
      try {
        const transaction = database.transaction(CACHE_STORE, 'readwrite');
        const complete = transactionComplete(transaction);
        const existing = await requestResult(
          transaction.objectStore(CACHE_STORE).get(caseId),
        ) as StoredIntroCacheRecord | undefined;
        transaction.objectStore(CACHE_STORE).delete(caseId);
        await complete;
        if (existing) deleted = true;
      } catch {
        // memory-only fallback already handled above
      }
    }
    if (deleted) this.notifyChanged();
    return deleted;
  }

  private notifyChanged(): void {
    for (const listener of this.listeners) listener();
  }

  private async getDatabase(): Promise<IDBDatabase | null> {
    if (!this.factory) return null;
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(this.factory, this.databaseName).catch(() => null);
    }
    return this.databasePromise;
  }
}

export const authoredIntroCacheStore = new AuthoredIntroCacheStore();
