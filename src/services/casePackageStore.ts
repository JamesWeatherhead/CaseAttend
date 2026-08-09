import type { DomainKey } from '../lib/domains/types';
import {
  decodePortableAssetBytes,
  detectPortableImageMimeType,
  encodePortableAssetBytes,
  parsePortableAssetUri,
  readPortableImageDimensions,
  validatePortableCasePackageV1,
  type PortableCaseAssetV1,
  type PortableCasePackageV1,
  type PortableImageMimeType,
} from '../core/portableCasePackage';

const DATABASE_NAME = 'caseattend-case-packages';
const DATABASE_VERSION = 1;
const CASE_STORE = 'cases';
const ASSET_STORE = 'assets';
const DRAFT_STORE = 'drafts';
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const DRAFT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SYNC_CHANNEL_NAME = 'caseattend-case-packages-v1';
const SYNC_MESSAGE_SCHEMA = 'caseattend.case-package-store-sync';

export type CasePackageStorageStatus =
  | {
      mode: 'indexeddb';
      persistent: true;
      message: 'Cases and drafts are stored only in this browser.';
    }
  | {
      mode: 'memory';
      persistent: false;
      message: 'Memory-only mode. Cases and drafts will be lost when this page closes.';
      reason: string;
    };

export interface CasePackageSummary {
  id: string;
  title: string;
  domain: DomainKey;
  difficulty: PortableCasePackageV1['casePackage']['difficulty'];
  caseManifestSha256: string;
  lessonPlanId: string;
  lessonPlanVersion: string;
  assetCount: number;
  totalAssetBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface CasePackageDraftRecord<T = unknown> {
  id: string;
  value: T;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCasePackageOptions {
  /** Remove this authoring draft in the same transaction as the completed case. */
  draftId?: string;
  /**
   * Optimistic replacement guard. When set, the current same-ID case must
   * exist with exactly this manifest before any case, asset, or draft write.
   */
  expectedCaseManifestSha256?: string | null;
}

export interface CasePackageStoreOptions {
  /** Test seam. Production uses the current browser's IndexedDB implementation. */
  indexedDB?: IDBFactory | null;
  databaseName?: string;
  now?: () => Date;
  /** Test seam. Production uses a same-origin BroadcastChannel when available. */
  syncChannel?: CasePackageStoreSyncChannel | null;
}

export interface CasePackageStoreSyncChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

export type CasePackageStoreListener = () => void;
export type CasePackageStoreStatusListener = (status: CasePackageStorageStatus) => void;

interface StoredAssetDescriptor {
  uri: string;
  sha256: string;
  mimeType: PortableImageMimeType;
  byteLength: number;
  width: number;
  height: number;
}

interface StoredCaseRecord {
  id: string;
  schema: PortableCasePackageV1['schema'];
  schemaVersion: PortableCasePackageV1['schemaVersion'];
  casePackage: PortableCasePackageV1['casePackage'];
  lessonPlan: PortableCasePackageV1['lessonPlan'];
  assets: StoredAssetDescriptor[];
  createdAt: string;
  updatedAt: string;
}

interface StoredAssetRecord extends StoredAssetDescriptor {
  bytes: ArrayBuffer;
}

class CasePackageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CasePackageConflictError';
  }
}

function browserIndexedDb(): IDBFactory | null {
  try {
    return typeof globalThis.indexedDB === 'undefined' ? null : globalThis.indexedDB;
  } catch {
    return null;
  }
}

function browserSyncChannel(): CasePackageStoreSyncChannel | null {
  try {
    return typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined'
      ? null
      : new window.BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch {
    return null;
  }
}

function externalDeletedCaseId(message: unknown): string | null {
  if (
    typeof message !== 'object'
    || message === null
    || Array.isArray(message)
  ) return null;
  const record = message as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3
    || record.schema !== SYNC_MESSAGE_SCHEMA
    || record.type !== 'case-deleted'
    || typeof record.id !== 'string'
    || !CASE_ID_PATTERN.test(record.id)
  ) return null;
  return record.id;
}

function fallbackReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'IndexedDB is unavailable in this browser context.';
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
    let settled = false;
    try {
      request = factory.open(name, DATABASE_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CASE_STORE)) {
        database.createObjectStore(CASE_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        database.createObjectStore(ASSET_STORE, { keyPath: 'sha256' });
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error('IndexedDB could not be opened.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB upgrade was blocked by another tab.'));
    };
  });
}

function cloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function storedAsset(asset: PortableCaseAssetV1): StoredAssetRecord {
  return {
    uri: asset.uri,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    width: asset.width,
    height: asset.height,
    bytes: cloneArrayBuffer(decodePortableAssetBytes(asset.bytesBase64)),
  };
}

function assetDescriptor(asset: PortableCaseAssetV1): StoredAssetDescriptor {
  const { bytesBase64: _bytesBase64, ...descriptor } = asset;
  return descriptor;
}

function toStoredCase(
  portablePackage: PortableCasePackageV1,
  createdAt: string,
  updatedAt: string,
): StoredCaseRecord {
  return {
    id: portablePackage.casePackage.id,
    schema: portablePackage.schema,
    schemaVersion: portablePackage.schemaVersion,
    casePackage: structuredClone(portablePackage.casePackage),
    lessonPlan: structuredClone(portablePackage.lessonPlan),
    assets: portablePackage.assets.map(assetDescriptor),
    createdAt,
    updatedAt,
  };
}

function toSummary(record: StoredCaseRecord): CasePackageSummary {
  return {
    id: record.id,
    title: record.casePackage.title,
    domain: record.casePackage.domain,
    difficulty: record.casePackage.difficulty,
    caseManifestSha256: record.casePackage.manifest.sha256,
    lessonPlanId: record.lessonPlan.id,
    lessonPlanVersion: record.lessonPlan.version,
    assetCount: record.assets.length,
    totalAssetBytes: record.assets.reduce((total, asset) => total + asset.byteLength, 0),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function validateDraftId(id: string): void {
  if (!DRAFT_ID_PATTERN.test(id)) {
    throw new Error('Draft IDs must use 1 to 128 lowercase letters, numbers, or hyphens.');
  }
}

function assertExpectedManifest(
  existing: StoredCaseRecord | undefined,
  expectedCaseManifestSha256: string | null | undefined,
  id: string,
): void {
  if (expectedCaseManifestSha256 === undefined) return;
  if (expectedCaseManifestSha256 === null) {
    if (existing) {
      throw new CasePackageConflictError(
        `Browser-local case '${id}' already exists. Choose a different ID.`,
      );
    }
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(expectedCaseManifestSha256)) {
    throw new CasePackageConflictError(
      'expectedCaseManifestSha256 must be a lowercase SHA-256 digest or null.',
    );
  }
  if (!existing) {
    throw new CasePackageConflictError(
      `Browser-local case '${id}' no longer exists. Reload before saving this edit.`,
    );
  }
  if (existing.casePackage.manifest.sha256 !== expectedCaseManifestSha256) {
    throw new CasePackageConflictError(
      `Browser-local case '${id}' changed in another view. Reload before saving this edit.`,
    );
  }
}

function snapshotDraft<T>(value: T): T {
  const visited = new Set<object>();
  const assertJsonValue = (candidate: unknown, path: string): void => {
    if (
      candidate === null
      || typeof candidate === 'string'
      || typeof candidate === 'boolean'
    ) return;
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw new Error(`${path} must be a finite number.`);
      return;
    }
    if (typeof candidate !== 'object') {
      throw new Error(`${path} must contain only JSON-compatible data.`);
    }
    if (visited.has(candidate)) throw new Error(`${path} cannot contain a circular reference.`);
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`));
    } else {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`${path} must contain only plain JSON objects.`);
      }
      for (const [key, entry] of Object.entries(candidate)) {
        assertJsonValue(entry, `${path}.${key}`);
      }
    }
    visited.delete(candidate);
  };
  assertJsonValue(value, 'draft');
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('A Case Studio draft must contain only JSON-compatible data.');
  }
  if (serialized === undefined) {
    throw new Error('A Case Studio draft must contain a JSON value.');
  }
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > MAX_DRAFT_BYTES) {
    throw new Error(`Case Studio drafts cannot exceed ${MAX_DRAFT_BYTES} bytes.`);
  }
  return JSON.parse(serialized) as T;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Stored asset verification requires crypto.subtle.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A browser-local repository for authored cases. It has no localStorage or
 * network path. A completed case, its verified bytes, and optional draft
 * removal share one IndexedDB transaction so a failed import preserves the
 * previous draft.
 */
export class CasePackageStore {
  private readonly factory: IDBFactory | null;
  private readonly databaseName: string;
  private readonly now: () => Date;
  private readonly syncChannel: CasePackageStoreSyncChannel | null;
  private databasePromise: Promise<IDBDatabase | null> | null = null;
  private database: IDBDatabase | null = null;
  private fallbackDatabase: IDBDatabase | null = null;
  private memoryCases = new Map<string, StoredCaseRecord>();
  private memoryAssets = new Map<string, StoredAssetRecord>();
  private memoryDrafts = new Map<string, CasePackageDraftRecord>();
  private hiddenPersistentCases = new Set<string>();
  private hiddenPersistentDrafts = new Set<string>();
  private mutationQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<CasePackageStoreListener>();
  private statusListeners = new Set<CasePackageStoreStatusListener>();
  private resolvedAssetUrls = new Map<string, string>();
  private status: CasePackageStorageStatus;
  private readonly onSyncMessage = (event: MessageEvent<unknown>): void => {
    const id = externalDeletedCaseId(event.data);
    if (!id) return;
    this.memoryCases.delete(id);
    this.hiddenPersistentCases.add(id);
    this.garbageCollectMemoryAssets();
    // Case-to-asset reference counts are not included in the deliberately
    // minimal sync message, so conservatively release local URL handles.
    this.releaseAllAssetUris();
    this.notifyChanged();
  };

  constructor(options: CasePackageStoreOptions = {}) {
    this.factory = options.indexedDB === undefined ? browserIndexedDb() : options.indexedDB;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.now = options.now ?? (() => new Date());
    this.syncChannel = options.syncChannel === undefined
      ? browserSyncChannel()
      : options.syncChannel;
    this.syncChannel?.addEventListener('message', this.onSyncMessage);
    this.status = this.factory
      ? {
          mode: 'indexeddb',
          persistent: true,
          message: 'Cases and drafts are stored only in this browser.',
        }
      : {
          mode: 'memory',
          persistent: false,
          message: 'Memory-only mode. Cases and drafts will be lost when this page closes.',
          reason: 'IndexedDB is unavailable in this browser context.',
        };
  }

  getStatus(): CasePackageStorageStatus {
    return this.status;
  }

  subscribe(listener: CasePackageStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener: CasePackageStoreStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async initialize(): Promise<CasePackageStorageStatus> {
    await this.getDatabase();
    return this.status;
  }

  async save(
    portablePackage: PortableCasePackageV1,
    options: SaveCasePackageOptions = {},
  ): Promise<CasePackageSummary> {
    const snapshot = structuredClone(portablePackage);
    const validation = await validatePortableCasePackageV1(snapshot);
    if (!validation.valid) {
      throw new Error(
        `Cannot store an invalid Portable Case Package v1:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`,
      );
    }
    if (options.draftId !== undefined) validateDraftId(options.draftId);

    let summary!: CasePackageSummary;
    await this.enqueueMutation(async () => {
      if (this.hiddenPersistentCases.has(snapshot.casePackage.id)) {
        throw new Error(
          `Browser-local case '${snapshot.casePackage.id}' was deleted in another tab. Reload before creating a new case with that ID.`,
        );
      }
      const database = await this.getDatabase();
      if (this.hiddenPersistentCases.has(snapshot.casePackage.id)) {
        throw new Error(
          `Browser-local case '${snapshot.casePackage.id}' was deleted in another tab. Reload before creating a new case with that ID.`,
        );
      }
      const timestamp = this.now().toISOString();
      if (!database) {
        const existing = this.memoryCases.get(snapshot.casePackage.id)
          ?? await this.getPersistentCaseRecord(snapshot.casePackage.id);
        if (this.hiddenPersistentCases.has(snapshot.casePackage.id)) {
          throw new Error(
            `Browser-local case '${snapshot.casePackage.id}' was deleted in another tab. Reload before creating a new case with that ID.`,
          );
        }
        assertExpectedManifest(
          existing,
          options.expectedCaseManifestSha256,
          snapshot.casePackage.id,
        );
        const record = toStoredCase(snapshot, existing?.createdAt ?? timestamp, timestamp);
        this.saveToMemory(record, snapshot.assets, options.draftId);
        summary = toSummary(record);
        return;
      }

      try {
        const existing = await this.readCaseRecord(database, snapshot.casePackage.id);
        const record = toStoredCase(snapshot, existing?.createdAt ?? timestamp, timestamp);
        await this.saveToDatabase(
          database,
          record,
          snapshot.assets,
          options.draftId,
          options.expectedCaseManifestSha256,
        );
        this.memoryCases.delete(record.id);
        this.hiddenPersistentCases.delete(record.id);
        if (options.draftId) {
          this.memoryDrafts.delete(options.draftId);
          this.hiddenPersistentDrafts.delete(options.draftId);
        }
        summary = toSummary(record);
      } catch (error) {
        if (error instanceof CasePackageConflictError) throw error;
        if (this.hiddenPersistentCases.has(snapshot.casePackage.id)) {
          // A same-origin tab deleted this case while this save was waiting on
          // IndexedDB reads. Do not reinterpret that concurrency conflict as a
          // storage outage or resurrect the stale bundle in memory.
          throw error;
        }
        this.useMemoryFallback(error, database);
        let persistentExisting: StoredCaseRecord | undefined;
        try {
          persistentExisting = await this.getPersistentCaseRecord(snapshot.casePackage.id);
        } catch {
          if (options.expectedCaseManifestSha256 !== undefined) {
            throw new Error(
              `Browser-local case '${snapshot.casePackage.id}' could not be checked for a newer revision. Reload before saving this edit.`,
            );
          }
          // The complete validated input can still be retained in memory when
          // the failed database can no longer answer a read-only request.
        }
        const existing = this.memoryCases.get(snapshot.casePackage.id) ?? persistentExisting;
        assertExpectedManifest(
          existing,
          options.expectedCaseManifestSha256,
          snapshot.casePackage.id,
        );
        const record = toStoredCase(snapshot, existing?.createdAt ?? timestamp, timestamp);
        this.saveToMemory(record, snapshot.assets, options.draftId);
        summary = toSummary(record);
      }
    });
    this.notifyChanged();
    return summary;
  }

  async list(): Promise<readonly CasePackageSummary[]> {
    await this.mutationQueue;
    const records = new Map<string, StoredCaseRecord>();
    const database = this.fallbackDatabase ?? await this.getDatabase();
    if (database) {
      for (const record of await this.readAllCaseRecords(database)) {
        if (!this.hiddenPersistentCases.has(record.id)) records.set(record.id, record);
      }
    }
    for (const [id, record] of this.memoryCases) records.set(id, record);
    return [...records.values()]
      .map(toSummary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  }

  async get(id: string): Promise<PortableCasePackageV1 | null> {
    await this.mutationQueue;
    const memoryRecord = this.memoryCases.get(id);
    if (memoryRecord) return this.rehydrateFromMemory(memoryRecord);
    if (this.hiddenPersistentCases.has(id)) return null;
    const database = this.fallbackDatabase ?? await this.getDatabase();
    if (!database) return null;
    const record = await this.readCaseRecord(database, id);
    if (!record) return null;
    return this.rehydrateFromDatabase(database, record);
  }

  async delete(id: string): Promise<boolean> {
    if (!id.trim()) throw new Error('A case ID is required.');
    let assetUris: string[] = [];
    try {
      assetUris = (await this.get(id))?.assets.map((asset) => asset.uri) ?? [];
    } catch {
      // Corrupt data must remain deletable even if it cannot be opened.
    }
    let deleted = false;
    let persistentExisted = false;
    await this.enqueueMutation(async () => {
      const memoryRecord = this.memoryCases.get(id);
      const existedInMemory = this.memoryCases.delete(id);
      const database = this.fallbackDatabase ?? await this.getDatabase();
      if (!database) {
        this.garbageCollectMemoryAssets();
        deleted = existedInMemory;
        return;
      }
      try {
        const persistent = await this.readCaseRecord(database, id);
        persistentExisted = persistent !== undefined;
        if (persistent) await this.deleteFromDatabase(database, id);
        this.hiddenPersistentCases.delete(id);
        this.garbageCollectMemoryAssets();
        deleted = existedInMemory || persistentExisted;
      } catch (error) {
        this.useMemoryFallback(error, database);
        if (memoryRecord) this.memoryCases.set(id, memoryRecord);
        this.hiddenPersistentCases.delete(id);
        this.garbageCollectMemoryAssets();
        // Sensitive authored data must never be reported as deleted while a
        // durable IndexedDB row can reappear after reload.
        throw new Error(
          `Browser-local case '${id}' could not be deleted from durable browser storage. Export it if needed, then retry the deletion.`,
          { cause: error },
        );
      }
    });
    for (const uri of assetUris) this.releaseAssetUri(uri);
    if (deleted) this.notifyChanged();
    // Memory-only records are tab-local. Broadcasting their deletion could
    // incorrectly hide an unrelated durable same-ID row in another tab.
    if (persistentExisted) {
      this.syncChannel?.postMessage({
        schema: SYNC_MESSAGE_SCHEMA,
        type: 'case-deleted',
        id,
      });
    }
    return deleted;
  }

  async saveDraft<T>(id: string, value: T): Promise<CasePackageDraftRecord<T>> {
    validateDraftId(id);
    const snapshot = snapshotDraft(value);
    let saved!: CasePackageDraftRecord<T>;
    await this.enqueueMutation(async () => {
      const database = await this.getDatabase();
      const timestamp = this.now().toISOString();
      if (!database) {
        let existing = this.memoryDrafts.get(id);
        try {
          existing ??= await this.getPersistentDraft(id);
        } catch {
          // A fresh in-memory draft is safer than losing the user's edit.
        }
        saved = {
          id,
          value: snapshot,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        this.memoryDrafts.set(id, saved as CasePackageDraftRecord);
        this.hiddenPersistentDrafts.delete(id);
        return;
      }
      try {
        const existing = this.memoryDrafts.get(id) ?? await this.readDraft(database, id);
        saved = {
          id,
          value: snapshot,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        const transaction = database.transaction(DRAFT_STORE, 'readwrite');
        const complete = transactionComplete(transaction);
        transaction.objectStore(DRAFT_STORE).put(saved);
        await complete;
        this.memoryDrafts.delete(id);
        this.hiddenPersistentDrafts.delete(id);
      } catch (error) {
        this.useMemoryFallback(error, database);
        let existing = this.memoryDrafts.get(id);
        try {
          existing ??= await this.getPersistentDraft(id);
        } catch {
          // Preserve the new draft even if the failed database is unreadable.
        }
        saved = {
          id,
          value: snapshot,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        this.memoryDrafts.set(id, saved as CasePackageDraftRecord);
        this.hiddenPersistentDrafts.delete(id);
      }
    });
    this.notifyChanged();
    return structuredClone(saved);
  }

  async getDraft<T = unknown>(id: string): Promise<CasePackageDraftRecord<T> | null> {
    await this.mutationQueue;
    const memory = this.memoryDrafts.get(id);
    if (memory) return structuredClone(memory) as CasePackageDraftRecord<T>;
    if (this.hiddenPersistentDrafts.has(id)) return null;
    const database = this.fallbackDatabase ?? await this.getDatabase();
    if (!database) return null;
    const record = await this.readDraft(database, id);
    return record ? structuredClone(record) as CasePackageDraftRecord<T> : null;
  }

  async listDrafts<T = unknown>(): Promise<readonly CasePackageDraftRecord<T>[]> {
    await this.mutationQueue;
    const records = new Map<string, CasePackageDraftRecord>();
    const database = this.fallbackDatabase ?? await this.getDatabase();
    if (database) {
      const transaction = database.transaction(DRAFT_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const loaded = await requestResult(transaction.objectStore(DRAFT_STORE).getAll()) as CasePackageDraftRecord[];
      await complete;
      for (const record of loaded) {
        if (!this.hiddenPersistentDrafts.has(record.id)) records.set(record.id, record);
      }
    }
    for (const [id, record] of this.memoryDrafts) records.set(id, record);
    return [...records.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
      .map((record) => structuredClone(record) as CasePackageDraftRecord<T>);
  }

  async deleteDraft(id: string): Promise<boolean> {
    validateDraftId(id);
    let deleted = false;
    let persistentExisted = false;
    await this.enqueueMutation(async () => {
      const memoryRecord = this.memoryDrafts.get(id);
      const memoryDeleted = this.memoryDrafts.delete(id);
      const database = this.fallbackDatabase ?? await this.getDatabase();
      if (!database) {
        deleted = memoryDeleted;
        return;
      }
      try {
        const existing = await this.readDraft(database, id);
        persistentExisted = existing !== undefined;
        const transaction = database.transaction(DRAFT_STORE, 'readwrite');
        const complete = transactionComplete(transaction);
        transaction.objectStore(DRAFT_STORE).delete(id);
        await complete;
        this.hiddenPersistentDrafts.delete(id);
        deleted = memoryDeleted || persistentExisted;
      } catch (error) {
        this.useMemoryFallback(error, database);
        if (memoryRecord) this.memoryDrafts.set(id, memoryRecord);
        this.hiddenPersistentDrafts.delete(id);
        throw new Error(
          `Case Studio draft '${id}' could not be deleted from durable browser storage. Retry the deletion before relying on it being gone.`,
          { cause: error },
        );
      }
    });
    if (deleted) this.notifyChanged();
    return deleted;
  }

  /** Resolve one immutable `case://assets/<digest>.<ext>` URI to a local Blob URL. */
  async resolveAssetUri(uri: string): Promise<string> {
    const cached = this.resolvedAssetUrls.get(uri);
    if (cached) return cached;
    const blob = await this.getAssetBlob(uri);
    if (typeof URL.createObjectURL !== 'function') {
      throw new Error('This browser cannot create a local URL for the stored case asset.');
    }
    const objectUrl = URL.createObjectURL(blob);
    this.resolvedAssetUrls.set(uri, objectUrl);
    return objectUrl;
  }

  /** Read verified local bytes directly so viewer code never needs a fetch path. */
  async getAssetBlob(uri: string): Promise<Blob> {
    const parsed = parsePortableAssetUri(uri);
    if (!parsed) throw new Error(`'${uri}' is not a valid portable case asset URI.`);

    await this.mutationQueue;
    const memory = this.memoryAssets.get(parsed.sha256);
    let asset = memory;
    if (!asset) {
      const database = this.fallbackDatabase ?? await this.getDatabase();
      if (database) asset = await this.readAsset(database, parsed.sha256);
    }
    if (!asset || asset.uri !== uri || asset.mimeType !== parsed.mimeType) {
      throw new Error(`Portable case asset '${uri}' is not stored in this browser.`);
    }
    const bytes = new Uint8Array(asset.bytes);
    const detectedMimeType = detectPortableImageMimeType(bytes);
    const dimensions = detectedMimeType
      ? readPortableImageDimensions(bytes, detectedMimeType)
      : null;
    if (
      asset.byteLength !== asset.bytes.byteLength
      || await sha256(asset.bytes) !== parsed.sha256
      || detectedMimeType !== parsed.mimeType
      || dimensions?.width !== asset.width
      || dimensions?.height !== asset.height
    ) {
      throw new Error(`Stored portable case asset '${uri}' failed its SHA-256 integrity check.`);
    }
    return new Blob([asset.bytes.slice(0)], { type: asset.mimeType });
  }

  releaseAssetUri(uri: string): void {
    const objectUrl = this.resolvedAssetUrls.get(uri);
    if (!objectUrl) return;
    this.resolvedAssetUrls.delete(uri);
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Revocation is best-effort in test and restricted browser contexts.
    }
  }

  releaseAllAssetUris(): void {
    for (const uri of [...this.resolvedAssetUrls.keys()]) this.releaseAssetUri(uri);
  }

  close(): void {
    this.releaseAllAssetUris();
    this.database?.close();
    if (this.fallbackDatabase && this.fallbackDatabase !== this.database) {
      this.fallbackDatabase.close();
    }
    this.database = null;
    this.fallbackDatabase = null;
    this.databasePromise = null;
    this.syncChannel?.removeEventListener('message', this.onSyncMessage);
    this.syncChannel?.close();
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  private notifyChanged(): void {
    for (const listener of this.listeners) listener();
  }

  private useMemoryFallback(error: unknown, database?: IDBDatabase): void {
    if (database) this.fallbackDatabase = database;
    this.database = null;
    this.databasePromise = Promise.resolve(null);
    const nextStatus: CasePackageStorageStatus = {
      mode: 'memory',
      persistent: false,
      message: 'Memory-only mode. Cases and drafts will be lost when this page closes.',
      reason: fallbackReason(error),
    };
    const changed = this.status.mode !== 'memory' || this.status.reason !== nextStatus.reason;
    this.status = nextStatus;
    if (changed) {
      for (const listener of this.statusListeners) listener(nextStatus);
    }
  }

  private async getDatabase(): Promise<IDBDatabase | null> {
    if (!this.factory) return null;
    if (this.database) return this.database;
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(this.factory, this.databaseName)
        .then((database) => {
          this.database = database;
          database.onversionchange = () => database.close();
          return database;
        })
        .catch((error) => {
          this.useMemoryFallback(error);
          return null;
        });
    }
    return this.databasePromise;
  }

  private saveToMemory(
    record: StoredCaseRecord,
    assets: readonly PortableCaseAssetV1[],
    draftId?: string,
  ): void {
    this.memoryCases.set(record.id, structuredClone(record));
    this.hiddenPersistentCases.delete(record.id);
    for (const asset of assets) this.memoryAssets.set(asset.sha256, storedAsset(asset));
    if (draftId) {
      this.memoryDrafts.delete(draftId);
      this.hiddenPersistentDrafts.add(draftId);
    }
    this.garbageCollectMemoryAssets();
  }

  private async saveToDatabase(
    database: IDBDatabase,
    record: StoredCaseRecord,
    assets: readonly PortableCaseAssetV1[],
    draftId?: string,
    expectedCaseManifestSha256?: string | null,
  ): Promise<void> {
    const transaction = database.transaction([CASE_STORE, ASSET_STORE, DRAFT_STORE], 'readwrite');
    const complete = transactionComplete(transaction);
    try {
      const cases = transaction.objectStore(CASE_STORE);
      const assetStore = transaction.objectStore(ASSET_STORE);
      const [previousCases, previousAssets] = await Promise.all([
        requestResult(cases.getAll()) as Promise<StoredCaseRecord[]>,
        requestResult(assetStore.getAll()) as Promise<StoredAssetRecord[]>,
      ]);
      assertExpectedManifest(
        previousCases.find((candidate) => candidate.id === record.id),
        expectedCaseManifestSha256,
        record.id,
      );
      if (this.hiddenPersistentCases.has(record.id)) {
        throw new Error(
          `Browser-local case '${record.id}' was deleted in another tab. Reload before creating a new case with that ID.`,
        );
      }
      cases.put(record);
      for (const asset of assets) assetStore.put(storedAsset(asset));
      const referenced = new Set([
        ...previousCases
          .filter((candidate) => candidate.id !== record.id)
          .flatMap((candidate) => candidate.assets.map((asset) => asset.sha256)),
        ...record.assets.map((asset) => asset.sha256),
      ]);
      for (const previousAsset of previousAssets) {
        if (!referenced.has(previousAsset.sha256)) assetStore.delete(previousAsset.sha256);
      }
      if (draftId) transaction.objectStore(DRAFT_STORE).delete(draftId);
      await complete;
    } catch (error) {
      // Synchronous IDB errors such as DataCloneError do not necessarily abort
      // a transaction. Abort explicitly so a queued case put cannot commit
      // without its asset bytes or while its source draft remains ambiguous.
      try {
        transaction.abort();
      } catch {
        // The transaction may already have aborted or completed.
      }
      await complete.catch(() => undefined);
      throw error;
    }
  }

  private async deleteFromDatabase(database: IDBDatabase, id: string): Promise<void> {
    const transaction = database.transaction([CASE_STORE, ASSET_STORE], 'readwrite');
    const complete = transactionComplete(transaction);
    try {
      const cases = transaction.objectStore(CASE_STORE);
      const assets = transaction.objectStore(ASSET_STORE);
      const allCasesRequest = cases.getAll();
      const allAssetsRequest = assets.getAll();
      const [allCases, allAssets] = await Promise.all([
        requestResult(allCasesRequest) as Promise<StoredCaseRecord[]>,
        requestResult(allAssetsRequest) as Promise<StoredAssetRecord[]>,
      ]);
      cases.delete(id);
      const referenced = new Set(
        allCases
          .filter((record) => record.id !== id)
          .flatMap((record) => record.assets.map((asset) => asset.sha256)),
      );
      for (const asset of allAssets) {
        if (!referenced.has(asset.sha256)) assets.delete(asset.sha256);
      }
      await complete;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have aborted or completed.
      }
      await complete.catch(() => undefined);
      throw error;
    }
  }

  private garbageCollectMemoryAssets(): void {
    const referenced = new Set(
      [...this.memoryCases.values()].flatMap((record) => record.assets.map((asset) => asset.sha256)),
    );
    for (const digest of this.memoryAssets.keys()) {
      if (!referenced.has(digest)) this.memoryAssets.delete(digest);
    }
  }

  private async readCaseRecord(database: IDBDatabase, id: string): Promise<StoredCaseRecord | undefined> {
    const transaction = database.transaction(CASE_STORE, 'readonly');
    const complete = transactionComplete(transaction);
    const result = await requestResult(transaction.objectStore(CASE_STORE).get(id)) as StoredCaseRecord | undefined;
    await complete;
    return result;
  }

  private async readAllCaseRecords(database: IDBDatabase): Promise<StoredCaseRecord[]> {
    const transaction = database.transaction(CASE_STORE, 'readonly');
    const complete = transactionComplete(transaction);
    const result = await requestResult(transaction.objectStore(CASE_STORE).getAll()) as StoredCaseRecord[];
    await complete;
    return result;
  }

  private async readAsset(database: IDBDatabase, digest: string): Promise<StoredAssetRecord | undefined> {
    const transaction = database.transaction(ASSET_STORE, 'readonly');
    const complete = transactionComplete(transaction);
    const result = await requestResult(transaction.objectStore(ASSET_STORE).get(digest)) as StoredAssetRecord | undefined;
    await complete;
    return result;
  }

  private async readDraft(database: IDBDatabase, id: string): Promise<CasePackageDraftRecord | undefined> {
    const transaction = database.transaction(DRAFT_STORE, 'readonly');
    const complete = transactionComplete(transaction);
    const result = await requestResult(transaction.objectStore(DRAFT_STORE).get(id)) as CasePackageDraftRecord | undefined;
    await complete;
    return result;
  }

  private async getPersistentCaseRecord(id: string): Promise<StoredCaseRecord | undefined> {
    if (!this.fallbackDatabase || this.hiddenPersistentCases.has(id)) return undefined;
    return this.readCaseRecord(this.fallbackDatabase, id);
  }

  private async getPersistentDraft(id: string): Promise<CasePackageDraftRecord | undefined> {
    if (!this.fallbackDatabase || this.hiddenPersistentDrafts.has(id)) return undefined;
    return this.readDraft(this.fallbackDatabase, id);
  }

  private async rehydrateFromMemory(record: StoredCaseRecord): Promise<PortableCasePackageV1> {
    const assets = record.assets.map((descriptor): PortableCaseAssetV1 => {
      const stored = this.memoryAssets.get(descriptor.sha256);
      if (!stored) throw new Error(`Stored case '${record.id}' is missing asset ${descriptor.sha256}.`);
      return { ...descriptor, bytesBase64: encodePortableAssetBytes(new Uint8Array(stored.bytes)) };
    });
    return this.verifyRehydrated(record, assets);
  }

  private async rehydrateFromDatabase(
    database: IDBDatabase,
    record: StoredCaseRecord,
  ): Promise<PortableCasePackageV1> {
    const transaction = database.transaction(ASSET_STORE, 'readonly');
    const complete = transactionComplete(transaction);
    const requests = record.assets.map((descriptor) => ({
      descriptor,
      request: transaction.objectStore(ASSET_STORE).get(descriptor.sha256),
    }));
    const loaded = await Promise.all(requests.map(async ({ descriptor, request }) => {
      const stored = await requestResult(request) as StoredAssetRecord | undefined;
      if (!stored) throw new Error(`Stored case '${record.id}' is missing asset ${descriptor.sha256}.`);
      return {
        ...descriptor,
        bytesBase64: encodePortableAssetBytes(new Uint8Array(stored.bytes)),
      } satisfies PortableCaseAssetV1;
    }));
    await complete;
    return this.verifyRehydrated(record, loaded);
  }

  private async verifyRehydrated(
    record: StoredCaseRecord,
    assets: PortableCaseAssetV1[],
  ): Promise<PortableCasePackageV1> {
    const portablePackage: PortableCasePackageV1 = {
      schema: record.schema,
      schemaVersion: record.schemaVersion,
      casePackage: structuredClone(record.casePackage),
      lessonPlan: structuredClone(record.lessonPlan),
      assets,
    };
    const validation = await validatePortableCasePackageV1(portablePackage);
    if (!validation.valid) {
      throw new Error(
        `Stored case '${record.id}' failed integrity validation: ${validation.errors.join(' ')}`,
      );
    }
    return portablePackage;
  }

}

export const casePackageStore = new CasePackageStore();
