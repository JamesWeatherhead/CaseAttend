// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDBFactory as FakeIDBFactory,
  IDBObjectStore as FakeIDBObjectStore,
} from 'fake-indexeddb';
import { finalizeCasePackageV1 } from '../core/casePackage';
import { getLessonPlanRef, finalizeLessonPlanV1 } from '../core/lessonPlan';
import { createPortableCasePackageV1 } from '../core/portableCasePackage';
import {
  CasePackageStore,
  type CasePackageStoreSyncChannel,
} from '../services/casePackageStore';
import { makePortableCasePackage } from './portableCaseTestFixture';

class TestSyncHub {
  readonly channels = new Set<TestSyncChannel>();

  open(): TestSyncChannel {
    const channel = new TestSyncChannel(this);
    this.channels.add(channel);
    return channel;
  }
}

class TestSyncChannel implements CasePackageStoreSyncChannel {
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  constructor(private readonly hub: TestSyncHub) {}

  postMessage(message: unknown): void {
    for (const channel of this.hub.channels) {
      if (channel === this) continue;
      channel.dispatch(message);
    }
  }

  addEventListener(
    _type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void {
    this.listeners.delete(listener);
  }

  close(): void {
    this.hub.channels.delete(this);
    this.listeners.clear();
  }

  private dispatch(message: unknown): void {
    const event = new MessageEvent('message', { data: structuredClone(message) });
    for (const listener of this.listeners) listener(event);
  }
}

async function revisePortableCase(
  portablePackage: Awaited<ReturnType<typeof makePortableCasePackage>>,
) {
  const { manifest: _lessonManifest, ...lessonDraft } = portablePackage.lessonPlan;
  const lessonPlan = await finalizeLessonPlanV1({
    ...lessonDraft,
    title: `${lessonDraft.title} revised`,
  });
  const { manifest: _caseManifest, ...caseDraft } = portablePackage.casePackage;
  const casePackage = await finalizeCasePackageV1({
    ...caseDraft,
    lessonPlanRef: getLessonPlanRef(lessonPlan),
    neutralDescription: lessonPlan.neutralDescription,
    teachingNotes: lessonPlan.teachingNotes,
  });
  return createPortableCasePackageV1(casePackage, lessonPlan, portablePackage.assets);
}

describe('CasePackageStore', () => {
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

  it('atomically promotes a memory draft to a complete case and deletes its assets', async () => {
    const store = new CasePackageStore({
      indexedDB: null,
      now: () => new Date('2026-08-09T12:00:00.000Z'),
    });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.saveDraft('draft-one', { step: 3, title: 'Still editing' });
    const portablePackage = await makePortableCasePackage();

    const summary = await store.save(portablePackage, { draftId: 'draft-one' });

    expect(summary.id).toBe(portablePackage.casePackage.id);
    expect(summary.assetCount).toBe(1);
    expect(await store.getDraft('draft-one')).toBeNull();
    expect(await store.get(summary.id)).toEqual(portablePackage);
    expect(await store.list()).toEqual([summary]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(await store.delete(summary.id)).toBe(true);
    await expect(store.getAssetBlob(portablePackage.assets[0].uri)).rejects.toThrow(/not stored/i);
    expect(await store.list()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('persists cases, assets, and drafts across an IndexedDB reopen', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-case-store-reopen';
    const portablePackage = await makePortableCasePackage();
    const initialStore = new CasePackageStore({ indexedDB, databaseName });

    expect(await initialStore.initialize()).toEqual({
      mode: 'indexeddb',
      persistent: true,
      message: 'Cases and drafts are stored only in this browser.',
    });
    await initialStore.saveDraft('draft-two', { step: 2 });
    await initialStore.save(portablePackage);
    initialStore.close();

    const reopenedStore = new CasePackageStore({ indexedDB, databaseName });
    expect(await reopenedStore.get(portablePackage.casePackage.id)).toEqual(portablePackage);
    expect(await reopenedStore.getDraft<{ step: number }>('draft-two')).toMatchObject({
      id: 'draft-two',
      value: { step: 2 },
    });
    expect(await reopenedStore.delete(portablePackage.casePackage.id)).toBe(true);
    expect(await reopenedStore.get(portablePackage.casePackage.id)).toBeNull();
    reopenedStore.close();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborts the whole IndexedDB promotion when a synchronous asset write fails', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-case-store-atomic-failure';
    const portablePackage = await makePortableCasePackage();
    const store = new CasePackageStore({ indexedDB, databaseName });
    const statusListener = vi.fn();
    store.subscribeStatus(statusListener);
    await store.saveDraft('atomic-draft', { step: 4, title: 'Recover me' });
    const originalPut = FakeIDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(function (
      this: InstanceType<typeof FakeIDBObjectStore>,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'assets') {
        throw new DOMException('Synthetic asset write failure.', 'DataCloneError');
      }
      return key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
    });

    try {
      // The validated case is retained in this tab's documented memory fallback.
      await expect(store.save(portablePackage, { draftId: 'atomic-draft' })).resolves.toBeDefined();
      expect(store.getStatus().mode).toBe('memory');
      expect(statusListener).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'memory',
        persistent: false,
      }));
    } finally {
      putSpy.mockRestore();
      store.close();
    }

    const reopened = new CasePackageStore({ indexedDB, databaseName });
    expect(await reopened.get(portablePackage.casePackage.id)).toBeNull();
    expect(await reopened.getDraft<{ step: number; title: string }>('atomic-draft')).toMatchObject({
      value: { step: 4, title: 'Recover me' },
    });
    reopened.close();
  });

  it('hides a case deleted in another tab and rejects a stale re-save', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-case-store-cross-tab-delete';
    const hub = new TestSyncHub();
    const first = new CasePackageStore({
      indexedDB,
      databaseName,
      syncChannel: hub.open(),
    });
    const second = new CasePackageStore({
      indexedDB,
      databaseName,
      syncChannel: hub.open(),
    });
    const portablePackage = await makePortableCasePackage();
    await first.save(portablePackage);
    expect(await second.get(portablePackage.casePackage.id)).toEqual(portablePackage);
    const secondListener = vi.fn();
    second.subscribe(secondListener);

    expect(await first.delete(portablePackage.casePackage.id)).toBe(true);

    expect(secondListener).toHaveBeenCalledOnce();
    expect(await second.get(portablePackage.casePackage.id)).toBeNull();
    await expect(second.save(portablePackage)).rejects.toThrow(/deleted in another tab/i);
    expect(await first.get(portablePackage.casePackage.id)).toBeNull();
    first.close();
    second.close();
  });

  it('does not broadcast a tab-local memory deletion over a durable same-ID case', async () => {
    const hub = new TestSyncHub();
    const portablePackage = await makePortableCasePackage();
    const memoryStore = new CasePackageStore({
      indexedDB: null,
      syncChannel: hub.open(),
    });
    const durableStore = new CasePackageStore({
      indexedDB: new FakeIDBFactory(),
      databaseName: 'caseattend-case-store-memory-delete-isolation',
      syncChannel: hub.open(),
    });
    await durableStore.save(portablePackage, { expectedCaseManifestSha256: null });
    await memoryStore.save(portablePackage, { expectedCaseManifestSha256: null });
    const durableListener = vi.fn();
    durableStore.subscribe(durableListener);

    expect(await memoryStore.delete(portablePackage.casePackage.id)).toBe(true);

    expect(durableListener).not.toHaveBeenCalled();
    expect(await durableStore.get(portablePackage.casePackage.id)).toEqual(portablePackage);
    memoryStore.close();
    durableStore.close();
  });

  it('makes nonexistent memory deletes no-ops so the ID remains creatable', async () => {
    const store = new CasePackageStore({ indexedDB: null });
    const portablePackage = await makePortableCasePackage();

    expect(await store.delete(portablePackage.casePackage.id)).toBe(false);
    await expect(store.save(portablePackage, {
      expectedCaseManifestSha256: null,
    })).resolves.toBeDefined();
    expect(await store.get(portablePackage.casePackage.id)).toEqual(portablePackage);
  });

  it('atomically compares the expected case manifest before replacing a bundle', async () => {
    const indexedDB = new FakeIDBFactory();
    const store = new CasePackageStore({
      indexedDB,
      databaseName: 'caseattend-case-store-manifest-cas',
    });
    const original = await makePortableCasePackage();
    const revised = await revisePortableCase(original);
    await store.save(original, { expectedCaseManifestSha256: null });

    await expect(store.save(original, { expectedCaseManifestSha256: null }))
      .rejects.toThrow(/already exists/i);
    expect(store.getStatus().mode).toBe('indexeddb');
    await expect(store.save(revised, { expectedCaseManifestSha256: 'f'.repeat(64) }))
      .rejects.toThrow(/changed in another view/i);
    expect(store.getStatus().mode).toBe('indexeddb');
    expect(await store.get(original.casePackage.id)).toEqual(original);

    await expect(store.save(revised, {
      expectedCaseManifestSha256: original.casePackage.manifest.sha256,
    })).resolves.toBeDefined();
    expect(await store.get(original.casePackage.id)).toEqual(revised);
    await expect(store.save(original, {
      expectedCaseManifestSha256: original.casePackage.manifest.sha256,
    })).rejects.toThrow(/changed in another view/i);
    expect(await store.get(original.casePackage.id)).toEqual(revised);
    expect(store.getStatus().mode).toBe('indexeddb');
    store.close();

    const reopened = new CasePackageStore({
      indexedDB,
      databaseName: 'caseattend-case-store-manifest-cas',
    });
    expect(await reopened.get(original.casePackage.id)).toEqual(revised);
    reopened.close();
  });

  it('fails visibly and preserves the durable row when IndexedDB deletion fails', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-case-store-delete-failure';
    const portablePackage = await makePortableCasePackage();
    const store = new CasePackageStore({ indexedDB, databaseName });
    await store.save(portablePackage, { expectedCaseManifestSha256: null });
    const originalDelete = FakeIDBObjectStore.prototype.delete;
    const deleteSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: InstanceType<typeof FakeIDBObjectStore>,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'cases') {
        throw new DOMException('Synthetic durable delete failure.', 'InvalidStateError');
      }
      return originalDelete.call(this, key);
    });

    try {
      await expect(store.delete(portablePackage.casePackage.id))
        .rejects.toThrow(/could not be deleted from durable browser storage/i);
      expect(await store.get(portablePackage.casePackage.id)).toEqual(portablePackage);
      expect(store.getStatus().mode).toBe('memory');
    } finally {
      deleteSpy.mockRestore();
      store.close();
    }

    const reopened = new CasePackageStore({ indexedDB, databaseName });
    expect(await reopened.get(portablePackage.casePackage.id)).toEqual(portablePackage);
    reopened.close();
  });

  it('reports and uses memory-only fallback when IndexedDB cannot open', async () => {
    const store = new CasePackageStore({
      indexedDB: {
        open: () => {
          throw new Error('Case storage is blocked for this test.');
        },
      } as unknown as IDBFactory,
    });
    const statusListener = vi.fn();
    store.subscribeStatus(statusListener);

    const status = await store.initialize();
    expect(status).toEqual({
      mode: 'memory',
      persistent: false,
      message: 'Memory-only mode. Cases and drafts will be lost when this page closes.',
      reason: 'Case storage is blocked for this test.',
    });
    expect(statusListener).toHaveBeenCalledWith(status);
    const portablePackage = await makePortableCasePackage();
    await store.save(portablePackage);
    expect(await store.get(portablePackage.casePackage.id)).toEqual(portablePackage);
  });

  it('returns verified Blob bytes without fetch and caches only explicitly requested object URLs', async () => {
    const portablePackage = await makePortableCasePackage();
    const createObjectUrl = vi.fn(() => 'blob:caseattend-test');
    const revokeObjectUrl = vi.fn();
    const BrowserUrl = URL;
    class TestUrl extends BrowserUrl {}
    Object.defineProperties(TestUrl, {
      createObjectURL: { value: createObjectUrl, configurable: true },
      revokeObjectURL: { value: revokeObjectUrl, configurable: true },
    });
    vi.stubGlobal('URL', TestUrl);
    const store = new CasePackageStore({ indexedDB: null });
    await store.save(portablePackage);
    const asset = portablePackage.assets[0];

    const blob = await store.getAssetBlob(asset.uri);
    expect(blob.type).toBe(asset.mimeType);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      Uint8Array.from(atob(asset.bytesBase64), (character) => character.charCodeAt(0)),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(store.resolveAssetUri(asset.uri)).resolves.toBe('blob:caseattend-test');
    await expect(store.resolveAssetUri(asset.uri)).resolves.toBe('blob:caseattend-test');
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    store.releaseAssetUri(asset.uri);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:caseattend-test');
  });

  it('snapshots JSON drafts and rejects oversized or non-JSON values', async () => {
    const store = new CasePackageStore({ indexedDB: null });
    const mutable = { nested: { value: 'original' } };
    await store.saveDraft('safe-draft', mutable);
    mutable.nested.value = 'changed';

    expect(await store.getDraft('safe-draft')).toMatchObject({
      value: { nested: { value: 'original' } },
    });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(store.saveDraft('circular-draft', circular)).rejects.toThrow(/circular/i);
    await expect(store.saveDraft('function-draft', { callback: () => undefined })).rejects.toThrow(
      /JSON-compatible/i,
    );
    await expect(store.saveDraft('large-draft', 'x'.repeat(2 * 1024 * 1024 + 1))).rejects.toThrow(
      /cannot exceed/i,
    );
  });
});
