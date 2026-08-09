// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDBFactory as FakeIDBFactory,
  IDBObjectStore as FakeIDBObjectStore,
} from 'fake-indexeddb';
import {
  RESEARCH_CAPTURE_MIME_TYPE,
  RESEARCH_CAPTURE_PIPELINE_VERSION,
} from '../core/researchCapture';
import {
  computeResearchInferencePolicyHash,
  finalizeResearchManifestV1,
} from '../core/researchManifest';
import {
  RESEARCH_PARTICIPANT_ID_PATTERN,
} from '../core/researchParticipant';
import { ResearchRecorder } from '../services/researchRecorder';
import {
  ResearchDataInvalidatedError,
  ResearchRetentionExpiredError,
  ResearchStorageUnavailableError,
  ResearchStudyConflictError,
  ResearchStore,
  validateResearchRecordPayloadV1,
  type ResearchRecordPayloadV1,
  type ResearchStoreSyncChannel,
} from '../services/researchStore';
import { makeLaunchReadyResearchStudyBundle } from './researchServiceTestFixture';

const PARTICIPANT_CODE = '0123456789ABCDEFGHJK';
const TEST_NOW = '2026-08-09T12:00:00.000Z';

class TestSyncHub {
  readonly channels = new Set<TestSyncChannel>();

  open(): TestSyncChannel {
    const channel = new TestSyncChannel(this);
    this.channels.add(channel);
    return channel;
  }
}

class TestSyncChannel implements ResearchStoreSyncChannel {
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  constructor(private readonly hub: TestSyncHub) {}

  postMessage(message: unknown): void {
    for (const channel of this.hub.channels) {
      if (channel !== this) channel.dispatch(message);
    }
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
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

async function readRawStore(
  factory: IDBFactory,
  databaseName: string,
  storeName: string,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.onerror = () => reject(open.error ?? new Error('Could not open test IndexedDB.'));
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onerror = () => {
        database.close();
        reject(request.error ?? new Error('Could not read test IndexedDB store.'));
      };
      request.onsuccess = () => {
        database.close();
        resolve(request.result);
      };
    };
  });
}

async function upgradeRawDatabase(factory: IDBFactory, databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 2);
    request.onerror = () => reject(request.error ?? new Error('Could not upgrade test IndexedDB.'));
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

function captureEvent(): Extract<ResearchRecordPayloadV1, { type: 'capture_recorded' }> {
  return {
    type: 'capture_recorded',
    caseStepId: 'step-1',
    artifactKind: 'image',
    frameIndex: 0,
    frameCount: 1,
    submittedViewSha256: 'c'.repeat(64),
    mimeType: RESEARCH_CAPTURE_MIME_TYPE,
    width: 1024,
    height: 768,
    capturePipelineVersion: RESEARCH_CAPTURE_PIPELINE_VERSION,
    annotation: {
      present: true,
      measurementCount: 1,
      segmentedFrameCount: 0,
      activeFrameLabelCount: 2,
      revision: 3,
    },
  };
}

describe('browser-local research persistence', () => {
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('blocks participant launch when persistent IndexedDB is unavailable, without a memory fallback', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const store = new ResearchStore({ indexedDB: null });

    expect(await store.initialize()).toMatchObject({
      mode: 'unavailable',
      persistent: false,
      launchAllowed: false,
    });
    await expect(ResearchRecorder.start({ store, bundle, participantCode: PARTICIPANT_CODE }))
      .rejects.toBeInstanceOf(ResearchStorageUnavailableError);
    await expect(store.saveStudyBundle(bundle)).rejects.toBeInstanceOf(
      ResearchStorageUnavailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('persists an immutable study and pseudonymous allowlisted records across reopen', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-research-pseudonymous-reopen';
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const store = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });

    await expect(store.initialize()).resolves.toMatchObject({ mode: 'indexeddb' });
    const draft = structuredClone(bundle.researchManifest);
    const { manifest: _manifest, ...draftManifest } = draft;
    await store.saveDraft('study-draft', draftManifest);
    const callerBundle = structuredClone(bundle);
    await store.saveStudyBundle(callerBundle, { draftId: 'study-draft' });
    (callerBundle.researchManifest as { title: string }).title = 'Caller mutation after save';
    expect(await store.getStudyBundle(bundle.researchManifest.manifest.sha256)).toEqual(bundle);
    const recorder = await ResearchRecorder.start({
      store,
      bundle,
      participantCode: PARTICIPANT_CODE,
    });
    expect(recorder.participantReference).toMatch(RESEARCH_PARTICIPANT_ID_PATTERN);
    await recorder.record(captureEvent());
    const inferenceConfigSha256 = await computeResearchInferencePolicyHash(
      bundle.researchManifest.arms[0].inferencePolicy,
    );
    await recorder.record({
      type: 'model_turn_failed',
      caseStepId: 'step-1',
      systemPromptSha256: bundle.researchManifest.arms[0].caseSteps[0].systemPromptSha256,
      inferenceConfigSha256,
      requestedModelId: 'openai/gpt-5.4-mini',
      errorCode: 'rate_limited',
      httpStatus: 429,
      latencyMs: 612,
      retryable: true,
    });
    await expect(store.append(recorder.context.runId, {
      type: 'model_turn_failed',
      caseStepId: 'step-1',
      inferenceConfigSha256: 'd'.repeat(64),
      requestedModelId: 'openai/gpt-5.4-mini',
      errorCode: 'provider_error',
      latencyMs: 1,
      retryable: false,
    })).rejects.toThrow(/does not match the frozen arm/i);
    await recorder.end();

    const snapshot = await store.getExportSnapshot(bundle.researchManifest.manifest.sha256);
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.records.map((record) => record.event.type)).toEqual([
      'run_started',
      'capture_recorded',
      'model_turn_failed',
      'run_ended',
    ]);
    expect(serialized).not.toContain(PARTICIPANT_CODE);
    expect(serialized).not.toMatch(/learnerText|modelText|imageData|data:image|apiKey|authorization/i);
    store.close();

    const reopened = new ResearchStore({ indexedDB, databaseName, syncChannel: null });
    expect(await reopened.getStudyBundle(bundle.researchManifest.manifest.sha256)).toEqual(bundle);
    expect(await reopened.listRuns(bundle.researchManifest.manifest.sha256)).toHaveLength(1);
    expect(await reopened.listRecords()).toHaveLength(4);
    expect(await reopened.getDraft('study-draft')).toBeNull();
    reopened.close();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('strictly rejects raw content, unknown fields, wrong capture provenance, and unsafe failure bodies', () => {
    expect(validateResearchRecordPayloadV1(captureEvent())).toBe(true);
    expect(validateResearchRecordPayloadV1({
      ...captureEvent(),
      capturePipelineVersion: '1.0.0',
    })).toBe(false);
    expect(validateResearchRecordPayloadV1({
      type: 'learner_turn_submitted',
      caseStepId: 'step-1',
      inputSource: 'typed',
      mode: 'search',
    })).toBe(false);
    expect(validateResearchRecordPayloadV1({
      type: 'learner_turn_submitted',
      caseStepId: 'step-1',
      inputSource: 'typed',
      mode: 'chat',
      learnerText: 'private response',
    })).toBe(false);
    expect(validateResearchRecordPayloadV1({
      type: 'model_turn_failed',
      caseStepId: 'step-1',
      inferenceConfigSha256: 'd'.repeat(64),
      requestedModelId: 'openai/gpt-5.4-mini',
      errorCode: 'provider_error',
      httpStatus: 500,
      latencyMs: 10,
      retryable: true,
      providerBody: 'sensitive upstream response',
    })).toBe(false);
    expect(validateResearchRecordPayloadV1({
      type: 'protocol_deviation',
      caseStepId: 'step-1',
      code: 'model_mismatch',
      expectedId: 'openai/gpt-5.4-mini',
      observedId: 'https://attacker.example/model',
    })).toBe(false);
  });

  it('binds task responses to the exact frozen manifest and rejects ambiguous objective evidence', async () => {
    const ready = await makeLaunchReadyResearchStudyBundle();
    const { manifest: _manifest, ...draft } = ready.researchManifest;
    const researchManifest = await finalizeResearchManifestV1({
      ...draft,
      tasks: {
        pre: draft.tasks.pre,
        post: [{
          id: 'pattern-choice',
          title: 'Choose a prespecified pattern',
          instructions: 'Choose one option.',
          response: {
            kind: 'single-choice',
            options: [
              { id: 'pattern-a', label: 'Pattern A' },
              { id: 'pattern-b', label: 'Pattern B' },
            ],
          },
        }],
      },
    });
    const bundle = { ...ready, researchManifest };
    const store = new ResearchStore({
      indexedDB: new FakeIDBFactory(),
      databaseName: 'caseattend-research-frozen-task-bindings',
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await store.saveStudyBundle(bundle);
    const recorder = await ResearchRecorder.start({
      store,
      bundle,
      participantCode: PARTICIPANT_CODE,
    });

    await expect(recorder.record({
      type: 'task_scored',
      taskId: 'confidence-pre',
      score: 3,
      maxScore: 4,
    })).resolves.toMatchObject({ event: { type: 'task_scored', maxScore: 4 } });
    await expect(recorder.record({
      type: 'task_choice_recorded',
      taskId: 'pattern-choice',
      optionId: 'pattern-b',
    })).resolves.toMatchObject({ event: { type: 'task_choice_recorded', optionId: 'pattern-b' } });

    await expect(recorder.record({
      type: 'task_scored',
      taskId: 'confidence-pre',
      score: 3,
      maxScore: 5,
    })).rejects.toThrow(/does not match its frozen integer scale/i);
    await expect(recorder.record({
      type: 'task_scored',
      taskId: 'confidence-pre',
      score: 1.5,
      maxScore: 4,
    })).rejects.toThrow(/does not match its frozen integer scale/i);
    await expect(recorder.record({
      type: 'task_choice_recorded',
      taskId: 'confidence-pre',
      optionId: 'pattern-a',
    })).rejects.toThrow(/does not permit a single-choice response/i);
    await expect(recorder.record({
      type: 'task_choice_recorded',
      taskId: 'pattern-choice',
      optionId: 'invented-option',
    })).rejects.toThrow(/is not declared.*frozen manifest/i);
    await expect(recorder.record({
      type: 'task_choice_recorded',
      taskId: 'invented-task',
      optionId: 'pattern-a',
    })).rejects.toThrow(/does not resolve to exactly one task/i);
    await expect(recorder.record({
      type: 'objective_evidence_recorded',
      objectiveId: 'objective-1',
      source: 'educator',
    })).rejects.toThrow(/not supported.*exact frozen case step and lesson/i);

    expect(await store.listRecords(recorder.context.runId)).toHaveLength(3);
    expect(store.getStatus()).toMatchObject({ mode: 'indexeddb', launchAllowed: true });
    store.close();
  });

  it('rejects task events when the frozen collection policy disables task responses', async () => {
    const ready = await makeLaunchReadyResearchStudyBundle();
    const { manifest: _manifest, ...draft } = ready.researchManifest;
    const researchManifest = await finalizeResearchManifestV1({
      ...draft,
      tasks: {
        pre: [{
          id: 'instructions-only',
          title: 'Read the instructions',
          instructions: 'No response is requested.',
          response: { kind: 'none' },
        }],
        post: [],
      },
      collection: {
        ...draft.collection,
        taskResponses: { ...draft.collection.taskResponses, enabled: false },
      },
    });
    const bundle = { ...ready, researchManifest };
    const store = new ResearchStore({
      indexedDB: new FakeIDBFactory(),
      databaseName: 'caseattend-research-task-collection-disabled',
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await store.saveStudyBundle(bundle);
    const recorder = await ResearchRecorder.start({
      store,
      bundle,
      participantCode: PARTICIPANT_CODE,
    });
    await expect(recorder.record({
      type: 'task_choice_recorded',
      taskId: 'instructions-only',
      optionId: 'invented-option',
    })).rejects.toThrow(/collection is disabled in the frozen manifest/i);
    expect(await store.listRecords(recorder.context.runId)).toHaveLength(1);
    store.close();
  });

  it('validates the closed run-ended payload before mutating a run or record store', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-research-closed-run-end';
    const store = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await store.saveStudyBundle(bundle);
    const recorder = await ResearchRecorder.start({
      store,
      bundle,
      participantCode: PARTICIPANT_CODE,
    });
    const beforeRecords = await readRawStore(indexedDB, databaseName, 'records');
    const beforeRuns = await readRawStore(indexedDB, databaseName, 'runs');

    await expect(store.endRun(recorder.context.runId, 'private-free-text' as never))
      .rejects.toThrow(/invalid research run end payload/i);
    expect(await readRawStore(indexedDB, databaseName, 'records')).toEqual(beforeRecords);
    expect(await readRawStore(indexedDB, databaseName, 'runs')).toEqual(beforeRuns);
    expect(await store.listRecords(recorder.context.runId)).toHaveLength(1);
    const [unchangedRun] = await store.listRuns();
    expect(unchangedRun).toMatchObject({ status: 'active', nextSequence: 1 });
    expect(unchangedRun).not.toHaveProperty('endedAt');
    expect(store.getStatus()).toMatchObject({ mode: 'indexeddb', launchAllowed: true });

    await expect(store.endRun(recorder.context.runId, 'completed')).resolves.toMatchObject({
      event: { type: 'run_ended', reason: 'completed' },
      sequence: 1,
    });
    store.close();
  });

  it('stores review drafts but fails participant launch closed for undetermined or institution-managed collection', async () => {
    const indexedDB = new FakeIDBFactory();
    const ready = await makeLaunchReadyResearchStudyBundle();
    const { manifest: _manifest, ...readyDraft } = ready.researchManifest;
    const draftManifest = await finalizeResearchManifestV1({
      ...readyDraft,
      oversight: { status: 'draft' },
    });
    const draftBundle = { ...ready, researchManifest: draftManifest };
    const draftStore = new ResearchStore({
      indexedDB,
      databaseName: 'caseattend-research-review-draft',
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await draftStore.saveStudyBundle(draftBundle);
    await expect(ResearchRecorder.start({
      store: draftStore,
      bundle: draftBundle,
      participantCode: PARTICIPANT_CODE,
    })).rejects.toThrow(/institution-determined|draft packets are export-only/i);
    draftStore.close();

    const rawChatManifest = await finalizeResearchManifestV1({
      ...readyDraft,
      dataManagement: {
        ...readyDraft.dataManagement,
        accessRoles: [...readyDraft.dataManagement.accessRoles, 'research-team'],
      },
      collection: {
        ...readyDraft.collection,
        rawChat: {
          enabled: true,
          purpose: 'Institutionally reviewed discourse analysis.',
          includes: ['learner-text', 'model-text'],
          participantDisclosure: 'The reviewed deployment retains the lesson conversation.',
          accessRoles: ['research-team'],
        },
      },
    });
    const rawChatBundle = { ...ready, researchManifest: rawChatManifest };
    const rawChatStore = new ResearchStore({
      indexedDB,
      databaseName: 'caseattend-research-institution-managed',
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await rawChatStore.saveStudyBundle(rawChatBundle);
    await expect(ResearchRecorder.start({
      store: rawChatStore,
      bundle: rawChatBundle,
      participantCode: PARTICIPANT_CODE,
    })).rejects.toThrow(/raw chat collection.*disabled|institution-managed/i);
    rawChatStore.close();
  });

  it('atomically aborts both run and first record when the first record cannot be written', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-research-atomic-start';
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const store = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    const statusListener = vi.fn();
    store.subscribeStatus(statusListener);
    await store.saveStudyBundle(bundle);
    const originalAdd = FakeIDBObjectStore.prototype.add;
    const addSpy = vi.spyOn(FakeIDBObjectStore.prototype, 'add').mockImplementation(function (
      this: InstanceType<typeof FakeIDBObjectStore>,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'records') {
        throw new DOMException('Synthetic first-record failure.', 'DataCloneError');
      }
      return key === undefined
        ? originalAdd.call(this, value)
        : originalAdd.call(this, value, key);
    });

    try {
      await expect(ResearchRecorder.start({ store, bundle, participantCode: PARTICIPANT_CODE }))
        .rejects.toBeInstanceOf(ResearchStorageUnavailableError);
      expect(store.getStatus()).toMatchObject({
        mode: 'unavailable',
        persistent: false,
        launchAllowed: false,
      });
      expect(statusListener).toHaveBeenCalledWith(expect.objectContaining({ mode: 'unavailable' }));
    } finally {
      addSpy.mockRestore();
      store.close();
    }

    const reopened = new ResearchStore({ indexedDB, databaseName, syncChannel: null });
    expect(await reopened.listRuns()).toEqual([]);
    expect(await reopened.listRecords()).toEqual([]);
    reopened.close();
  });

  it('rejects a duplicate run ID as a study conflict without disabling persistent storage', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const store = new ResearchStore({
      indexedDB: new FakeIDBFactory(),
      databaseName: 'caseattend-research-duplicate-run',
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await store.saveStudyBundle(bundle);
    const participantId = (await ResearchRecorder.start({
      store,
      bundle,
      participantCode: PARTICIPANT_CODE,
      runId: '00000000-0000-4000-8000-000000000001',
    })).participantReference;
    await expect(store.startRun({
      manifestSha256: bundle.researchManifest.manifest.sha256,
      participantId,
      runId: '00000000-0000-4000-8000-000000000001',
    })).rejects.toBeInstanceOf(ResearchStudyConflictError);
    expect(store.getStatus()).toMatchObject({ mode: 'indexeddb', launchAllowed: true });
    expect(await store.listRuns()).toHaveLength(1);
    expect(await store.listRecords()).toHaveLength(1);
    store.close();
  });

  it('blocks collection cleanly when another tab changes the research database schema', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-research-version-change';
    const store = new ResearchStore({ indexedDB, databaseName, syncChannel: null });
    const listener = vi.fn();
    store.subscribeStatus(listener);
    await store.initialize();

    await upgradeRawDatabase(indexedDB, databaseName);

    expect(store.getStatus()).toMatchObject({
      mode: 'unavailable',
      persistent: false,
      launchAllowed: false,
      reason: expect.stringMatching(/changed in another tab/i),
    });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'unavailable' }));
    store.close();
  });

  it('makes participant/study tombstones and global deletion epochs defeat stale cross-tab writes', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-research-cross-tab-delete';
    const hub = new TestSyncHub();
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const first = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: hub.open(),
    });
    const second = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: hub.open(),
    });
    const staleWithoutChannel = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await Promise.all([first.initialize(), second.initialize(), staleWithoutChannel.initialize()]);
    await first.saveStudyBundle(bundle);
    const recorder = await ResearchRecorder.start({
      store: second,
      bundle,
      participantCode: PARTICIPANT_CODE,
    });
    const participantDeletion = await first.deleteParticipant(
      bundle.researchManifest.manifest.sha256,
      recorder.participantReference,
    );
    expect(participantDeletion.retainedAntiResurrection).toEqual({
      kind: 'participant-tombstone',
      manifestSha256: bundle.researchManifest.manifest.sha256,
      participantId: recorder.participantReference,
      retainedUntil: 'study-or-all-data-deletion',
      excludedFromListsAndExports: true,
    });
    expect(await first.listRuns(
      bundle.researchManifest.manifest.sha256,
      recorder.participantReference,
    )).toEqual([]);
    expect(await first.listRecords()).toEqual([]);
    await expect(first.getExportSnapshot(bundle.researchManifest.manifest.sha256))
      .resolves.toMatchObject({ runs: [], records: [] });
    await expect(recorder.record(captureEvent())).rejects.toBeInstanceOf(
      ResearchDataInvalidatedError,
    );
    await expect(second.startRun({
      manifestSha256: bundle.researchManifest.manifest.sha256,
      participantId: recorder.participantReference,
    })).rejects.toBeInstanceOf(ResearchDataInvalidatedError);
    expect(await readRawStore(indexedDB, databaseName, 'deleted-participants')).toHaveLength(1);

    const studyDeletion = await first.deleteStudy(bundle.researchManifest.manifest.sha256);
    expect(studyDeletion.retainedAntiResurrection).toEqual({
      kind: 'study-tombstone',
      manifestSha256: bundle.researchManifest.manifest.sha256,
      retainedUntil: 'all-data-deletion',
      excludedFromListsAndExports: true,
    });
    expect(await readRawStore(indexedDB, databaseName, 'deleted-participants')).toEqual([]);
    expect(await readRawStore(indexedDB, databaseName, 'deleted-studies')).toHaveLength(1);
    await expect(second.saveStudyBundle(bundle)).rejects.toBeInstanceOf(
      ResearchDataInvalidatedError,
    );

    const { manifest: _manifest, ...draft } = bundle.researchManifest;
    const allDeletion = await first.deleteAll();
    expect(allDeletion.retainedAntiResurrection).toEqual({
      kind: 'global-deletion-epoch',
      deletionEpoch: 1,
      containsStudyOrParticipantIdentifiers: false,
    });
    expect(await readRawStore(indexedDB, databaseName, 'deleted-participants')).toEqual([]);
    expect(await readRawStore(indexedDB, databaseName, 'deleted-studies')).toEqual([]);
    await expect(staleWithoutChannel.saveDraft('stale-draft', draft)).rejects.toBeInstanceOf(
      ResearchDataInvalidatedError,
    );
    first.close();
    second.close();
    staleWithoutChannel.close();
  });

  it('deletes draft-only research data and retains no study or participant identifiers', async () => {
    const indexedDB = new FakeIDBFactory();
    const databaseName = 'caseattend-research-draft-only-delete-all';
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const { manifest: _manifest, ...draft } = bundle.researchManifest;
    const deleting = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    const stale = new ResearchStore({
      indexedDB,
      databaseName,
      now: () => new Date(TEST_NOW),
      syncChannel: null,
    });
    await Promise.all([deleting.initialize(), stale.initialize()]);
    await deleting.saveDraft('draft-only', draft);
    expect(await deleting.listStudies()).toEqual([]);
    expect(await deleting.listDrafts()).toHaveLength(1);

    const result = await deleting.deleteAll();
    expect(result).toMatchObject({
      studies: 0,
      runs: 0,
      records: 0,
      drafts: 1,
      retainedAntiResurrection: {
        kind: 'global-deletion-epoch',
        deletionEpoch: 1,
        containsStudyOrParticipantIdentifiers: false,
      },
    });
    expect(await deleting.listDrafts()).toEqual([]);
    expect(await readRawStore(indexedDB, databaseName, 'deleted-studies')).toEqual([]);
    expect(await readRawStore(indexedDB, databaseName, 'deleted-participants')).toEqual([]);
    expect(await readRawStore(indexedDB, databaseName, 'metadata')).toEqual([{
      key: 'deletion-epoch',
      value: 1,
    }]);
    await expect(stale.saveDraft('stale-draft', draft)).rejects.toBeInstanceOf(
      ResearchDataInvalidatedError,
    );

    const fresh = new ResearchStore({ indexedDB, databaseName, syncChannel: null });
    await fresh.initialize();
    await expect(fresh.saveDraft('fresh-draft', draft)).resolves.toMatchObject({ id: 'fresh-draft' });
    deleting.close();
    stale.close();
    fresh.close();
  });

  it('blocks new records and study-data export at the browser retention deadline', async () => {
    let now = new Date(TEST_NOW);
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const store = new ResearchStore({
      indexedDB: new FakeIDBFactory(),
      databaseName: 'caseattend-research-retention',
      now: () => new Date(now),
      syncChannel: null,
    });
    await store.saveStudyBundle(bundle);
    const recorder = await ResearchRecorder.start({
      store,
      bundle,
      participantCode: PARTICIPANT_CODE,
    });
    now = new Date('2027-01-01T00:00:00.000Z');

    await expect(recorder.record(captureEvent())).rejects.toBeInstanceOf(
      ResearchRetentionExpiredError,
    );
    await expect(store.getExportSnapshot(bundle.researchManifest.manifest.sha256))
      .rejects.toBeInstanceOf(ResearchRetentionExpiredError);
    await expect(store.startRun({
      manifestSha256: bundle.researchManifest.manifest.sha256,
      participantId: recorder.participantReference,
      startedAt: TEST_NOW,
    })).rejects.toBeInstanceOf(ResearchRetentionExpiredError);
    store.close();
  });
});
