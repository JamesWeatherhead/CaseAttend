import {
  validateSessionEventV1,
  type SessionEventV1,
} from '../core/sessionEvents';

const DATABASE_NAME = 'caseattend-session-events';
const DATABASE_VERSION = 2;
const EVENT_STORE = 'events';
const SESSION_INDEX = 'by-session';
const EVENT_ID_INDEX = 'by-event-id';
const SESSION_SEQUENCE_INDEX = 'by-session-sequence';
const META_STORE = 'metadata';
const TOMBSTONE_STORE = 'deleted-sessions';
const DELETION_EPOCH_KEY = 'deletion-epoch';
const DELETION_CHANNEL_NAME = 'caseattend-session-data-v1';

export const SESSION_DATA_DELETED_EVENT = 'caseattend:session-data-deleted';

export interface SessionDataDeletedDetail {
  all: boolean;
  sessionId?: string;
}

interface SessionDeletionBroadcast {
  detail: SessionDataDeletedDetail;
  deletionEpoch?: number;
}

interface DeletionEpochRecord {
  key: typeof DELETION_EPOCH_KEY;
  value: number;
  invocationCutoff: number;
}

interface DeletedSessionRecord {
  sessionId: string;
}

function dispatchSessionDataDeletion(detail: SessionDataDeletedDetail): void {
  try {
    window.dispatchEvent(new CustomEvent<SessionDataDeletedDetail>(
      SESSION_DATA_DELETED_EVENT,
      { detail },
    ));
  } catch {
    // No browser event target in non-DOM environments.
  }
}

function validDeletionDetail(value: unknown): value is SessionDataDeletedDetail {
  if (typeof value !== 'object' || value === null || !('all' in value)) return false;
  const detail = value as { all?: unknown; sessionId?: unknown };
  if (typeof detail.all !== 'boolean') return false;
  return detail.all
    ? detail.sessionId === undefined
    : typeof detail.sessionId === 'string' && detail.sessionId.trim().length > 0;
}

function openDeletionChannel(): BroadcastChannel | null {
  try {
    return typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function'
      ? null
      : new window.BroadcastChannel(DELETION_CHANNEL_NAME);
  } catch {
    return null;
  }
}

const deletionChannel = openDeletionChannel();
let defaultStoreForBroadcast: SessionStore | null = null;

if (deletionChannel) {
  deletionChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = event.data as Partial<SessionDeletionBroadcast> | null;
    if (!message || !validDeletionDetail(message.detail)) return;
    const deletionEpoch = Number.isSafeInteger(message.deletionEpoch)
      && (message.deletionEpoch as number) >= 0
      ? message.deletionEpoch
      : undefined;
    const shouldDispatch = defaultStoreForBroadcast
      ? defaultStoreForBroadcast.acceptExternalDeletion(message.detail, deletionEpoch)
      : true;
    if (shouldDispatch) dispatchSessionDataDeletion(message.detail);
  });
}

function broadcastSessionDataDeletion(
  detail: SessionDataDeletedDetail,
  deletionEpoch?: number,
): void {
  try {
    deletionChannel?.postMessage({ detail, deletionEpoch } satisfies SessionDeletionBroadcast);
  } catch {
    // The IndexedDB tombstone remains the enforcement boundary when channel
    // delivery is unavailable or a browsing context closes mid-message.
  }
}

interface StoredSessionEvent {
  storageOrder?: number;
  sessionId: string;
  eventId: string;
  sequence: number;
  invokedAt?: number;
  deletionEpoch?: number | null;
  event: SessionEventV1;
}

export interface SessionSummary {
  sessionId: string;
  eventCount: number;
  firstEventAt: string;
  lastEventAt: string;
  startedAt?: string;
  endedAt?: string;
}

export type SessionStorageStatus =
  | {
      mode: 'indexeddb';
      persistent: true;
      message: 'Stored only in this browser.';
    }
  | {
      mode: 'memory';
      persistent: false;
      message:
        | 'Memory-only mode. Data will be lost when this page closes.'
        | 'New events are tab-local. Existing browser rows remain available for deletion.';
      reason: string;
    };

export interface SessionStoreOptions {
  /** Test seam. Production always uses the browser's IndexedDB implementation. */
  indexedDB?: IDBFactory | null;
  databaseName?: string;
  /** Test seam for the cross-tab deletion invocation fence. */
  storageNow?: () => number;
}

export type SessionStoreStatusListener = (status: SessionStorageStatus) => void;
export type SessionStoreDataListener = () => void;

export interface SessionStoreApi {
  getStatus(): SessionStorageStatus;
  subscribeStatus(listener: SessionStoreStatusListener): () => void;
  subscribeData(listener: SessionStoreDataListener): () => void;
  initialize(): Promise<SessionStorageStatus>;
  append(event: SessionEventV1): Promise<void>;
  listEvents(sessionId?: string): Promise<readonly SessionEventV1[]>;
  listSessionSummaries(): Promise<readonly SessionSummary[]>;
  deleteSession(sessionId: string): Promise<number>;
  deleteAll(): Promise<number>;
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
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let settled = false;

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      request = factory.open(name, DATABASE_VERSION);
    } catch (error) {
      rejectOnce(error);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EVENT_STORE)) {
        const events = database.createObjectStore(EVENT_STORE, {
          keyPath: 'storageOrder',
          autoIncrement: true,
        });
        events.createIndex(SESSION_INDEX, 'sessionId', { unique: false });
        events.createIndex(EVENT_ID_INDEX, 'eventId', { unique: true });
        events.createIndex(SESSION_SEQUENCE_INDEX, ['sessionId', 'sequence'], { unique: true });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        const metadata = database.createObjectStore(META_STORE, { keyPath: 'key' });
        metadata.put({
          key: DELETION_EPOCH_KEY,
          value: 0,
          invocationCutoff: 0,
        } satisfies DeletionEpochRecord);
      }
      if (!database.objectStoreNames.contains(TOMBSTONE_STORE)) {
        database.createObjectStore(TOMBSTONE_STORE, { keyPath: 'sessionId' });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        // A blocked request may succeed after its caller has already fallen
        // back to memory. Close that late handle instead of leaking a hidden
        // live connection that can block future upgrades or deletion.
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => rejectOnce(
      request.error ?? new Error('IndexedDB could not be opened.'),
    );
    request.onblocked = () => rejectOnce(
      new Error('IndexedDB upgrade was blocked by another tab.'),
    );
  });
}

function deletionEpoch(record: unknown): number {
  if (typeof record !== 'object' || record === null || !('value' in record)) return 0;
  const value = (record as { value?: unknown }).value;
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function deletionInvocationCutoff(record: unknown): number {
  if (typeof record !== 'object' || record === null || !('invocationCutoff' in record)) return 0;
  const value = (record as { invocationCutoff?: unknown }).invocationCutoff;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function browserStorageNow(): number {
  try {
    const value = performance.timeOrigin + performance.now();
    if (Number.isFinite(value) && value > 0) return value;
  } catch {
    // Date.now is the conservative fallback outside Window contexts.
  }
  return Date.now();
}

class SessionDataInvalidatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionDataInvalidatedError';
  }
}

function isConstraintError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'ConstraintError';
}

function eventTimestamp(event: SessionEventV1): string {
  return event.occurredAt;
}

function fallbackReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  // DOMException is not guaranteed to inherit from Error across browsers or
  // realms, but IndexedDB surfaces most operational failures through it.
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'IndexedDB is unavailable in this browser context.';
}

function browserIndexedDb(): IDBFactory | null {
  try {
    return typeof globalThis.indexedDB === 'undefined' ? null : globalThis.indexedDB;
  } catch {
    return null;
  }
}

/**
 * Browser-local event storage. It intentionally has no localStorage or network
 * path. Every mutation shares one queue, so calls take effect in invocation
 * order even when IndexedDB completes requests at different times.
 */
export class SessionStore implements SessionStoreApi {
  private readonly factory: IDBFactory | null;
  private readonly databaseName: string;
  private readonly storageNow: () => number;
  private databasePromise: Promise<IDBDatabase | null> | null = null;
  private database: IDBDatabase | null = null;
  private fallbackDatabase: IDBDatabase | null = null;
  private memoryEvents: StoredSessionEvent[] = [];
  private memoryDeletedSessions = new Set<string>();
  private nextMemoryOrder = 1;
  private knownDeletionEpoch: number | null = null;
  private deletionGeneration = 0;
  private allDeletionGeneration = 0;
  private sessionDeletionGenerations = new Map<string, number>();
  private sessionInvocationGenerations = new Map<string, number>();
  private mutationQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<SessionStoreStatusListener>();
  private dataListeners = new Set<SessionStoreDataListener>();
  private status: SessionStorageStatus;

  constructor(options: SessionStoreOptions = {}) {
    this.factory = options.indexedDB === undefined
      ? browserIndexedDb()
      : options.indexedDB;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.storageNow = options.storageNow ?? browserStorageNow;
    this.status = this.factory
      ? {
          mode: 'indexeddb',
          persistent: true,
          message: 'Stored only in this browser.',
        }
      : {
          mode: 'memory',
          persistent: false,
          message: 'Memory-only mode. Data will be lost when this page closes.',
          reason: 'IndexedDB is unavailable in this browser context.',
        };
  }

  getStatus(): SessionStorageStatus {
    return this.status;
  }

  subscribeStatus(listener: SessionStoreStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeData(listener: SessionStoreDataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  async initialize(): Promise<SessionStorageStatus> {
    await this.getDatabase();
    return this.status;
  }

  async append(event: SessionEventV1): Promise<void> {
    const snapshot = structuredClone(event);
    // Capture the generation at invocation time, not when the queued mutation
    // eventually runs. Multiple stale writes queued around a cross-tab delete
    // must all fail instead of letting the second one use the refreshed epoch.
    const expectedDeletionEpoch = this.knownDeletionEpoch;
    const invocationGeneration = this.deletionGeneration;
    const invokedAt = this.storageNow();
    const validation = validateSessionEventV1(snapshot);
    if (!validation.valid) {
      throw new Error(`Invalid session event: ${validation.errors.join(' ')}`);
    }
    if (!this.sessionInvocationGenerations.has(snapshot.sessionId)) {
      this.sessionInvocationGenerations.set(snapshot.sessionId, invocationGeneration);
    }

    await this.enqueueMutation(async () => {
      const record: StoredSessionEvent = {
        sessionId: snapshot.sessionId,
        eventId: snapshot.eventId,
        sequence: snapshot.sequence,
        invokedAt,
        deletionEpoch: expectedDeletionEpoch,
        event: snapshot,
      };
      const database = await this.getDatabase();

      if (!database) {
        if (this.fallbackDatabase) {
          await this.assertPersistentDeletionFence(
            this.fallbackDatabase,
            record,
            expectedDeletionEpoch,
            invocationGeneration,
            invokedAt,
          );
        }
        this.appendToMemory(record, invocationGeneration);
        return;
      }

      try {
        await this.appendToDatabase(
          database,
          record,
          expectedDeletionEpoch,
          invocationGeneration,
          invokedAt,
        );
      } catch (error) {
        if (error instanceof SessionDataInvalidatedError) throw error;
        if (isConstraintError(error)) {
          throw new Error(
            `Session event ${snapshot.eventId} duplicates an existing event ID or session sequence.`,
          );
        }
        // Retain the shared persistent copy and keep only the failed write in
        // tab-local memory. Reads merge both sources after rechecking durable
        // deletion fences, so fallback never erases or duplicates another
        // tab's data.
        try {
          await this.migrateDatabaseToMemory(
            database,
            record,
            expectedDeletionEpoch,
            invocationGeneration,
            invokedAt,
            fallbackReason(error),
          );
        } catch (migrationError) {
          if (migrationError instanceof SessionDataInvalidatedError) throw migrationError;
          // If a safe migration cannot be completed, keep the existing database
          // available for preview and deletion and surface the original error.
          throw error;
        }
      }
    });
    this.notifyDataChanged();
  }

  async listEvents(sessionId?: string): Promise<readonly SessionEventV1[]> {
    await this.mutationQueue;
    const database = await this.getDatabase();
    let records: StoredSessionEvent[];

    if (!database && this.fallbackDatabase) {
      records = await this.listFallbackRecords(this.fallbackDatabase, sessionId);
    } else if (!database) {
      records = sessionId
        ? this.memoryEvents.filter((record) => record.sessionId === sessionId)
        : [...this.memoryEvents];
    } else {
      const transaction = database.transaction(EVENT_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const store = transaction.objectStore(EVENT_STORE);
      const request = sessionId
        ? store.index(SESSION_INDEX).getAll(IDBKeyRange.only(sessionId))
        : store.getAll();
      const [loadedRecords] = await Promise.all([
        requestResult(request) as Promise<StoredSessionEvent[]>,
        complete,
      ]);
      records = loadedRecords;
    }

    records.sort((left, right) => (left.storageOrder ?? 0) - (right.storageOrder ?? 0));
    return records.map((record) => structuredClone(record.event));
  }

  async listSessionSummaries(): Promise<readonly SessionSummary[]> {
    const events = await this.listEvents();
    const summaries = new Map<string, SessionSummary>();

    for (const event of events) {
      const timestamp = eventTimestamp(event);
      const summary = summaries.get(event.sessionId) ?? {
        sessionId: event.sessionId,
        eventCount: 0,
        firstEventAt: timestamp,
        lastEventAt: timestamp,
      };
      summary.eventCount += 1;
      if (timestamp < summary.firstEventAt) summary.firstEventAt = timestamp;
      if (timestamp > summary.lastEventAt) summary.lastEventAt = timestamp;
      if (event.event.type === 'session_started') summary.startedAt = timestamp;
      if (event.event.type === 'session_ended') summary.endedAt = timestamp;
      summaries.set(event.sessionId, summary);
    }

    return [...summaries.values()].sort((left, right) =>
      right.lastEventAt.localeCompare(left.lastEventAt));
  }

  async deleteSession(sessionId: string): Promise<number> {
    if (!sessionId.trim()) throw new Error('A session ID is required.');
    // Invalidate an active recorder before the queued deletion runs. Otherwise
    // an in-flight completion could enqueue a new orphan row behind the delete.
    const detail = { all: false, sessionId } satisfies SessionDataDeletedDetail;
    this.registerDeletion(detail);
    dispatchSessionDataDeletion(detail);

    let deleted = 0;
    let deletedPersistently = false;
    await this.enqueueMutation(async () => {
      const database = this.fallbackDatabase ?? await this.getDatabase();
      if (!database) {
        const previousLength = this.memoryEvents.length;
        this.memoryEvents = this.memoryEvents.filter((record) => record.sessionId !== sessionId);
        this.memoryDeletedSessions.add(sessionId);
        deleted = previousLength - this.memoryEvents.length;
        return;
      }

      const deletedEventIds = new Set(
        this.memoryEvents
          .filter((record) => record.sessionId === sessionId)
          .map((record) => record.eventId),
      );
      for (const eventId of await this.purgeSessionsFromDatabase(database, [sessionId])) {
        deletedEventIds.add(eventId);
      }
      this.memoryEvents = this.memoryEvents.filter((record) => record.sessionId !== sessionId);
      this.memoryDeletedSessions.add(sessionId);
      deleted = deletedEventIds.size;
      deletedPersistently = true;
    });
    this.notifyDataChanged();
    if (deletedPersistently && this.databaseName === DATABASE_NAME) {
      broadcastSessionDataDeletion(detail);
    }
    return deleted;
  }

  async deleteAll(): Promise<number> {
    const deletionRequestedAt = this.storageNow();
    const detail = { all: true } satisfies SessionDataDeletedDetail;
    this.registerDeletion(detail);
    dispatchSessionDataDeletion(detail);
    let deleted = 0;
    let nextDeletionEpoch: number | undefined;
    await this.enqueueMutation(async () => {
      const database = this.fallbackDatabase ?? await this.getDatabase();
      if (!database) {
        deleted = this.memoryEvents.length;
        for (const record of this.memoryEvents) {
          this.memoryDeletedSessions.add(record.sessionId);
        }
        this.memoryEvents = [];
        return;
      }

      const deletedEventIds = new Set(this.memoryEvents.map((record) => record.eventId));
      const result = await this.deleteAllFromDatabase(database, deletionRequestedAt);
      for (const eventId of result.deletedEventIds) deletedEventIds.add(eventId);
      deleted = deletedEventIds.size;
      nextDeletionEpoch = result.nextEpoch;
      this.knownDeletionEpoch = nextDeletionEpoch;
      for (const record of this.memoryEvents) {
        this.memoryDeletedSessions.add(record.sessionId);
      }
      this.memoryEvents = [];
    });
    this.notifyDataChanged();
    if (nextDeletionEpoch !== undefined && this.databaseName === DATABASE_NAME) {
      broadcastSessionDataDeletion(detail, nextDeletionEpoch);
    }
    return deleted;
  }

  close(): void {
    this.database?.close();
    if (this.fallbackDatabase && this.fallbackDatabase !== this.database) {
      this.fallbackDatabase.close();
    }
    this.database = null;
    this.fallbackDatabase = null;
    this.databasePromise = null;
  }

  /** Apply a committed deletion announced by another browsing context. */
  acceptExternalDeletion(
    detail: SessionDataDeletedDetail,
    deletionEpochValue?: number,
  ): boolean {
    if (
      detail.all
      && deletionEpochValue !== undefined
      && this.knownDeletionEpoch !== null
      && deletionEpochValue <= this.knownDeletionEpoch
    ) {
      // BroadcastChannel preserves order per sender, not across deleting tabs.
      // Older and already-adopted epochs must never invalidate sessions created
      // afterward, regress state, or emit a duplicate recorder-abandon event.
      return false;
    }
    this.registerDeletion(detail);
    const staleSessionIds = detail.all
      ? [...this.sessionInvocationGenerations.entries()]
        .filter(([, generation]) => generation < this.deletionGeneration)
        .map(([sessionId]) => sessionId)
      : detail.sessionId && this.sessionInvocationGenerations.has(detail.sessionId)
        ? [detail.sessionId]
        : [];
    if (detail.all && deletionEpochValue !== undefined) {
      this.knownDeletionEpoch = Math.max(
        this.knownDeletionEpoch ?? 0,
        deletionEpochValue,
      );
    }
    this.notifyDataChanged();
    // The durable delete transaction may commit before its BroadcastChannel
    // notification is scheduled. Repair only sessions this store invoked before
    // the notification. A blind origin-wide purge could erase a valid session
    // another tab created after the committed delete.
    void this.enqueueMutation(async () => {
      // The notification itself is authoritative for this tab's memory log,
      // including rows loaded from IndexedDB that this store never invoked.
      this.applyDeletionToMemory(detail);

      if (staleSessionIds.length === 0) return;
      const database = this.fallbackDatabase ?? await this.getDatabase();
      if (!database) return;
      await this.purgeSessionsFromDatabase(database, staleSessionIds);
    }).then(() => this.notifyDataChanged()).catch(() => undefined);
    return true;
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  private registerDeletion(detail: SessionDataDeletedDetail): void {
    this.deletionGeneration += 1;
    if (detail.all) {
      this.allDeletionGeneration = this.deletionGeneration;
    } else if (detail.sessionId) {
      this.sessionDeletionGenerations.set(detail.sessionId, this.deletionGeneration);
    }
  }

  private applyDeletionToMemory(detail: SessionDataDeletedDetail): void {
    if (detail.all) {
      for (const record of this.memoryEvents) {
        this.memoryDeletedSessions.add(record.sessionId);
      }
      this.memoryEvents = [];
    } else if (detail.sessionId) {
      this.memoryDeletedSessions.add(detail.sessionId);
      this.memoryEvents = this.memoryEvents.filter(
        (record) => record.sessionId !== detail.sessionId,
      );
    }
  }

  private observeDurableDeletion(detail: SessionDataDeletedDetail): void {
    this.registerDeletion(detail);
    this.applyDeletionToMemory(detail);
    dispatchSessionDataDeletion(detail);
  }

  private deletionSince(
    sessionId: string,
    invocationGeneration: number,
  ): SessionDataDeletedDetail | null {
    if (this.allDeletionGeneration > invocationGeneration) return { all: true };
    if ((this.sessionDeletionGenerations.get(sessionId) ?? 0) > invocationGeneration) {
      return { all: false, sessionId };
    }
    return null;
  }

  private appendToMemory(
    record: StoredSessionEvent,
    invocationGeneration: number,
  ): void {
    const invalidation = this.deletionSince(record.sessionId, invocationGeneration);
    if (invalidation) {
      dispatchSessionDataDeletion(invalidation);
      throw new SessionDataInvalidatedError(
        `Session ${record.sessionId} was deleted before this event could be stored.`,
      );
    }
    if (this.memoryDeletedSessions.has(record.sessionId)) {
      throw new SessionDataInvalidatedError(
        `Session ${record.sessionId} was deleted and cannot be recreated.`,
      );
    }
    if (this.memoryEvents.some((candidate) => candidate.eventId === record.eventId)) {
      throw new Error(`Session event ${record.eventId} already exists.`);
    }
    if (this.memoryEvents.some((candidate) =>
      candidate.sessionId === record.sessionId && candidate.sequence === record.sequence)) {
      throw new Error(`Session ${record.sessionId} already has sequence ${record.sequence}.`);
    }
    this.memoryEvents.push({ ...record, storageOrder: this.nextMemoryOrder });
    this.nextMemoryOrder += 1;
  }

  private async listFallbackRecords(
    database: IDBDatabase,
    sessionId?: string,
  ): Promise<StoredSessionEvent[]> {
    const transaction = database.transaction(
      [EVENT_STORE, META_STORE, TOMBSTONE_STORE],
      'readonly',
    );
    const events = transaction.objectStore(EVENT_STORE);
    const persistentRequest = sessionId
      ? events.index(SESSION_INDEX).getAll(IDBKeyRange.only(sessionId))
      : events.getAll();
    const metadataRequest = transaction.objectStore(META_STORE).get(DELETION_EPOCH_KEY);
    const tombstoneRequest = transaction.objectStore(TOMBSTONE_STORE).getAll();
    const [persistentRecords, metadata, tombstones] = await Promise.all([
      requestResult(persistentRequest) as Promise<StoredSessionEvent[]>,
      requestResult(metadataRequest),
      requestResult(tombstoneRequest) as Promise<DeletedSessionRecord[]>,
      transactionComplete(transaction),
    ]);

    const currentEpoch = deletionEpoch(metadata);
    const invocationCutoff = deletionInvocationCutoff(metadata);
    const deletedSessions = new Set(tombstones.map((record) => record.sessionId));
    this.knownDeletionEpoch = currentEpoch;
    this.memoryEvents = this.memoryEvents.filter((record) => {
      const staleBySession = deletedSessions.has(record.sessionId);
      const staleByEpoch = typeof record.deletionEpoch === 'number'
        ? record.deletionEpoch !== currentEpoch
        : typeof record.invokedAt === 'number' && record.invokedAt <= invocationCutoff;
      if (!staleBySession && !staleByEpoch) return true;
      this.memoryDeletedSessions.add(record.sessionId);
      return false;
    });

    const persistentIds = new Set(persistentRecords.map((record) => record.eventId));
    const maxPersistentOrder = persistentRecords.reduce(
      (maximum, record) => Math.max(maximum, record.storageOrder ?? 0),
      0,
    );
    const memoryRecords = this.memoryEvents
      .filter((record) => !sessionId || record.sessionId === sessionId)
      .filter((record) => !persistentIds.has(record.eventId))
      .map((record) => ({
        ...record,
        storageOrder: maxPersistentOrder + (record.storageOrder ?? 0),
      }));
    return [...persistentRecords, ...memoryRecords];
  }

  private async migrateDatabaseToMemory(
    database: IDBDatabase,
    pendingRecord: StoredSessionEvent,
    expectedDeletionEpoch: number | null,
    invocationGeneration: number,
    invokedAt: number,
    reason: string,
  ): Promise<void> {
    // Keep the shared persistent copy and its connection intact. Memory mode
    // contains only writes that actually failed persistence. Reads merge these
    // pending rows with the live DB rather than duplicating a stale snapshot.
    this.useMemoryFallback(reason, database);
    await this.assertPersistentDeletionFence(
      database,
      pendingRecord,
      expectedDeletionEpoch,
      invocationGeneration,
      invokedAt,
    );
    this.appendToMemory(pendingRecord, invocationGeneration);
  }

  private appendToDatabase(
    database: IDBDatabase,
    record: StoredSessionEvent,
    expectedDeletionEpoch: number | null,
    invocationGeneration: number,
    invokedAt: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      let explicitError: unknown;

      try {
        transaction = database.transaction(
          [EVENT_STORE, META_STORE, TOMBSTONE_STORE],
          'readwrite',
        );
      } catch (error) {
        reject(error);
        return;
      }

      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(
        explicitError
          ?? transaction.error
          ?? new Error('IndexedDB transaction was aborted.'),
      );
      transaction.onerror = () => {
        explicitError ??= transaction.error ?? new Error('IndexedDB transaction failed.');
      };

      const metadata = transaction.objectStore(META_STORE);
      const tombstones = transaction.objectStore(TOMBSTONE_STORE);
      const events = transaction.objectStore(EVENT_STORE);
      const epochRequest = metadata.get(DELETION_EPOCH_KEY);

      epochRequest.onerror = () => {
        explicitError = epochRequest.error ?? new Error('Deletion epoch could not be read.');
      };
      epochRequest.onsuccess = () => {
        const announcedDeletion = this.deletionSince(
          record.sessionId,
          invocationGeneration,
        );
        if (announcedDeletion) {
          dispatchSessionDataDeletion(announcedDeletion);
          explicitError = new SessionDataInvalidatedError(
            `Session ${record.sessionId} was deleted before this event could be stored.`,
          );
          try {
            transaction.abort();
          } catch {
            reject(explicitError);
          }
          return;
        }

        const currentEpoch = deletionEpoch(epochRequest.result);
        const currentInvocationCutoff = deletionInvocationCutoff(epochRequest.result);
        if (expectedDeletionEpoch === null && invokedAt <= currentInvocationCutoff) {
          this.knownDeletionEpoch = currentEpoch;
          dispatchSessionDataDeletion({ all: true });
          explicitError = new SessionDataInvalidatedError(
            'Session data was deleted after this event was invoked and before it could be stored.',
          );
          try {
            transaction.abort();
          } catch {
            reject(explicitError);
          }
          return;
        }
        const appendEpoch = expectedDeletionEpoch ?? this.knownDeletionEpoch ?? currentEpoch;
        const epochChanged = appendEpoch !== currentEpoch;
        if (epochChanged) {
          this.knownDeletionEpoch = currentEpoch;
          dispatchSessionDataDeletion({ all: true });
          explicitError = new SessionDataInvalidatedError(
            'Session data was deleted in another browser tab before this event could be stored.',
          );
          try {
            transaction.abort();
          } catch {
            reject(explicitError);
          }
          return;
        }
        this.knownDeletionEpoch = currentEpoch;

        const tombstoneRequest = tombstones.get(record.sessionId);
        tombstoneRequest.onerror = () => {
          explicitError = tombstoneRequest.error
            ?? new Error('Deleted-session marker could not be read.');
        };
        tombstoneRequest.onsuccess = () => {
          const lateAnnouncement = this.deletionSince(
            record.sessionId,
            invocationGeneration,
          );
          if (lateAnnouncement) {
            dispatchSessionDataDeletion(lateAnnouncement);
            explicitError = new SessionDataInvalidatedError(
              `Session ${record.sessionId} was deleted before this event could be stored.`,
            );
            try {
              transaction.abort();
            } catch {
              reject(explicitError);
            }
            return;
          }
          if (tombstoneRequest.result !== undefined) {
            const detail = { all: false, sessionId: record.sessionId } satisfies SessionDataDeletedDetail;
            dispatchSessionDataDeletion(detail);
            explicitError = new SessionDataInvalidatedError(
              `Session ${record.sessionId} was deleted in this browser and cannot be recreated.`,
            );
            try {
              transaction.abort();
            } catch {
              reject(explicitError);
            }
            return;
          }

          try {
            const addRequest = events.add(record);
            addRequest.onerror = () => {
              explicitError = addRequest.error ?? new Error('Session event could not be stored.');
            };
            addRequest.onsuccess = () => {
              const finalAnnouncement = this.deletionSince(
                record.sessionId,
                invocationGeneration,
              );
              if (!finalAnnouncement) return;
              dispatchSessionDataDeletion(finalAnnouncement);
              explicitError = new SessionDataInvalidatedError(
                `Session ${record.sessionId} was deleted before this event could be stored.`,
              );
              try {
                transaction.abort();
              } catch {
                reject(explicitError);
              }
            };
          } catch (error) {
            explicitError = error;
            try {
              transaction.abort();
            } catch {
              reject(error);
            }
          }
        };
      };
    });
  }

  private async assertPersistentDeletionFence(
    database: IDBDatabase,
    record: StoredSessionEvent,
    expectedDeletionEpoch: number | null,
    invocationGeneration: number,
    invokedAt: number,
  ): Promise<void> {
    const announcedDeletion = this.deletionSince(record.sessionId, invocationGeneration);
    if (announcedDeletion) {
      this.applyDeletionToMemory(announcedDeletion);
      dispatchSessionDataDeletion(announcedDeletion);
      throw new SessionDataInvalidatedError(
        `Session ${record.sessionId} was deleted before this event could be stored.`,
      );
    }

    const transaction = database.transaction([META_STORE, TOMBSTONE_STORE], 'readonly');
    const metadataRequest = transaction.objectStore(META_STORE).get(DELETION_EPOCH_KEY);
    const tombstoneRequest = transaction.objectStore(TOMBSTONE_STORE).get(record.sessionId);
    const [metadata, tombstone] = await Promise.all([
      requestResult(metadataRequest),
      requestResult(tombstoneRequest),
      transactionComplete(transaction),
    ]);

    const lateAnnouncement = this.deletionSince(record.sessionId, invocationGeneration);
    if (lateAnnouncement) {
      this.applyDeletionToMemory(lateAnnouncement);
      dispatchSessionDataDeletion(lateAnnouncement);
      throw new SessionDataInvalidatedError(
        `Session ${record.sessionId} was deleted before this event could be stored.`,
      );
    }
    const currentEpoch = deletionEpoch(metadata);
    if (expectedDeletionEpoch === null && invokedAt <= deletionInvocationCutoff(metadata)) {
      this.knownDeletionEpoch = currentEpoch;
      this.observeDurableDeletion({ all: true });
      throw new SessionDataInvalidatedError(
        'Session data was deleted after this event was invoked and before it could be stored.',
      );
    }
    if (expectedDeletionEpoch !== null && expectedDeletionEpoch !== currentEpoch) {
      this.knownDeletionEpoch = currentEpoch;
      this.observeDurableDeletion({ all: true });
      throw new SessionDataInvalidatedError(
        'Session data was deleted in another browser tab before this event could be stored.',
      );
    }
    this.knownDeletionEpoch = currentEpoch;
    if (tombstone !== undefined) {
      const detail = { all: false, sessionId: record.sessionId } satisfies SessionDataDeletedDetail;
      this.observeDurableDeletion(detail);
      throw new SessionDataInvalidatedError(
        `Session ${record.sessionId} was deleted in this browser and cannot be recreated.`,
      );
    }
  }

  private deleteAllFromDatabase(
    database: IDBDatabase,
    invocationCutoff: number,
  ): Promise<{ deletedEventIds: readonly string[]; nextEpoch: number }> {
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      const deletedEventIds: string[] = [];
      let nextEpoch = 0;

      try {
        transaction = database.transaction(
          [EVENT_STORE, META_STORE, TOMBSTONE_STORE],
          'readwrite',
        );
      } catch (error) {
        reject(error);
        return;
      }

      transaction.oncomplete = () => resolve({ deletedEventIds, nextEpoch });
      transaction.onabort = () => reject(
        transaction.error ?? new Error('IndexedDB deletion was aborted.'),
      );
      transaction.onerror = () => reject(
        transaction.error ?? new Error('IndexedDB deletion failed.'),
      );

      const events = transaction.objectStore(EVENT_STORE);
      const metadata = transaction.objectStore(META_STORE);
      const tombstones = transaction.objectStore(TOMBSTONE_STORE);
      const cursorRequest = events.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const record = cursor.value as StoredSessionEvent;
        tombstones.put({ sessionId: record.sessionId } satisfies DeletedSessionRecord);
        cursor.delete();
        deletedEventIds.push(record.eventId);
        cursor.continue();
      };

      const epochRequest = metadata.get(DELETION_EPOCH_KEY);
      epochRequest.onsuccess = () => {
        nextEpoch = deletionEpoch(epochRequest.result) + 1;
        metadata.put({
          key: DELETION_EPOCH_KEY,
          value: nextEpoch,
          invocationCutoff: Math.max(
            deletionInvocationCutoff(epochRequest.result),
            invocationCutoff,
          ),
        } satisfies DeletionEpochRecord);
      };
    });
  }

  private purgeSessionsFromDatabase(
    database: IDBDatabase,
    sessionIds: readonly string[],
  ): Promise<readonly string[]> {
    const transaction = database.transaction([EVENT_STORE, TOMBSTONE_STORE], 'readwrite');
    const complete = transactionComplete(transaction);
    const deletedEventIds: string[] = [];
    const events = transaction.objectStore(EVENT_STORE);
    const tombstones = transaction.objectStore(TOMBSTONE_STORE);
    for (const sessionId of sessionIds) {
      tombstones.put({ sessionId } satisfies DeletedSessionRecord);
      const request = events.index(SESSION_INDEX).openCursor(IDBKeyRange.only(sessionId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        deletedEventIds.push((cursor.value as StoredSessionEvent).eventId);
        events.delete(cursor.primaryKey);
        cursor.continue();
      };
    }
    return complete.then(() => deletedEventIds);
  }

  private getDatabase(): Promise<IDBDatabase | null> {
    if (!this.factory || this.status.mode === 'memory') return Promise.resolve(null);
    if (this.database) return Promise.resolve(this.database);
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = openDatabase(this.factory, this.databaseName)
      .then(async (database) => {
        this.database = database;
        database.onversionchange = () => {
          database.close();
          if (this.database === database) this.database = null;
          if (this.fallbackDatabase === database) this.fallbackDatabase = null;
          this.databasePromise = null;
        };
        const transaction = database.transaction(META_STORE, 'readonly');
        const [epochRecord] = await Promise.all([
          requestResult(transaction.objectStore(META_STORE).get(DELETION_EPOCH_KEY)),
          transactionComplete(transaction),
        ]);
        if (this.knownDeletionEpoch === null) {
          this.knownDeletionEpoch = deletionEpoch(epochRecord);
        }
        return database;
      })
      .catch((error: unknown) => {
        this.useMemoryFallback(fallbackReason(error));
        return null;
      });
    return this.databasePromise;
  }

  private useMemoryFallback(reason: string, retainedDatabase?: IDBDatabase): void {
    if (this.database && this.database !== retainedDatabase) this.database.close();
    this.fallbackDatabase = retainedDatabase ?? null;
    this.database = null;
    this.databasePromise = null;
    this.status = {
      mode: 'memory',
      persistent: false,
      message: retainedDatabase
        ? 'New events are tab-local. Existing browser rows remain available for deletion.'
        : 'Memory-only mode. Data will be lost when this page closes.',
      reason,
    };
    for (const listener of this.listeners) listener(this.status);
  }

  private notifyDataChanged(): void {
    for (const listener of this.dataListeners) listener();
  }
}

export const sessionStore = new SessionStore();
defaultStoreForBroadcast = sessionStore;
