import { canonicalizeJson } from '../core/casePackage';
import {
  RESEARCH_CAPTURE_MIME_TYPE,
  RESEARCH_CAPTURE_PIPELINE_VERSION,
} from '../core/researchCapture';
import {
  computeResearchInferencePolicyHash,
  getResearchManifestRef,
  validateResearchManifestDraftV1,
  type ResearchManifestRef,
  type ResearchManifestV1,
  type ResearchManifestV1Draft,
} from '../core/researchManifest';
import { assignResearchArm, validateResearchParticipantId } from '../core/researchParticipant';
import {
  checkResearchStudyLaunchReadiness,
  validateResearchStudyBundleV1,
  type ResearchStudyBundleV1,
} from '../core/researchStudyBundle';

const DATABASE_NAME = 'caseattend-research-v1';
const DATABASE_VERSION = 1;
const DRAFT_STORE = 'drafts';
const STUDY_STORE = 'studies';
const RUN_STORE = 'runs';
const RECORD_STORE = 'records';
const DELETED_STUDY_STORE = 'deleted-studies';
const DELETED_PARTICIPANT_STORE = 'deleted-participants';
const META_STORE = 'metadata';
const RUN_STUDY_INDEX = 'by-study';
const RUN_PARTICIPANT_INDEX = 'by-study-participant';
const RECORD_RUN_INDEX = 'by-run';
const RECORD_STUDY_INDEX = 'by-study';
const RECORD_SEQUENCE_INDEX = 'by-run-sequence';
const DELETION_EPOCH_KEY = 'deletion-epoch';
const SYNC_CHANNEL_NAME = 'caseattend-research-store-v1';
const SYNC_SCHEMA = 'caseattend.research-store-sync';
const MAX_DRAFT_BYTES = 1024 * 1024;
const SAFE_DRAFT_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const SAFE_OPAQUE_ID = /^[a-z0-9][a-z0-9_-]{2,127}$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RESEARCH_RECORD_SCHEMA = 'caseattend.research-record' as const;
export const RESEARCH_RECORD_VERSION = '1.0' as const;
export const RESEARCH_RUN_SCHEMA = 'caseattend.research-run' as const;
export const RESEARCH_RUN_VERSION = '1.0' as const;
export const RESEARCH_INFERENCE_ERROR_CODES = [
  'missing_key',
  'missing_case',
  'prompt_resolution_failed',
  'request_aborted',
  'timeout',
  'network_error',
  'unauthorized',
  'payment_required',
  'forbidden',
  'rate_limited',
  'provider_unavailable',
  'provider_error',
  'invalid_response',
  'empty_response',
  'protocol_deviation',
  'unexpected_error',
] as const;

export type ResearchInferenceErrorCode = typeof RESEARCH_INFERENCE_ERROR_CODES[number];

export type ResearchStorageStatus =
  | {
      mode: 'uninitialized';
      persistent: false;
      launchAllowed: false;
      message: 'Research storage has not been verified.';
    }
  | {
      mode: 'indexeddb';
      persistent: true;
      launchAllowed: true;
      message: 'Research data is stored only in this browser.';
    }
  | {
      mode: 'unavailable';
      persistent: false;
      launchAllowed: false;
      message: 'Research collection is blocked because persistent browser storage is unavailable.';
      reason: string;
    };

export interface ResearchStoreSyncChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

export interface ResearchStoreOptions {
  /** Test seam. Production requires the browser's persistent IndexedDB. */
  indexedDB?: IDBFactory | null;
  databaseName?: string;
  now?: () => Date;
  createId?: () => string;
  syncChannel?: ResearchStoreSyncChannel | null;
}

export interface ResearchStudyDraftRecord {
  id: string;
  draft: ResearchManifestV1Draft;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchStudySummary {
  id: string;
  version: ResearchManifestRef['version'];
  manifestSha256: string;
  caseCount: number;
  retentionExpiresAt: string;
  createdAt: string;
}

export interface ResearchRunV1 {
  schema: typeof RESEARCH_RUN_SCHEMA;
  schemaVersion: typeof RESEARCH_RUN_VERSION;
  runId: string;
  manifestRef: ResearchManifestRef;
  participantId: string;
  armId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'ended';
  nextSequence: number;
}

export interface ResearchAnnotationAggregate {
  present: boolean;
  measurementCount: number;
  segmentedFrameCount: number;
  activeFrameLabelCount: number;
  revision: number;
}

export type ResearchRecordPayloadV1 =
  | { type: 'run_started'; armId: string }
  | { type: 'case_step_opened'; caseStepId: string }
  | {
      type: 'capture_recorded';
      caseStepId: string;
      artifactKind: 'image' | 'image-stack';
      frameIndex: number;
      frameCount: number;
      submittedViewSha256: string;
      mimeType: typeof RESEARCH_CAPTURE_MIME_TYPE;
      width: number;
      height: number;
      capturePipelineVersion: typeof RESEARCH_CAPTURE_PIPELINE_VERSION;
      annotation: ResearchAnnotationAggregate;
    }
  | {
      type: 'learner_turn_submitted';
      caseStepId: string;
      inputSource: 'typed' | 'retry' | 'lesson_hint';
      mode: 'chat' | 'deep_think';
      hintId?: string;
    }
  | {
      type: 'model_turn_completed';
      caseStepId: string;
      systemPromptSha256: string;
      inferenceConfigSha256: string;
      requestedModelId: string;
      resolvedModelId?: string;
      upstreamProviderId?: string;
      latencyMs: number;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error' | 'other';
    }
  | {
      type: 'model_turn_failed';
      caseStepId: string;
      systemPromptSha256?: string;
      inferenceConfigSha256: string;
      requestedModelId: string;
      errorCode: ResearchInferenceErrorCode;
      httpStatus?: number;
      latencyMs: number;
      retryable: boolean;
    }
  | {
      type: 'task_scored';
      taskId: string;
      score: number;
      maxScore: number;
      durationMs?: number;
    }
  | { type: 'task_choice_recorded'; taskId: string; optionId: string }
  | {
      type: 'objective_evidence_recorded';
      objectiveId: string;
      rubricCriterionId?: string;
      source: 'learner_turn' | 'model_turn' | 'educator';
    }
  | {
      type: 'protocol_deviation';
      caseStepId: string;
      code:
        | 'case_mismatch'
        | 'lesson_mismatch'
        | 'model_mismatch'
        | 'provider_mismatch'
        | 'inference_parameter_mismatch'
        | 'storage_unavailable';
      expectedId?: string;
      observedId?: string;
    }
  | {
      type: 'run_ended';
      reason: 'completed' | 'withdrawn' | 'retention_expired' | 'storage_unavailable' | 'abandoned';
    };

export interface ResearchRecordV1 {
  schema: typeof RESEARCH_RECORD_SCHEMA;
  schemaVersion: typeof RESEARCH_RECORD_VERSION;
  recordId: string;
  runId: string;
  manifestRef: ResearchManifestRef;
  participantId: string;
  sequence: number;
  occurredAt: string;
  event: ResearchRecordPayloadV1;
}

export interface StartResearchRunOptions {
  manifestSha256: string;
  participantId: string;
  runId?: string;
  startedAt?: string;
}

export interface ResearchStudyExportSnapshotV1 {
  bundle: ResearchStudyBundleV1;
  study: ResearchStudySummary;
  runs: readonly ResearchRunV1[];
  records: readonly ResearchRecordV1[];
}

export interface ResearchDeletionResult {
  studies: number;
  runs: number;
  records: number;
  drafts: number;
  /**
   * The small browser-local marker that remains after the requested deletion.
   * This is returned so the UI never describes an anti-resurrection control as
   * though it were deleted research data. Markers are never listed or exported.
   */
  retainedAntiResurrection:
    | {
        kind: 'participant-tombstone';
        manifestSha256: string;
        participantId: string;
        retainedUntil: 'study-or-all-data-deletion';
        excludedFromListsAndExports: true;
      }
    | {
        kind: 'study-tombstone';
        manifestSha256: string;
        retainedUntil: 'all-data-deletion';
        excludedFromListsAndExports: true;
      }
    | {
        kind: 'global-deletion-epoch';
        deletionEpoch: number;
        containsStudyOrParticipantIdentifiers: false;
      };
}

interface StoredStudyRecord extends ResearchStudySummary {
  bundle: ResearchStudyBundleV1;
}

interface DeletedStudyRecord {
  manifestSha256: string;
  deletedAt: string;
}

interface DeletedParticipantRecord {
  deletionKey: string;
  manifestSha256: string;
  participantId: string;
  deletedAt: string;
}

interface DeletionEpochRecord {
  key: typeof DELETION_EPOCH_KEY;
  value: number;
}

type SyncMessage =
  | { schema: typeof SYNC_SCHEMA; type: 'study-deleted'; manifestSha256: string }
  | {
      schema: typeof SYNC_SCHEMA;
      type: 'participant-deleted';
      manifestSha256: string;
      participantId: string;
    }
  | { schema: typeof SYNC_SCHEMA; type: 'all-deleted'; deletionEpoch: number };

export class ResearchStorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchStorageUnavailableError';
  }
}

export class ResearchDataInvalidatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchDataInvalidatedError';
  }
}

export class ResearchRetentionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchRetentionExpiredError';
  }
}

export class ResearchStudyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchStudyConflictError';
  }
}

function browserIndexedDb(): IDBFactory | null {
  try {
    return typeof globalThis.indexedDB === 'undefined' ? null : globalThis.indexedDB;
  } catch {
    return null;
  }
}

function browserSyncChannel(): ResearchStoreSyncChannel | null {
  try {
    return typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function'
      ? null
      : new window.BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch {
    return null;
  }
}

function browserUuid(): string {
  return globalThis.crypto.randomUUID();
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

async function abortAndDrainTransaction(
  transaction: IDBTransaction,
  completion: Promise<void>,
): Promise<void> {
  try { transaction.abort(); } catch { /* transaction already settled */ }
  try { await completion; } catch { /* the initiating error is reported instead */ }
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
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STUDY_STORE)) {
        database.createObjectStore(STUDY_STORE, { keyPath: 'manifestSha256' });
      }
      if (!database.objectStoreNames.contains(RUN_STORE)) {
        const runs = database.createObjectStore(RUN_STORE, { keyPath: 'runId' });
        runs.createIndex(RUN_STUDY_INDEX, 'manifestRef.sha256');
        runs.createIndex(RUN_PARTICIPANT_INDEX, ['manifestRef.sha256', 'participantId']);
      }
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const records = database.createObjectStore(RECORD_STORE, { keyPath: 'recordId' });
        records.createIndex(RECORD_RUN_INDEX, 'runId');
        records.createIndex(RECORD_STUDY_INDEX, 'manifestRef.sha256');
        records.createIndex(RECORD_SEQUENCE_INDEX, ['runId', 'sequence'], { unique: true });
      }
      if (!database.objectStoreNames.contains(DELETED_STUDY_STORE)) {
        database.createObjectStore(DELETED_STUDY_STORE, { keyPath: 'manifestSha256' });
      }
      if (!database.objectStoreNames.contains(DELETED_PARTICIPANT_STORE)) {
        database.createObjectStore(DELETED_PARTICIPANT_STORE, { keyPath: 'deletionKey' });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'key' });
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

function participantDeletionKey(manifestSha256: string, participantId: string): string {
  return `${manifestSha256}:${participantId}`;
}

function isoTimestamp(value: Date): string {
  const timestamp = value.toISOString();
  if (Number.isNaN(value.getTime())) throw new Error('A valid timestamp is required.');
  return timestamp;
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_OPAQUE_ID.test(value);
}

function isSafeProviderId(value: unknown): value is string {
  return typeof value === 'string'
    && SAFE_PROVIDER_ID.test(value)
    && !value.includes('://');
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validAnnotation(value: unknown): value is ResearchAnnotationAggregate {
  if (!isPlainRecord(value) || !exactKeys(value, [
    'present',
    'measurementCount',
    'segmentedFrameCount',
    'activeFrameLabelCount',
    'revision',
  ])) return false;
  return typeof value.present === 'boolean'
    && isNonnegativeInteger(value.measurementCount)
    && isNonnegativeInteger(value.segmentedFrameCount)
    && isNonnegativeInteger(value.activeFrameLabelCount)
    && isNonnegativeInteger(value.revision);
}

/** Strictly validate the closed, raw-content-free research record vocabulary. */
export function validateResearchRecordPayloadV1(value: unknown): value is ResearchRecordPayloadV1 {
  if (!isPlainRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'run_started':
      return exactKeys(value, ['type', 'armId']) && isSafeId(value.armId);
    case 'case_step_opened':
      return exactKeys(value, ['type', 'caseStepId']) && isSafeId(value.caseStepId);
    case 'capture_recorded':
      return exactKeys(value, [
        'type',
        'caseStepId',
        'artifactKind',
        'frameIndex',
        'frameCount',
        'submittedViewSha256',
        'mimeType',
        'width',
        'height',
        'capturePipelineVersion',
        'annotation',
      ])
        && isSafeId(value.caseStepId)
        && (value.artifactKind === 'image' || value.artifactKind === 'image-stack')
        && isNonnegativeInteger(value.frameIndex)
        && Number.isSafeInteger(value.frameCount)
        && (value.frameCount as number) > 0
        && (value.frameIndex as number) < (value.frameCount as number)
        && typeof value.submittedViewSha256 === 'string'
        && SHA256_PATTERN.test(value.submittedViewSha256)
        && value.mimeType === RESEARCH_CAPTURE_MIME_TYPE
        && Number.isSafeInteger(value.width)
        && (value.width as number) > 0
        && (value.width as number) <= 8_192
        && Number.isSafeInteger(value.height)
        && (value.height as number) > 0
        && (value.height as number) <= 8_192
        && value.capturePipelineVersion === RESEARCH_CAPTURE_PIPELINE_VERSION
        && validAnnotation(value.annotation);
    case 'learner_turn_submitted': {
      const allowed = ['type', 'caseStepId', 'inputSource', 'mode', 'hintId'];
      if (!exactKeys(value, allowed) || !isSafeId(value.caseStepId)) return false;
      if (!['typed', 'retry', 'lesson_hint'].includes(String(value.inputSource))) return false;
      if (!['chat', 'deep_think'].includes(String(value.mode))) return false;
      return value.inputSource === 'lesson_hint'
        ? isSafeId(value.hintId)
        : value.hintId === undefined;
    }
    case 'model_turn_completed': {
      if (!exactKeys(value, [
        'type',
        'caseStepId',
        'systemPromptSha256',
        'inferenceConfigSha256',
        'requestedModelId',
        'resolvedModelId',
        'upstreamProviderId',
        'latencyMs',
        'promptTokens',
        'completionTokens',
        'totalTokens',
        'finishReason',
      ])) return false;
      if (
        !isSafeId(value.caseStepId)
        || typeof value.systemPromptSha256 !== 'string'
        || !SHA256_PATTERN.test(value.systemPromptSha256)
        || typeof value.inferenceConfigSha256 !== 'string'
        || !SHA256_PATTERN.test(value.inferenceConfigSha256)
        || !isSafeProviderId(value.requestedModelId)
        || (value.resolvedModelId !== undefined && !isSafeProviderId(value.resolvedModelId))
        || (value.upstreamProviderId !== undefined && !isSafeProviderId(value.upstreamProviderId))
        || !isNonnegativeInteger(value.latencyMs)
      ) return false;
      for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
        if (value[key] !== undefined && !isNonnegativeInteger(value[key])) return false;
      }
      return value.finishReason === undefined || [
        'stop', 'length', 'content_filter', 'tool_calls', 'error', 'other',
      ].includes(String(value.finishReason));
    }
    case 'model_turn_failed':
      return exactKeys(value, [
        'type',
        'caseStepId',
        'systemPromptSha256',
        'inferenceConfigSha256',
        'requestedModelId',
        'errorCode',
        'httpStatus',
        'latencyMs',
        'retryable',
      ])
        && isSafeId(value.caseStepId)
        && (value.systemPromptSha256 === undefined
          || (typeof value.systemPromptSha256 === 'string'
            && SHA256_PATTERN.test(value.systemPromptSha256)))
        && typeof value.inferenceConfigSha256 === 'string'
        && SHA256_PATTERN.test(value.inferenceConfigSha256)
        && isSafeProviderId(value.requestedModelId)
        && RESEARCH_INFERENCE_ERROR_CODES.includes(value.errorCode as ResearchInferenceErrorCode)
        && (value.httpStatus === undefined
          || (Number.isSafeInteger(value.httpStatus)
            && (value.httpStatus as number) >= 100
            && (value.httpStatus as number) <= 599))
        && isNonnegativeInteger(value.latencyMs)
        && typeof value.retryable === 'boolean';
    case 'task_scored':
      return exactKeys(value, ['type', 'taskId', 'score', 'maxScore', 'durationMs'])
        && isSafeId(value.taskId)
        && typeof value.score === 'number'
        && Number.isFinite(value.score)
        && isPositiveNumber(value.maxScore)
        && value.score >= 0
        && value.score <= value.maxScore
        && (value.durationMs === undefined || isNonnegativeInteger(value.durationMs));
    case 'task_choice_recorded':
      return exactKeys(value, ['type', 'taskId', 'optionId'])
        && isSafeId(value.taskId)
        && isSafeId(value.optionId);
    case 'objective_evidence_recorded':
      return exactKeys(value, [
        'type', 'objectiveId', 'rubricCriterionId', 'source',
      ])
        && isSafeId(value.objectiveId)
        && (value.rubricCriterionId === undefined || isSafeId(value.rubricCriterionId))
        && ['learner_turn', 'model_turn', 'educator'].includes(String(value.source));
    case 'protocol_deviation':
      return exactKeys(value, ['type', 'caseStepId', 'code', 'expectedId', 'observedId'])
        && isSafeId(value.caseStepId)
        && [
          'case_mismatch',
          'lesson_mismatch',
          'model_mismatch',
          'provider_mismatch',
          'inference_parameter_mismatch',
          'storage_unavailable',
        ].includes(String(value.code))
        && ((value.expectedId === undefined && value.observedId === undefined)
          || (isSafeProviderId(value.expectedId) && isSafeProviderId(value.observedId)));
    case 'run_ended':
      return exactKeys(value, ['type', 'reason']) && [
        'completed', 'withdrawn', 'retention_expired', 'storage_unavailable', 'abandoned',
      ].includes(String(value.reason));
    default:
      return false;
  }
}

function retentionDeadline(manifest: ResearchManifestV1): string {
  const dataManagement = (manifest as unknown as Record<string, unknown>).dataManagement;
  if (!isPlainRecord(dataManagement)) {
    throw new Error('The frozen research manifest does not define a retention plan.');
  }
  const candidate = dataManagement.browserDeleteAfter;
  if (typeof candidate !== 'string' || !isIsoTimestamp(candidate)) {
    throw new Error('The frozen research manifest must define an absolute retention deletion time.');
  }
  return candidate;
}

function assertBrowserLocalCollectionBoundary(manifest: ResearchManifestV1): void {
  const collection = (manifest as unknown as Record<string, unknown>).collection;
  const rawChat = isPlainRecord(collection) ? collection.rawChat : undefined;
  const currentViewCapture = isPlainRecord(collection) ? collection.currentViewCapture : undefined;
  if (!isPlainRecord(rawChat) || rawChat.enabled !== false) {
    throw new Error(
      'Browser-local ResearchStore requires raw chat collection to be disabled. Use a separately reviewed institution-managed deployment for raw learner or model text.',
    );
  }
  if (
    !isPlainRecord(currentViewCapture)
    || currentViewCapture.storedInSessionEvents !== false
    || currentViewCapture.exported !== false
  ) {
    throw new Error(
      'Browser-local ResearchStore cannot store or export current-view images.',
    );
  }
}

function bundleManifest(bundle: ResearchStudyBundleV1): ResearchManifestV1 {
  const manifest = (bundle as unknown as { researchManifest?: unknown }).researchManifest;
  if (!manifest) throw new Error('The research study bundle is missing its manifest.');
  return manifest as ResearchManifestV1;
}

function bundleCaseCount(bundle: ResearchStudyBundleV1): number {
  const cases = (bundle as unknown as { portableCases?: unknown }).portableCases;
  return Array.isArray(cases) ? cases.length : 0;
}

function assignedArmId(value: unknown): string {
  if (typeof value === 'string' && isSafeId(value)) return value;
  if (isPlainRecord(value)) {
    for (const key of ['id', 'armId'] as const) {
      if (isSafeId(value[key])) return value[key];
    }
  }
  throw new Error('The research manifest did not produce a valid study arm assignment.');
}

function studySummary(record: StoredStudyRecord): ResearchStudySummary {
  const { bundle: _bundle, ...summary } = record;
  return structuredClone(summary);
}

function validSyncMessage(value: unknown): value is SyncMessage {
  if (!isPlainRecord(value) || value.schema !== SYNC_SCHEMA || typeof value.type !== 'string') {
    return false;
  }
  if (value.type === 'all-deleted') {
    return exactKeys(value, ['schema', 'type', 'deletionEpoch'])
      && isNonnegativeInteger(value.deletionEpoch);
  }
  if (value.type === 'study-deleted') {
    return exactKeys(value, ['schema', 'type', 'manifestSha256'])
      && typeof value.manifestSha256 === 'string'
      && SHA256_PATTERN.test(value.manifestSha256);
  }
  return value.type === 'participant-deleted'
    && exactKeys(value, ['schema', 'type', 'manifestSha256', 'participantId'])
    && typeof value.manifestSha256 === 'string'
    && SHA256_PATTERN.test(value.manifestSha256)
    && typeof value.participantId === 'string'
    && validateResearchParticipantId(value.participantId);
}

function assertManifestSha256(value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error('A lowercase 64-character research manifest SHA-256 digest is required.');
  }
}

function assertParticipantId(value: string): void {
  if (!validateResearchParticipantId(value)) {
    throw new Error('A derived pseudonymous research participant ID is required.');
  }
}

function assertRunId(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error('A canonical research run UUID is required.');
}

function isDomainError(error: unknown): boolean {
  return error instanceof ResearchStorageUnavailableError
    || error instanceof ResearchDataInvalidatedError
    || error instanceof ResearchRetentionExpiredError
    || error instanceof ResearchStudyConflictError;
}

export type ResearchStoreStatusListener = (status: ResearchStorageStatus) => void;
export type ResearchStoreDataListener = () => void;

/**
 * Persistent, browser-local research storage. Unlike ordinary SessionStore,
 * this service never falls back to memory: an incomplete research log is
 * blocked rather than silently presented as durable study data.
 */
export class ResearchStore {
  private readonly factory: IDBFactory | null;
  private readonly databaseName: string;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly syncChannel: ResearchStoreSyncChannel | null;
  private readonly statusListeners = new Set<ResearchStoreStatusListener>();
  private readonly dataListeners = new Set<ResearchStoreDataListener>();
  private databasePromise: Promise<IDBDatabase | null> | null = null;
  private database: IDBDatabase | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();
  private knownDeletionEpoch: number | null = null;
  private status: ResearchStorageStatus;

  private readonly syncListener = (event: MessageEvent<unknown>) => {
    if (!validSyncMessage(event.data)) return;
    if (event.data.type === 'all-deleted') {
      this.knownDeletionEpoch = Math.max(this.knownDeletionEpoch ?? 0, event.data.deletionEpoch);
    }
    this.notifyDataChanged();
  };

  constructor(options: ResearchStoreOptions = {}) {
    this.factory = options.indexedDB === undefined ? browserIndexedDb() : options.indexedDB;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? browserUuid;
    this.syncChannel = options.syncChannel === undefined
      ? browserSyncChannel()
      : options.syncChannel;
    this.status = this.factory
      ? {
          mode: 'uninitialized',
          persistent: false,
          launchAllowed: false,
          message: 'Research storage has not been verified.',
        }
      : {
          mode: 'unavailable',
          persistent: false,
          launchAllowed: false,
          message: 'Research collection is blocked because persistent browser storage is unavailable.',
          reason: 'IndexedDB is unavailable in this browser context.',
        };
    this.syncChannel?.addEventListener('message', this.syncListener);
  }

  getStatus(): ResearchStorageStatus {
    return this.status;
  }

  subscribeStatus(listener: ResearchStoreStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  subscribeData(listener: ResearchStoreDataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  async initialize(): Promise<ResearchStorageStatus> {
    const database = await this.getDatabase();
    if (!database) return this.status;
    try {
      const transaction = database.transaction(META_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const epoch = await requestResult(
        transaction.objectStore(META_STORE).get(DELETION_EPOCH_KEY),
      ) as DeletionEpochRecord | undefined;
      await complete;
      this.knownDeletionEpoch = epoch?.value ?? 0;
    } catch (error) {
      this.failPersistentStorage(error);
    }
    return this.status;
  }

  async saveDraft(
    id: string,
    draft: ResearchManifestV1Draft,
  ): Promise<ResearchStudyDraftRecord> {
    if (!SAFE_DRAFT_ID.test(id)) {
      throw new Error('Research draft IDs must use lowercase letters, numbers, and hyphens.');
    }
    const snapshot = structuredClone(draft);
    const validation = validateResearchManifestDraftV1(snapshot);
    if (!validation.valid) {
      throw new Error(`Invalid research manifest draft:\n${validation.errors.join('\n')}`);
    }
    if (new TextEncoder().encode(canonicalizeJson(snapshot)).byteLength > MAX_DRAFT_BYTES) {
      throw new Error(`Research manifest drafts cannot exceed ${MAX_DRAFT_BYTES} bytes.`);
    }
    const expectedEpoch = this.knownDeletionEpoch;
    let saved!: ResearchStudyDraftRecord;
    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const transaction = database.transaction([DRAFT_STORE, META_STORE], 'readwrite');
      const complete = transactionComplete(transaction);
      try {
        await this.assertDeletionEpoch(transaction, expectedEpoch);
        const store = transaction.objectStore(DRAFT_STORE);
        const existing = await requestResult(store.get(id)) as ResearchStudyDraftRecord | undefined;
        const timestamp = isoTimestamp(this.now());
        saved = {
          id,
          draft: snapshot,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        store.put(saved);
        await complete;
      } catch (error) {
        await abortAndDrainTransaction(transaction, complete);
        throw error;
      }
    });
    this.notifyDataChanged();
    return structuredClone(saved);
  }

  async getDraft(id: string): Promise<ResearchStudyDraftRecord | null> {
    if (!SAFE_DRAFT_ID.test(id)) return null;
    await this.mutationQueue;
    const database = await this.requireDatabase();
    try {
      const transaction = database.transaction(DRAFT_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const record = await requestResult(transaction.objectStore(DRAFT_STORE).get(id)) as
        ResearchStudyDraftRecord | undefined;
      await complete;
      return record ? structuredClone(record) : null;
    } catch (error) {
      return this.rethrowStorageFailure(error);
    }
  }

  async listDrafts(): Promise<readonly ResearchStudyDraftRecord[]> {
    await this.mutationQueue;
    const database = await this.requireDatabase();
    try {
      const transaction = database.transaction(DRAFT_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const records = await requestResult(transaction.objectStore(DRAFT_STORE).getAll()) as
        ResearchStudyDraftRecord[];
      await complete;
      return records
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
        .map((record) => structuredClone(record));
    } catch (error) {
      return this.rethrowStorageFailure(error);
    }
  }

  async deleteDraft(id: string): Promise<boolean> {
    if (!SAFE_DRAFT_ID.test(id)) return false;
    let existed = false;
    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const transaction = database.transaction(DRAFT_STORE, 'readwrite');
      const complete = transactionComplete(transaction);
      const store = transaction.objectStore(DRAFT_STORE);
      existed = (await requestResult(store.count(id))) > 0;
      if (existed) store.delete(id);
      await complete;
    });
    if (existed) this.notifyDataChanged();
    return existed;
  }

  async saveStudyBundle(
    bundle: ResearchStudyBundleV1,
    options: { draftId?: string } = {},
  ): Promise<ResearchStudySummary> {
    const expectedEpoch = this.knownDeletionEpoch;
    const snapshot = structuredClone(bundle);
    const validation = await validateResearchStudyBundleV1(snapshot);
    if (!validation.valid) {
      throw new Error(`Invalid research study bundle:\n${validation.errors.join('\n')}`);
    }
    if (options.draftId !== undefined && !SAFE_DRAFT_ID.test(options.draftId)) {
      throw new Error('Research draft IDs must use lowercase letters, numbers, and hyphens.');
    }
    const manifest = bundleManifest(snapshot);
    const ref = getResearchManifestRef(manifest);
    const expiresAt = retentionDeadline(manifest);
    let result!: ResearchStudySummary;
    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const stores = [STUDY_STORE, DELETED_STUDY_STORE, META_STORE];
      if (options.draftId) stores.push(DRAFT_STORE);
      const transaction = database.transaction(stores, 'readwrite');
      const complete = transactionComplete(transaction);
      try {
        await this.assertDeletionEpoch(transaction, expectedEpoch);
        const deleted = await requestResult(
          transaction.objectStore(DELETED_STUDY_STORE).get(ref.sha256),
        );
        if (deleted) {
          throw new ResearchDataInvalidatedError(
            `Research study ${ref.sha256} was deleted and cannot be recreated.`,
          );
        }
        const studies = transaction.objectStore(STUDY_STORE);
        const existing = await requestResult(studies.get(ref.sha256)) as StoredStudyRecord | undefined;
        if (existing) {
          if (canonicalizeJson(existing.bundle) !== canonicalizeJson(snapshot)) {
            throw new ResearchStudyConflictError(
              `Research study ${ref.sha256} is already frozen with different bytes.`,
            );
          }
          if (options.draftId) transaction.objectStore(DRAFT_STORE).delete(options.draftId);
          result = studySummary(existing);
          await complete;
          return;
        }
        const stored: StoredStudyRecord = {
          id: ref.id,
          version: ref.version,
          manifestSha256: ref.sha256,
          caseCount: bundleCaseCount(snapshot),
          retentionExpiresAt: expiresAt,
          createdAt: isoTimestamp(this.now()),
          bundle: snapshot,
        };
        studies.add(stored);
        if (options.draftId) transaction.objectStore(DRAFT_STORE).delete(options.draftId);
        result = studySummary(stored);
        await complete;
      } catch (error) {
        await abortAndDrainTransaction(transaction, complete);
        throw error;
      }
    });
    this.notifyDataChanged();
    return result;
  }

  async getStudyBundle(manifestSha256: string): Promise<ResearchStudyBundleV1 | null> {
    assertManifestSha256(manifestSha256);
    const record = await this.getStoredStudy(manifestSha256);
    return record ? structuredClone(record.bundle) : null;
  }

  async listStudies(): Promise<readonly ResearchStudySummary[]> {
    await this.mutationQueue;
    const database = await this.requireDatabase();
    try {
      const transaction = database.transaction(STUDY_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const records = await requestResult(transaction.objectStore(STUDY_STORE).getAll()) as
        StoredStudyRecord[];
      await complete;
      return records
        .map(studySummary)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)
          || left.manifestSha256.localeCompare(right.manifestSha256));
    } catch (error) {
      return this.rethrowStorageFailure(error);
    }
  }

  async startRun(options: StartResearchRunOptions): Promise<ResearchRunV1> {
    assertManifestSha256(options.manifestSha256);
    assertParticipantId(options.participantId);
    const runId = options.runId ?? this.createId();
    assertRunId(runId);
    const operationAt = isoTimestamp(this.now());
    const startedAt = options.startedAt ?? operationAt;
    if (!isIsoTimestamp(startedAt)) throw new Error('A valid UTC run start time is required.');
    const expectedEpoch = this.knownDeletionEpoch;
    const study = await this.getStoredStudy(options.manifestSha256);
    if (!study) throw new Error('Freeze the exact research study bundle before participant launch.');
    const launchReadiness = await checkResearchStudyLaunchReadiness(study.bundle);
    if (!launchReadiness.valid) {
      throw new Error(
        `Research study is not ready for participant launch:\n${launchReadiness.errors.join('\n')}`,
      );
    }
    assertBrowserLocalCollectionBoundary(bundleManifest(study.bundle));
    // A caller-supplied historical record timestamp must never bypass the
    // actual browser retention deadline.
    this.assertRetentionActive(study.retentionExpiresAt, operationAt);
    this.assertRetentionActive(study.retentionExpiresAt, startedAt);
    const assignment = await assignResearchArm(
      bundleManifest(study.bundle),
      options.participantId,
    );
    const armId = assignedArmId(assignment);
    const firstRecordId = this.createId();
    assertRunId(firstRecordId);
    const run: ResearchRunV1 = {
      schema: RESEARCH_RUN_SCHEMA,
      schemaVersion: RESEARCH_RUN_VERSION,
      runId,
      manifestRef: getResearchManifestRef(bundleManifest(study.bundle)),
      participantId: options.participantId,
      armId,
      startedAt,
      status: 'active',
      nextSequence: 1,
    };
    const firstRecord: ResearchRecordV1 = {
      schema: RESEARCH_RECORD_SCHEMA,
      schemaVersion: RESEARCH_RECORD_VERSION,
      recordId: firstRecordId,
      runId,
      manifestRef: structuredClone(run.manifestRef),
      participantId: options.participantId,
      sequence: 0,
      occurredAt: startedAt,
      event: { type: 'run_started', armId },
    };

    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const transaction = database.transaction([
        STUDY_STORE,
        RUN_STORE,
        RECORD_STORE,
        DELETED_STUDY_STORE,
        DELETED_PARTICIPANT_STORE,
        META_STORE,
      ], 'readwrite');
      const complete = transactionComplete(transaction);
      try {
        await this.assertDeletionEpoch(transaction, expectedEpoch);
        await this.assertNotTombstoned(
          transaction,
          options.manifestSha256,
          options.participantId,
        );
        const currentStudy = await requestResult(
          transaction.objectStore(STUDY_STORE).get(options.manifestSha256),
        ) as StoredStudyRecord | undefined;
        if (!currentStudy || canonicalizeJson(currentStudy.bundle) !== canonicalizeJson(study.bundle)) {
          throw new ResearchDataInvalidatedError(
            'The frozen research study changed or was deleted before participant launch.',
          );
        }
        this.assertRetentionActive(currentStudy.retentionExpiresAt, operationAt);
        this.assertRetentionActive(currentStudy.retentionExpiresAt, startedAt);
        const runs = transaction.objectStore(RUN_STORE);
        const records = transaction.objectStore(RECORD_STORE);
        if (await requestResult(runs.get(runId))) {
          throw new ResearchStudyConflictError(
            `Research run ${runId} already exists; generate a new run identifier.`,
          );
        }
        if (await requestResult(records.get(firstRecordId))) {
          throw new ResearchStudyConflictError(
            'A generated research record identifier already exists; retry participant launch.',
          );
        }
        runs.add(run);
        records.add(firstRecord);
        await complete;
      } catch (error) {
        await abortAndDrainTransaction(transaction, complete);
        throw error;
      }
    });
    this.notifyDataChanged();
    return structuredClone(run);
  }

  async append(runId: string, payload: ResearchRecordPayloadV1): Promise<ResearchRecordV1> {
    assertRunId(runId);
    const event = structuredClone(payload);
    if (!validateResearchRecordPayloadV1(event) || event.type === 'run_started' || event.type === 'run_ended') {
      throw new Error('Invalid research record payload. Raw or free-text fields are not accepted.');
    }
    await this.assertEventMatchesFrozenRun(runId, event);
    return this.appendRecord(runId, event, false);
  }

  async endRun(
    runId: string,
    reason: Extract<ResearchRecordPayloadV1, { type: 'run_ended' }>['reason'],
  ): Promise<ResearchRecordV1> {
    assertRunId(runId);
    const event = structuredClone({ type: 'run_ended' as const, reason });
    if (!validateResearchRecordPayloadV1(event) || event.type !== 'run_ended') {
      throw new Error('Invalid research run end payload. Only a closed run-end reason is accepted.');
    }
    return this.appendRecord(runId, event, true);
  }

  async listRuns(
    manifestSha256?: string,
    participantId?: string,
  ): Promise<readonly ResearchRunV1[]> {
    if (manifestSha256) assertManifestSha256(manifestSha256);
    if (participantId) assertParticipantId(participantId);
    if (participantId && !manifestSha256) {
      throw new Error('A manifest digest is required when filtering by participant.');
    }
    await this.mutationQueue;
    const database = await this.requireDatabase();
    try {
      const transaction = database.transaction(RUN_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const store = transaction.objectStore(RUN_STORE);
      let request: IDBRequest<ResearchRunV1[]>;
      if (manifestSha256 && participantId) {
        request = store.index(RUN_PARTICIPANT_INDEX).getAll([manifestSha256, participantId]);
      } else if (manifestSha256) {
        request = store.index(RUN_STUDY_INDEX).getAll(manifestSha256);
      } else {
        request = store.getAll();
      }
      const runs = await requestResult(request);
      await complete;
      return runs
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt)
          || left.runId.localeCompare(right.runId))
        .map((run) => structuredClone(run));
    } catch (error) {
      return this.rethrowStorageFailure(error);
    }
  }

  async listRecords(runId?: string): Promise<readonly ResearchRecordV1[]> {
    if (runId) assertRunId(runId);
    await this.mutationQueue;
    const database = await this.requireDatabase();
    try {
      const transaction = database.transaction(RECORD_STORE, 'readonly');
      const complete = transactionComplete(transaction);
      const store = transaction.objectStore(RECORD_STORE);
      const records = await requestResult(
        runId ? store.index(RECORD_RUN_INDEX).getAll(runId) : store.getAll(),
      ) as ResearchRecordV1[];
      await complete;
      return records
        .sort((left, right) => left.runId.localeCompare(right.runId)
          || left.sequence - right.sequence
          || left.recordId.localeCompare(right.recordId))
        .map((record) => structuredClone(record));
    } catch (error) {
      return this.rethrowStorageFailure(error);
    }
  }

  async getExportSnapshot(manifestSha256: string): Promise<ResearchStudyExportSnapshotV1> {
    assertManifestSha256(manifestSha256);
    await this.mutationQueue;
    const database = await this.requireDatabase();
    try {
      const transaction = database.transaction(
        [STUDY_STORE, RUN_STORE, RECORD_STORE, DELETED_STUDY_STORE],
        'readonly',
      );
      const complete = transactionComplete(transaction);
      const deleted = await requestResult(
        transaction.objectStore(DELETED_STUDY_STORE).get(manifestSha256),
      );
      const study = await requestResult(
        transaction.objectStore(STUDY_STORE).get(manifestSha256),
      ) as StoredStudyRecord | undefined;
      const runs = await requestResult(
        transaction.objectStore(RUN_STORE).index(RUN_STUDY_INDEX).getAll(manifestSha256),
      ) as ResearchRunV1[];
      const records = await requestResult(
        transaction.objectStore(RECORD_STORE).index(RECORD_STUDY_INDEX).getAll(manifestSha256),
      ) as ResearchRecordV1[];
      await complete;
      if (deleted || !study) {
        throw new ResearchDataInvalidatedError('The frozen research study was deleted.');
      }
      this.assertRetentionActive(study.retentionExpiresAt, isoTimestamp(this.now()));
      runs.sort((left, right) => left.runId.localeCompare(right.runId));
      records.sort((left, right) => left.runId.localeCompare(right.runId)
        || left.sequence - right.sequence
        || left.recordId.localeCompare(right.recordId));
      return {
        bundle: structuredClone(study.bundle),
        study: studySummary(study),
        runs: runs.map((run) => structuredClone(run)),
        records: records.map((record) => structuredClone(record)),
      };
    } catch (error) {
      if (isDomainError(error)) throw error;
      return this.rethrowStorageFailure(error);
    }
  }

  async deleteParticipant(
    manifestSha256: string,
    participantId: string,
  ): Promise<ResearchDeletionResult> {
    assertManifestSha256(manifestSha256);
    assertParticipantId(participantId);
    const result: ResearchDeletionResult = {
      studies: 0,
      runs: 0,
      records: 0,
      drafts: 0,
      retainedAntiResurrection: {
        kind: 'participant-tombstone',
        manifestSha256,
        participantId,
        retainedUntil: 'study-or-all-data-deletion',
        excludedFromListsAndExports: true,
      },
    };
    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const transaction = database.transaction(
        [RUN_STORE, RECORD_STORE, DELETED_PARTICIPANT_STORE],
        'readwrite',
      );
      const complete = transactionComplete(transaction);
      try {
        const runs = await requestResult(
          transaction.objectStore(RUN_STORE).index(RUN_PARTICIPANT_INDEX)
            .getAll([manifestSha256, participantId]),
        ) as ResearchRunV1[];
        const records = transaction.objectStore(RECORD_STORE);
        for (const run of runs) {
          const runRecords = await requestResult(
            records.index(RECORD_RUN_INDEX).getAll(run.runId),
          ) as ResearchRecordV1[];
          for (const record of runRecords) records.delete(record.recordId);
          transaction.objectStore(RUN_STORE).delete(run.runId);
          result.records += runRecords.length;
        }
        result.runs = runs.length;
        transaction.objectStore(DELETED_PARTICIPANT_STORE).put({
          deletionKey: participantDeletionKey(manifestSha256, participantId),
          manifestSha256,
          participantId,
          deletedAt: isoTimestamp(this.now()),
        } satisfies DeletedParticipantRecord);
        await complete;
      } catch (error) {
        await abortAndDrainTransaction(transaction, complete);
        throw error;
      }
    });
    this.broadcast({ schema: SYNC_SCHEMA, type: 'participant-deleted', manifestSha256, participantId });
    this.notifyDataChanged();
    return result;
  }

  async deleteStudy(manifestSha256: string): Promise<ResearchDeletionResult> {
    assertManifestSha256(manifestSha256);
    const result: ResearchDeletionResult = {
      studies: 0,
      runs: 0,
      records: 0,
      drafts: 0,
      retainedAntiResurrection: {
        kind: 'study-tombstone',
        manifestSha256,
        retainedUntil: 'all-data-deletion',
        excludedFromListsAndExports: true,
      },
    };
    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const transaction = database.transaction(
        [
          STUDY_STORE,
          RUN_STORE,
          RECORD_STORE,
          DELETED_STUDY_STORE,
          DELETED_PARTICIPANT_STORE,
        ],
        'readwrite',
      );
      const complete = transactionComplete(transaction);
      try {
        const studies = transaction.objectStore(STUDY_STORE);
        const existing = await requestResult(studies.get(manifestSha256));
        const runs = await requestResult(
          transaction.objectStore(RUN_STORE).index(RUN_STUDY_INDEX).getAll(manifestSha256),
        ) as ResearchRunV1[];
        const records = await requestResult(
          transaction.objectStore(RECORD_STORE).index(RECORD_STUDY_INDEX).getAll(manifestSha256),
        ) as ResearchRecordV1[];
        const participantTombstones = await requestResult(
          transaction.objectStore(DELETED_PARTICIPANT_STORE).getAll(),
        ) as DeletedParticipantRecord[];
        for (const record of records) transaction.objectStore(RECORD_STORE).delete(record.recordId);
        for (const run of runs) transaction.objectStore(RUN_STORE).delete(run.runId);
        for (const tombstone of participantTombstones) {
          if (tombstone.manifestSha256 === manifestSha256) {
            transaction.objectStore(DELETED_PARTICIPANT_STORE).delete(tombstone.deletionKey);
          }
        }
        if (existing) studies.delete(manifestSha256);
        transaction.objectStore(DELETED_STUDY_STORE).put({
          manifestSha256,
          deletedAt: isoTimestamp(this.now()),
        } satisfies DeletedStudyRecord);
        result.studies = existing ? 1 : 0;
        result.runs = runs.length;
        result.records = records.length;
        await complete;
      } catch (error) {
        await abortAndDrainTransaction(transaction, complete);
        throw error;
      }
    });
    this.broadcast({ schema: SYNC_SCHEMA, type: 'study-deleted', manifestSha256 });
    this.notifyDataChanged();
    return result;
  }

  async deleteAll(): Promise<ResearchDeletionResult> {
    const result: ResearchDeletionResult = {
      studies: 0,
      runs: 0,
      records: 0,
      drafts: 0,
      retainedAntiResurrection: {
        kind: 'global-deletion-epoch',
        deletionEpoch: 0,
        containsStudyOrParticipantIdentifiers: false,
      },
    };
    let nextEpoch = 0;
    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const transaction = database.transaction([
        DRAFT_STORE,
        STUDY_STORE,
        RUN_STORE,
        RECORD_STORE,
        DELETED_STUDY_STORE,
        DELETED_PARTICIPANT_STORE,
        META_STORE,
      ], 'readwrite');
      const complete = transactionComplete(transaction);
      try {
        const drafts = await requestResult(transaction.objectStore(DRAFT_STORE).getAllKeys());
        const studies = await requestResult(transaction.objectStore(STUDY_STORE).getAll()) as
          StoredStudyRecord[];
        const runs = await requestResult(transaction.objectStore(RUN_STORE).getAllKeys());
        const records = await requestResult(transaction.objectStore(RECORD_STORE).getAllKeys());
        const epoch = await requestResult(
          transaction.objectStore(META_STORE).get(DELETION_EPOCH_KEY),
        ) as DeletionEpochRecord | undefined;
        nextEpoch = (epoch?.value ?? 0) + 1;
        transaction.objectStore(DRAFT_STORE).clear();
        transaction.objectStore(STUDY_STORE).clear();
        transaction.objectStore(RUN_STORE).clear();
        transaction.objectStore(RECORD_STORE).clear();
        // A full deletion removes every marker containing a study or participant
        // identifier. The monotonically increasing numeric epoch is enough to
        // invalidate writes queued by stale tabs without retaining linkable data.
        transaction.objectStore(DELETED_STUDY_STORE).clear();
        transaction.objectStore(DELETED_PARTICIPANT_STORE).clear();
        transaction.objectStore(META_STORE).put({
          key: DELETION_EPOCH_KEY,
          value: nextEpoch,
        } satisfies DeletionEpochRecord);
        result.drafts = drafts.length;
        result.studies = studies.length;
        result.runs = runs.length;
        result.records = records.length;
        result.retainedAntiResurrection = {
          kind: 'global-deletion-epoch',
          deletionEpoch: nextEpoch,
          containsStudyOrParticipantIdentifiers: false,
        };
        await complete;
      } catch (error) {
        await abortAndDrainTransaction(transaction, complete);
        throw error;
      }
    });
    this.knownDeletionEpoch = nextEpoch;
    this.broadcast({ schema: SYNC_SCHEMA, type: 'all-deleted', deletionEpoch: nextEpoch });
    this.notifyDataChanged();
    return result;
  }

  close(): void {
    this.syncChannel?.removeEventListener('message', this.syncListener);
    this.syncChannel?.close();
    this.database?.close();
    this.database = null;
    this.databasePromise = null;
  }

  private async appendRecord(
    runId: string,
    event: ResearchRecordPayloadV1,
    endRun: boolean,
  ): Promise<ResearchRecordV1> {
    const expectedEpoch = this.knownDeletionEpoch;
    const recordId = this.createId();
    assertRunId(recordId);
    const occurredAt = isoTimestamp(this.now());
    let result!: ResearchRecordV1;
    await this.enqueueMutation(async () => {
      const database = await this.requireDatabase();
      const transaction = database.transaction([
        STUDY_STORE,
        RUN_STORE,
        RECORD_STORE,
        DELETED_STUDY_STORE,
        DELETED_PARTICIPANT_STORE,
        META_STORE,
      ], 'readwrite');
      const complete = transactionComplete(transaction);
      try {
        await this.assertDeletionEpoch(transaction, expectedEpoch);
        const runs = transaction.objectStore(RUN_STORE);
        const run = await requestResult(runs.get(runId)) as ResearchRunV1 | undefined;
        if (!run) throw new ResearchDataInvalidatedError(`Research run ${runId} no longer exists.`);
        if (run.status !== 'active') throw new Error(`Research run ${runId} has already ended.`);
        await this.assertNotTombstoned(
          transaction,
          run.manifestRef.sha256,
          run.participantId,
        );
        const study = await requestResult(
          transaction.objectStore(STUDY_STORE).get(run.manifestRef.sha256),
        ) as StoredStudyRecord | undefined;
        if (!study) throw new ResearchDataInvalidatedError('The frozen research study was deleted.');
        this.assertRetentionActive(study.retentionExpiresAt, occurredAt);
        result = {
          schema: RESEARCH_RECORD_SCHEMA,
          schemaVersion: RESEARCH_RECORD_VERSION,
          recordId,
          runId,
          manifestRef: structuredClone(run.manifestRef),
          participantId: run.participantId,
          sequence: run.nextSequence,
          occurredAt,
          event,
        };
        const records = transaction.objectStore(RECORD_STORE);
        if (await requestResult(records.get(recordId))) {
          throw new ResearchStudyConflictError(
            'A generated research record identifier already exists; retry the record write.',
          );
        }
        records.add(result);
        const updated: ResearchRunV1 = {
          ...run,
          nextSequence: run.nextSequence + 1,
          ...(endRun ? { status: 'ended', endedAt: occurredAt } : {}),
        };
        runs.put(updated);
        await complete;
      } catch (error) {
        await abortAndDrainTransaction(transaction, complete);
        throw error;
      }
    });
    this.notifyDataChanged();
    return structuredClone(result);
  }

  private async assertEventMatchesFrozenRun(
    runId: string,
    event: ResearchRecordPayloadV1,
  ): Promise<void> {
    await this.mutationQueue;
    const database = await this.requireDatabase();
    let run: ResearchRunV1 | undefined;
    let study: StoredStudyRecord | undefined;
    try {
      const transaction = database.transaction([RUN_STORE, STUDY_STORE], 'readonly');
      const complete = transactionComplete(transaction);
      run = await requestResult(transaction.objectStore(RUN_STORE).get(runId)) as
        ResearchRunV1 | undefined;
      study = run
        ? await requestResult(
            transaction.objectStore(STUDY_STORE).get(run.manifestRef.sha256),
          ) as StoredStudyRecord | undefined
        : undefined;
      await complete;
    } catch (error) {
      return this.rethrowStorageFailure(error);
    }
    if (!run || !study) {
      throw new ResearchDataInvalidatedError(
        `Research run ${runId} or its frozen study no longer exists.`,
      );
    }
    const manifest = bundleManifest(study.bundle);
    const arm = manifest.arms.find((candidate) => candidate.id === run?.armId);
    if (!arm) {
      throw new ResearchDataInvalidatedError(
        `Research run ${runId} references an arm absent from its frozen manifest.`,
      );
    }
    if ('caseStepId' in event) {
      const step = arm.caseSteps.find((candidate) => candidate.id === event.caseStepId);
      if (!step) {
        throw new Error(
          `Research event case step '${event.caseStepId}' is not in frozen arm '${arm.id}'.`,
        );
      }
      if (event.type === 'learner_turn_submitted' && event.mode !== step.mode) {
        throw new Error(
          `Research learner mode '${event.mode}' does not match frozen case step '${step.id}'.`,
        );
      }
      if (event.type === 'capture_recorded') {
        if (
          event.capturePipelineVersion !== arm.capturePolicy.pipelineVersion
          || event.mimeType !== arm.capturePolicy.format
        ) {
          throw new Error(
            `Research capture for '${step.id}' does not match the frozen capture policy.`,
          );
        }
      }
      if (event.type === 'model_turn_completed' || event.type === 'model_turn_failed') {
        const expectedInferenceHash = await computeResearchInferencePolicyHash(
          arm.inferencePolicy,
        );
        if (event.inferenceConfigSha256 !== expectedInferenceHash) {
          throw new Error(
            `Research inference configuration for '${step.id}' does not match the frozen arm.`,
          );
        }
        if (event.requestedModelId !== arm.inferencePolicy.requestedModelId) {
          throw new Error(
            `Research requested model for '${step.id}' does not match the frozen arm.`,
          );
        }
        if (
          event.systemPromptSha256 !== undefined
          && event.systemPromptSha256 !== step.systemPromptSha256
        ) {
          throw new Error(
            `Research system prompt for '${step.id}' does not match the frozen case step.`,
          );
        }
        if (
          event.type === 'model_turn_completed'
          && event.upstreamProviderId !== undefined
          && event.upstreamProviderId !== arm.inferencePolicy.provider.only[0]
        ) {
          throw new Error(
            `Research upstream provider for '${step.id}' does not match the frozen arm.`,
          );
        }
      }
    }

    if (event.type === 'task_scored' || event.type === 'task_choice_recorded') {
      if (!manifest.collection.taskResponses.enabled) {
        throw new Error('Research task response collection is disabled in the frozen manifest.');
      }
      const matches = [...manifest.tasks.pre, ...manifest.tasks.post]
        .filter((task) => task.id === event.taskId);
      if (matches.length !== 1) {
        throw new Error(
          `Research task '${event.taskId}' does not resolve to exactly one task in the frozen manifest.`,
        );
      }
      const task = matches[0];
      if (event.type === 'task_choice_recorded') {
        if (task.response.kind !== 'single-choice') {
          throw new Error(
            `Research task '${task.id}' does not permit a single-choice response in the frozen manifest.`,
          );
        }
        if (!task.response.options.some((option) => option.id === event.optionId)) {
          throw new Error(
            `Research option '${event.optionId}' is not declared for task '${task.id}' in the frozen manifest.`,
          );
        }
      } else {
        if (task.response.kind !== 'integer-scale') {
          throw new Error(
            `Research task '${task.id}' does not permit an integer-scale score in the frozen manifest.`,
          );
        }
        const expectedMaxScore = task.response.max - task.response.min;
        if (!Number.isSafeInteger(event.score) || event.maxScore !== expectedMaxScore) {
          throw new Error(
            `Research score for task '${task.id}' does not match its frozen integer scale.`,
          );
        }
      }
    }

    if (event.type === 'objective_evidence_recorded') {
      // v1 objective evidence has no case-step or lesson reference. An arm can
      // contain multiple exact lessons with overlapping objective/rubric IDs,
      // so accepting this payload would permit ambiguous or invented evidence.
      throw new Error(
        'Research objective evidence is not supported until the event identifies its exact frozen case step and lesson.',
      );
    }
  }

  private async getStoredStudy(manifestSha256: string): Promise<StoredStudyRecord | null> {
    await this.mutationQueue;
    const database = await this.requireDatabase();
    try {
      const transaction = database.transaction([STUDY_STORE, DELETED_STUDY_STORE], 'readonly');
      const complete = transactionComplete(transaction);
      const deleted = await requestResult(
        transaction.objectStore(DELETED_STUDY_STORE).get(manifestSha256),
      );
      const record = await requestResult(
        transaction.objectStore(STUDY_STORE).get(manifestSha256),
      ) as StoredStudyRecord | undefined;
      await complete;
      return deleted || !record ? null : structuredClone(record);
    } catch (error) {
      return this.rethrowStorageFailure(error);
    }
  }

  private assertRetentionActive(retentionExpiresAt: string, now: string): void {
    if (Date.parse(now) >= Date.parse(retentionExpiresAt)) {
      throw new ResearchRetentionExpiredError(
        `Research retention ended at ${retentionExpiresAt}. New records and exports are blocked; delete the retained study data.`,
      );
    }
  }

  private async assertDeletionEpoch(
    transaction: IDBTransaction,
    expectedEpoch: number | null,
  ): Promise<void> {
    const record = await requestResult(
      transaction.objectStore(META_STORE).get(DELETION_EPOCH_KEY),
    ) as DeletionEpochRecord | undefined;
    const currentEpoch = record?.value ?? 0;
    if (expectedEpoch === null ? currentEpoch !== 0 : expectedEpoch !== currentEpoch) {
      this.knownDeletionEpoch = currentEpoch;
      throw new ResearchDataInvalidatedError(
        'Research data was deleted in another browser tab before this operation could be stored. Reload and start from the current study state.',
      );
    }
  }

  private async assertNotTombstoned(
    transaction: IDBTransaction,
    manifestSha256: string,
    participantId: string,
  ): Promise<void> {
    const studyDeleted = await requestResult(
      transaction.objectStore(DELETED_STUDY_STORE).get(manifestSha256),
    );
    if (studyDeleted) {
      throw new ResearchDataInvalidatedError(
        `Research study ${manifestSha256} was deleted and cannot be recreated.`,
      );
    }
    const participantDeleted = await requestResult(
      transaction.objectStore(DELETED_PARTICIPANT_STORE)
        .get(participantDeletionKey(manifestSha256, participantId)),
    );
    if (participantDeleted) {
      throw new ResearchDataInvalidatedError(
        'This pseudonymous participant was deleted and cannot be recreated in the frozen study.',
      );
    }
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const result = this.mutationQueue.then(async () => {
      try {
        await operation();
      } catch (error) {
        if (isDomainError(error) || (error instanceof Error && /invalid|already|duplicate|required|freeze/i.test(error.message))) {
          throw error;
        }
        this.failPersistentStorage(error);
      }
    });
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  private async requireDatabase(): Promise<IDBDatabase> {
    const database = await this.getDatabase();
    if (!database) {
      throw new ResearchStorageUnavailableError(this.status.mode === 'unavailable'
        ? this.status.reason
        : 'Persistent research storage is unavailable.');
    }
    return database;
  }

  private async getDatabase(): Promise<IDBDatabase | null> {
    if (this.database) return this.database;
    if (!this.factory) return null;
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(this.factory, this.databaseName)
        .then((database) => {
          this.database = database;
          this.setStatus({
            mode: 'indexeddb',
            persistent: true,
            launchAllowed: true,
            message: 'Research data is stored only in this browser.',
          });
          database.onversionchange = () => {
            database.close();
            if (this.database === database) this.database = null;
            this.markPersistentStorageUnavailable(
              new Error('Research storage changed in another tab. Reload before collecting data.'),
            );
          };
          return database;
        })
        .catch((error) => {
          this.databasePromise = null;
          this.setStatus({
            mode: 'unavailable',
            persistent: false,
            launchAllowed: false,
            message: 'Research collection is blocked because persistent browser storage is unavailable.',
            reason: fallbackReason(error),
          });
          return null;
        });
    }
    return this.databasePromise;
  }

  private failPersistentStorage(error: unknown): never {
    throw new ResearchStorageUnavailableError(this.markPersistentStorageUnavailable(error));
  }

  private markPersistentStorageUnavailable(error: unknown): string {
    const reason = fallbackReason(error);
    this.database?.close();
    this.database = null;
    this.databasePromise = null;
    this.setStatus({
      mode: 'unavailable',
      persistent: false,
      launchAllowed: false,
      message: 'Research collection is blocked because persistent browser storage is unavailable.',
      reason,
    });
    return reason;
  }

  private rethrowStorageFailure(error: unknown): never {
    if (isDomainError(error)) throw error;
    return this.failPersistentStorage(error);
  }

  private setStatus(status: ResearchStorageStatus): void {
    if (canonicalizeJson(this.status) === canonicalizeJson(status)) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(this.status);
  }

  private notifyDataChanged(): void {
    for (const listener of this.dataListeners) listener();
  }

  private broadcast(message: SyncMessage): void {
    try {
      this.syncChannel?.postMessage(message);
    } catch {
      // Durable IndexedDB tombstones remain the authority if delivery fails.
    }
  }
}

export const researchStore = new ResearchStore();
