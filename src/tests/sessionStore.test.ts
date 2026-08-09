// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDBFactory as FakeIDBFactory,
  IDBKeyRange as FakeIDBKeyRange,
  IDBObjectStore as FakeIDBObjectStore,
} from 'fake-indexeddb';
import {
  exportSessionEventsCsv,
  exportSessionEventsJsonl,
} from '../core/sessionExports';
import type { SessionEventV1 } from '../core/sessionEvents';
import { SessionStore } from '../services/sessionStore';

const SESSION_ONE = '10000000-0000-4000-8000-000000000001';
const SESSION_TWO = '20000000-0000-4000-8000-000000000002';
const SESSION_THREE = '60000000-0000-4000-8000-000000000006';

function makeStartEvent(overrides: Partial<SessionEventV1> = {}): SessionEventV1 {
  return {
    schema: 'caseattend.session-event',
    schemaVersion: '1.0',
    appVersion: '0.2.0',
    eventId: '30000000-0000-4000-8000-000000000003',
    sessionId: SESSION_ONE,
    sequence: 0,
    occurredAt: '2026-08-09T12:00:00.000Z',
    casePackageRef: {
      id: 'derm-example',
      schemaVersion: '1.0',
      sha256: '1'.repeat(64),
    },
    lessonPlanRef: {
      id: 'derm-example-lesson',
      version: '1.0.0',
      sha256: '2'.repeat(64),
    },
    event: { type: 'session_started', startReason: 'case_opened' },
    ...overrides,
  };
}

function makeEndEvent(overrides: Partial<SessionEventV1> = {}): SessionEventV1 {
  return makeStartEvent({
    eventId: '40000000-0000-4000-8000-000000000004',
    sequence: 1,
    occurredAt: '2026-08-09T12:05:00.000Z',
    event: { type: 'session_ended', reason: 'navigation' },
    ...overrides,
  });
}

describe('SessionStore', () => {
  const fetchSpy = vi.fn();
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('serializes appends in invocation order and summarizes lifecycle events', async () => {
    const store = new SessionStore({ indexedDB: null });
    const start = makeStartEvent();
    const end = makeEndEvent();

    const firstAppend = store.append(start);
    const secondAppend = store.append(end);
    const eventsBeforeAwaitingAppends = await store.listEvents(SESSION_ONE);
    await Promise.all([firstAppend, secondAppend]);

    expect(eventsBeforeAwaitingAppends.map((event) => event.eventId)).toEqual([
      start.eventId,
      end.eventId,
    ]);
    expect(await store.listSessionSummaries()).toEqual([{
      sessionId: SESSION_ONE,
      eventCount: 2,
      firstEventAt: start.occurredAt,
      lastEventAt: end.occurredAt,
      startedAt: start.occurredAt,
      endedAt: end.occurredAt,
    }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('snapshots and validates an event before the queued write', async () => {
    const store = new SessionStore({ indexedDB: null });
    const event = makeStartEvent();
    const pending = store.append(event);

    (event as unknown as Record<string, unknown>).apiKey = 'must-not-be-stored';
    await pending;

    const [stored] = await store.listEvents(SESSION_ONE);
    expect(stored).not.toHaveProperty('apiKey');

    const unsafe = {
      ...makeEndEvent(),
      authorization: 'Bearer must-not-be-stored',
    } as unknown as SessionEventV1;
    await expect(store.append(unsafe)).rejects.toThrow(/invalid session event/i);
    expect(await store.listEvents(SESSION_ONE)).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects duplicate per-session sequences instead of creating an ambiguous log', async () => {
    const store = new SessionStore({ indexedDB: null });
    await store.append(makeStartEvent());

    await expect(store.append(makeEndEvent({ sequence: 0 }))).rejects.toThrow(
      /already has sequence 0/i,
    );
    expect(await store.listEvents(SESSION_ONE)).toHaveLength(1);
  });

  it('deletes one session or all sessions without touching other browser storage', async () => {
    const store = new SessionStore({ indexedDB: null });
    await store.append(makeStartEvent());
    await store.append(makeStartEvent({
      eventId: '50000000-0000-4000-8000-000000000005',
      sessionId: SESSION_TWO,
    }));

    expect(await store.deleteSession(SESSION_ONE)).toBe(1);
    expect((await store.listSessionSummaries()).map((summary) => summary.sessionId)).toEqual([
      SESSION_TWO,
    ]);
    expect(await store.deleteAll()).toBe(1);
    expect(await store.listEvents()).toEqual([]);
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('reports a visible memory-only fallback when IndexedDB cannot open', async () => {
    const brokenIndexedDb = {
      open: () => {
        throw new Error('Storage is blocked for this test.');
      },
    } as unknown as IDBFactory;
    const store = new SessionStore({ indexedDB: brokenIndexedDb });
    const statusChanges = vi.fn();
    store.subscribeStatus(statusChanges);

    const status = await store.initialize();

    expect(status).toEqual({
      mode: 'memory',
      persistent: false,
      message: 'Memory-only mode. Data will be lost when this page closes.',
      reason: 'Storage is blocked for this test.',
    });
    expect(statusChanges).toHaveBeenCalledWith(status);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('persists events across a close and reopen with a real IndexedDB implementation', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-reopen';
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const initialStore = new SessionStore({ indexedDB, databaseName });
    const start = makeStartEvent();
    const end = makeEndEvent();

    expect(await initialStore.initialize()).toEqual({
      mode: 'indexeddb',
      persistent: true,
      message: 'Stored only in this browser.',
    });
    await initialStore.append(start);
    await initialStore.append(end);
    initialStore.close();

    const reopenedStore = new SessionStore({ indexedDB, databaseName });
    expect((await reopenedStore.listEvents()).map((event) => event.eventId)).toEqual([
      start.eventId,
      end.eventId,
    ]);
    expect(await reopenedStore.listSessionSummaries()).toEqual([{
      sessionId: SESSION_ONE,
      eventCount: 2,
      firstEventAt: start.occurredAt,
      lastEventAt: end.occurredAt,
      startedAt: start.occurredAt,
      endedAt: end.occurredAt,
    }]);
    reopenedStore.close();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('uses a durable tombstone so another open store cannot recreate a deleted session', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-cross-tab-session-delete';
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const deletingStore = new SessionStore({ indexedDB, databaseName });
    const staleStore = new SessionStore({ indexedDB, databaseName });
    await Promise.all([deletingStore.initialize(), staleStore.initialize()]);
    await deletingStore.append(makeStartEvent());

    expect(await deletingStore.deleteSession(SESSION_ONE)).toBe(1);
    await expect(staleStore.append(makeEndEvent())).rejects.toThrow(
      /was deleted .* cannot be recreated/i,
    );
    expect(await staleStore.listEvents()).toEqual([]);

    const newSession = makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000007',
      sessionId: SESSION_TWO,
    });
    await staleStore.append(newSession);
    expect((await deletingStore.listEvents()).map((event) => event.sessionId)).toEqual([
      SESSION_TWO,
    ]);
    deletingStore.close();
    staleStore.close();
  });

  it('rejects every stale queued write after delete all, including a session with no stored row', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-cross-tab-delete-all-race';
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const deletingStore = new SessionStore({ indexedDB, databaseName });
    const staleStore = new SessionStore({ indexedDB, databaseName });
    await Promise.all([deletingStore.initialize(), staleStore.initialize()]);
    await deletingStore.append(makeStartEvent());
    expect(await deletingStore.deleteAll()).toBe(1);

    // This session never had a row for deleteAll to tombstone. Its stale
    // generation must still fail, as must a second write queued before the
    // first rejection refreshes the stale store's epoch.
    const absentStart = makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000008',
      sessionId: SESSION_TWO,
    });
    const absentEnd = makeEndEvent({
      eventId: '70000000-0000-4000-8000-000000000009',
      sessionId: SESSION_TWO,
    });
    const firstStaleAppend = staleStore.append(absentStart);
    const secondStaleAppend = staleStore.append(absentEnd);
    await expect(firstStaleAppend).rejects.toThrow(/deleted in another browser tab/i);
    await expect(secondStaleAppend).rejects.toThrow(/deleted in another browser tab/i);
    expect(await staleStore.listEvents()).toEqual([]);

    // Once the invalidation has been observed, a newly created session uses
    // the current epoch and remains usable.
    await staleStore.append(makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000010',
      sessionId: SESSION_THREE,
    }));
    expect((await deletingStore.listEvents()).map((event) => event.sessionId)).toEqual([
      SESSION_THREE,
    ]);
    deletingStore.close();
    staleStore.close();
  });

  it('rejects a deferred pre-delete append without purging another tab post-delete session', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-deferred-first-open-delete-race';
    let storageTime = 1;
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const deletingStore = new SessionStore({
      indexedDB,
      databaseName,
      storageNow: () => storageTime,
    });
    await deletingStore.initialize();

    const openGate: { release?: () => void } = {};
    let markUnderlyingOpen!: () => void;
    const underlyingOpen = new Promise<void>((resolve) => {
      markUnderlyingOpen = resolve;
    });
    const deferredFactory = {
      open: (name: string, version?: number) => {
        const actualRequest = version === undefined
          ? indexedDB.open(name)
          : indexedDB.open(name, version);
        const facade = {
          get result() {
            return actualRequest.result;
          },
          get error() {
            return actualRequest.error;
          },
          onsuccess: null,
          onerror: null,
          onblocked: null,
          onupgradeneeded: null,
        } as unknown as IDBOpenDBRequest;
        actualRequest.onsuccess = (event) => {
          markUnderlyingOpen();
          openGate.release = () => facade.onsuccess?.call(facade, event);
        };
        actualRequest.onerror = (event) => facade.onerror?.call(facade, event);
        actualRequest.onblocked = (event) => facade.onblocked?.call(facade, event);
        actualRequest.onupgradeneeded = (event) => (
          facade.onupgradeneeded?.call(facade, event)
        );
        return facade;
      },
    } as unknown as IDBFactory;
    const delayedStore = new SessionStore({
      indexedDB: deferredFactory,
      databaseName,
      storageNow: () => storageTime,
    });

    // The append is invoked with neither an open database nor a known epoch.
    // Its underlying connection succeeds, but SessionStore cannot yet read it.
    const pendingAppend = delayedStore.append(makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000011',
      sessionId: SESSION_TWO,
    }));
    await underlyingOpen;

    storageTime = 2;
    expect(await deletingStore.deleteAll()).toBe(0);
    // The deleting tab legitimately starts fresh after its delete commits, but
    // before the delayed tab receives the broadcast.
    storageTime = 3;
    await deletingStore.append(makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000012',
      sessionId: SESSION_THREE,
    }));
    // Simulate a missing BroadcastChannel notification: the delayed store has
    // neither adopted the new epoch nor registered an in-memory invalidation.
    expect(openGate.release).toBeTypeOf('function');
    openGate.release?.();

    await expect(pendingAppend).rejects.toThrow(/deleted after this event was invoked/i);
    // The persisted invocation cutoff rejects SESSION_TWO without any repair
    // sweep, preserving SESSION_THREE from the deleting tab.
    expect((await delayedStore.listEvents()).map((event) => event.sessionId)).toEqual([
      SESSION_THREE,
    ]);
    expect((await deletingStore.listEvents()).map((event) => event.sessionId)).toEqual([
      SESSION_THREE,
    ]);
    deletingStore.close();
    delayedStore.close();
  });

  it('ignores an out-of-order older delete-all broadcast after a fresh newer-epoch session', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-out-of-order-delete-epochs';
    let storageTime = 1;
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const deletingStore = new SessionStore({
      indexedDB,
      databaseName,
      storageNow: () => storageTime,
    });
    const receivingStore = new SessionStore({
      indexedDB,
      databaseName,
      storageNow: () => storageTime,
    });
    await Promise.all([deletingStore.initialize(), receivingStore.initialize()]);

    expect(await deletingStore.deleteAll()).toBe(0); // epoch 1
    storageTime = 2;
    expect(await deletingStore.deleteAll()).toBe(0); // epoch 2
    receivingStore.acceptExternalDeletion({ all: true }, 2);
    await receivingStore.listEvents();

    storageTime = 3;
    const freshStart = makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000016',
      sessionId: SESSION_THREE,
    });
    await receivingStore.append(freshStart);

    // A delayed message from the epoch-1 deleting tab must neither purge the
    // fresh row nor regress knownDeletionEpoch and break its next append.
    receivingStore.acceptExternalDeletion({ all: true }, 1);
    await receivingStore.append(makeEndEvent({
      eventId: '70000000-0000-4000-8000-000000000017',
      sessionId: SESSION_THREE,
    }));
    expect((await receivingStore.listEvents()).map((event) => event.eventId)).toEqual([
      freshStart.eventId,
      '70000000-0000-4000-8000-000000000017',
    ]);
    deletingStore.close();
    receivingStore.close();
  });

  it('treats an equal-epoch delete-all notification as idempotent after a fresh session', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-equal-delete-epoch';
    let storageTime = 1;
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const deletingStore = new SessionStore({
      indexedDB,
      databaseName,
      storageNow: () => storageTime,
    });
    await deletingStore.initialize();
    expect(await deletingStore.deleteAll()).toBe(0); // epoch 1

    // This tab learns epoch 1 from IndexedDB before the delayed epoch-1 channel
    // message arrives, then legitimately starts a new session.
    const receivingStore = new SessionStore({
      indexedDB,
      databaseName,
      storageNow: () => storageTime,
    });
    await receivingStore.initialize();
    storageTime = 2;
    const freshStart = makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000018',
      sessionId: SESSION_THREE,
    });
    await receivingStore.append(freshStart);

    expect(receivingStore.acceptExternalDeletion({ all: true }, 1)).toBe(false);
    await receivingStore.append(makeEndEvent({
      eventId: '70000000-0000-4000-8000-000000000019',
      sessionId: SESSION_THREE,
    }));
    expect((await receivingStore.listEvents()).map((event) => event.eventId)).toEqual([
      freshStart.eventId,
      '70000000-0000-4000-8000-000000000019',
    ]);
    deletingStore.close();
    receivingStore.close();
  });

  it('closes a database handle that succeeds after a blocked open already fell back', async () => {
    let request: IDBOpenDBRequest | undefined;
    const close = vi.fn();
    const database = { close } as unknown as IDBDatabase;
    const blockedFactory = {
      open: () => {
        const pendingRequest = {} as IDBOpenDBRequest;
        request = pendingRequest;
        queueMicrotask(() => pendingRequest.onblocked?.call(
          pendingRequest,
          new Event('blocked') as unknown as IDBVersionChangeEvent,
        ));
        return pendingRequest;
      },
    } as unknown as IDBFactory;
    const store = new SessionStore({ indexedDB: blockedFactory });

    expect(await store.initialize()).toMatchObject({
      mode: 'memory',
      reason: 'IndexedDB upgrade was blocked by another tab.',
    });
    expect(request).toBeDefined();
    Object.defineProperty(request as IDBOpenDBRequest, 'result', { value: database });
    request?.onsuccess?.call(request, new Event('success'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('applies an external delete all to fallback rows loaded by a different store', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-fallback-external-delete-all';
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const seedStore = new SessionStore({ indexedDB, databaseName });
    await seedStore.append(makeStartEvent());
    seedStore.close();

    const fallbackStore = new SessionStore({ indexedDB, databaseName });
    const memoryOnlyEvent = makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000014',
      sessionId: SESSION_TWO,
    });
    const addSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'add');
    addSpy.mockImplementationOnce(() => {
      throw new DOMException('Forced fallback for external delete all.', 'QuotaExceededError');
    });
    try {
      await fallbackStore.append(memoryOnlyEvent);
    } finally {
      addSpy.mockRestore();
    }
    expect((await fallbackStore.listEvents()).map((event) => event.sessionId)).toEqual([
      SESSION_ONE,
      SESSION_TWO,
    ]);

    const deletingStore = new SessionStore({ indexedDB, databaseName });
    expect(await deletingStore.deleteAll()).toBe(1);
    fallbackStore.acceptExternalDeletion({ all: true }, 1);
    expect(await fallbackStore.listEvents()).toEqual([]);
    deletingStore.close();
    fallbackStore.close();
  });

  it('reconciles fallback exports after a remote delete all with no channel notification', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-fallback-no-channel-reconcile';
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const fallbackStore = new SessionStore({ indexedDB, databaseName });
    const deletingStore = new SessionStore({ indexedDB, databaseName });
    await fallbackStore.append(makeStartEvent());
    await deletingStore.initialize();

    const addSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'add');
    addSpy.mockImplementationOnce(() => {
      throw new DOMException('Forced fallback before remote deletion.', 'QuotaExceededError');
    });
    try {
      await fallbackStore.append(makeEndEvent());
    } finally {
      addSpy.mockRestore();
    }
    expect(await fallbackStore.listEvents()).toHaveLength(2);

    expect(await deletingStore.deleteAll()).toBe(1);
    // No acceptExternalDeletion call: list/export must reconcile the pending
    // memory row against the durable epoch and the live persistent store.
    expect(await fallbackStore.listEvents()).toEqual([]);
    deletingStore.close();
    fallbackStore.close();
  });

  it('applies an external selected deletion to fallback rows not invoked by that store', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-fallback-external-selected-delete';
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const seedStore = new SessionStore({ indexedDB, databaseName });
    await seedStore.append(makeStartEvent());
    seedStore.close();

    const fallbackStore = new SessionStore({ indexedDB, databaseName });
    const memoryOnlyEvent = makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000015',
      sessionId: SESSION_TWO,
    });
    const addSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'add');
    addSpy.mockImplementationOnce(() => {
      throw new DOMException('Forced fallback for selected deletion.', 'QuotaExceededError');
    });
    try {
      await fallbackStore.append(memoryOnlyEvent);
    } finally {
      addSpy.mockRestore();
    }

    const deletingStore = new SessionStore({ indexedDB, databaseName });
    expect(await deletingStore.deleteSession(SESSION_ONE)).toBe(1);
    fallbackStore.acceptExternalDeletion({ all: false, sessionId: SESSION_ONE });
    expect((await fallbackStore.listEvents()).map((event) => event.sessionId)).toEqual([
      SESSION_TWO,
    ]);
    expect(await deletingStore.listEvents()).toEqual([]);
    deletingStore.close();
    fallbackStore.close();
  });

  it('rechecks the durable fence after a failed add before accepting the pending memory row', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-fallback-migration-delete-race';
    let storageTime = 1;
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const fallbackStore = new SessionStore({
      indexedDB,
      databaseName,
      storageNow: () => storageTime,
    });
    const deletingStore = new SessionStore({
      indexedDB,
      databaseName,
      storageNow: () => storageTime,
    });
    await fallbackStore.append(makeStartEvent());
    await deletingStore.initialize();

    let deletionPromise: Promise<number> | undefined;
    const addSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'add');
    addSpy.mockImplementationOnce(() => {
      storageTime = 2;
      deletionPromise = deletingStore.deleteAll();
      throw new DOMException('Forced add failure before migration fence.', 'QuotaExceededError');
    });

    try {
      await expect(fallbackStore.append(makeEndEvent())).rejects.toThrow(
        /deleted in another browser tab/i,
      );
      await deletionPromise;
    } finally {
      addSpy.mockRestore();
    }

    expect(fallbackStore.getStatus().mode).toBe('memory');
    expect(await fallbackStore.listEvents()).toEqual([]);
    expect(await deletingStore.listEvents()).toEqual([]);
    fallbackStore.close();
    deletingStore.close();
  });

  it('preserves shared rows on runtime fallback and delete all still clears later cross-tab rows', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-test-runtime-fallback';
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const store = new SessionStore({ indexedDB, databaseName });
    const start = makeStartEvent();
    const end = makeEndEvent();
    await store.append(start);

    const addSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'add');
    addSpy.mockImplementationOnce(() => {
      throw new DOMException('Storage quota exhausted for this test.', 'QuotaExceededError');
    });
    try {
      await store.append(end);
    } finally {
      addSpy.mockRestore();
    }

    expect(store.getStatus()).toEqual({
      mode: 'memory',
      persistent: false,
      message: 'New events are tab-local. Existing browser rows remain available for deletion.',
      reason: 'Storage quota exhausted for this test.',
    });
    const migratedEvents = await store.listEvents();
    expect(migratedEvents.map((event) => event.eventId)).toEqual([
      start.eventId,
      end.eventId,
    ]);
    expect(exportSessionEventsJsonl(migratedEvents).trim().split('\n')).toHaveLength(2);
    expect(exportSessionEventsCsv(migratedEvents).trim().split('\r\n')).toHaveLength(3);

    const persistentProbe = new SessionStore({ indexedDB, databaseName });
    // Falling back must not silently erase the shared durable copy.
    expect((await persistentProbe.listEvents()).map((event) => event.eventId)).toEqual([
      start.eventId,
    ]);
    const laterCrossTabEvent = makeStartEvent({
      eventId: '70000000-0000-4000-8000-000000000013',
      sessionId: SESSION_TWO,
    });
    await persistentProbe.append(laterCrossTabEvent);

    // The fallback store retains a deletion-only DB handle, so Delete all
    // clears both its memory log and rows another tab added after migration.
    expect(await store.deleteAll()).toBe(3);
    expect(await store.listEvents()).toEqual([]);
    expect(await persistentProbe.listEvents()).toEqual([]);
    persistentProbe.close();

    const reopenedStore = new SessionStore({ indexedDB, databaseName });
    expect(await reopenedStore.listEvents()).toEqual([]);
    reopenedStore.close();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    store.close();
  });
});
