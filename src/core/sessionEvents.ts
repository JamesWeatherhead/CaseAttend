import type { LearnerLevel } from '../constants';
import type { LessonPlanRef } from './lessonPlan';

export const SESSION_EVENT_SCHEMA = 'caseattend.session-event' as const;
export const SESSION_EVENT_SCHEMA_VERSION = '1.0' as const;

export interface SessionCasePackageRef {
  id: string;
  schemaVersion: '1.0';
  sha256: string;
}

export interface SessionAnnotationAggregate {
  present: boolean;
  measurementCount: number;
  segmentedFrameCount: number;
  activeFrameLabelCount: number;
  revision: number;
  lastChangedAt?: string;
}

export interface CaseOpenedSessionStartedEvent {
  type: 'session_started';
  startReason: 'case_opened';
  previousSessionId?: never;
}

export interface LinkedSessionStartedEvent {
  type: 'session_started';
  startReason: 'case_switched' | 'lesson_changed' | 'user_restarted';
  previousSessionId: string;
}

export type SessionStartedEvent = CaseOpenedSessionStartedEvent | LinkedSessionStartedEvent;

export interface SessionEndedEvent {
  type: 'session_ended';
  reason: 'navigation' | 'case_switched' | 'lesson_changed' | 'user_restarted' | 'page_hidden';
}

interface ViewCaptureSucceededEventBase {
  type: 'view_capture_succeeded';
  turnId: string;
  seriesId: string;
  assetSha256: string;
  annotation: SessionAnnotationAggregate;
}

export interface SingleImageViewCaptureSucceededEvent extends ViewCaptureSucceededEventBase {
  artifactKind: 'image';
  frameId?: never;
  frameIndex: 0;
  frameCount: 1;
}

export interface ImageStackViewCaptureSucceededEvent extends ViewCaptureSucceededEventBase {
  artifactKind: 'image-stack';
  frameId: string;
  frameIndex: number;
  frameCount: number;
}

export type ViewCaptureSucceededEvent =
  | SingleImageViewCaptureSucceededEvent
  | ImageStackViewCaptureSucceededEvent;

export interface ViewCaptureFailedEvent {
  type: 'view_capture_failed';
  turnId: string;
  reason: 'viewer_loading' | 'no_frame';
}

interface LearnerMessageSubmittedEventBase {
  type: 'learner_message_submitted';
  turnId: string;
  learnerLevel: LearnerLevel;
  mode: 'chat' | 'deep_think' | 'search';
}

export type LearnerMessageSubmittedEvent = LearnerMessageSubmittedEventBase & (
  | {
      inputSource: 'typed' | 'retry';
      hintId?: never;
    }
  | {
      inputSource: 'lesson_hint';
      hintId: string;
    }
);

export interface SessionInferenceUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type SessionFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'error'
  | 'other';

export interface ModelResponseCompletedEvent {
  type: 'model_response_completed';
  turnId: string;
  promptSha256: string;
  gateway: 'openrouter';
  requestedModelId: string;
  resolvedModelId?: string;
  upstreamProviderId?: string;
  latencyMs: number;
  usage?: SessionInferenceUsage;
  finishReason?: SessionFinishReason;
}

export interface ModelResponseFailedEvent {
  type: 'model_response_failed';
  turnId: string;
  promptSha256?: string;
  gateway: 'openrouter';
  requestedModelId: string;
  errorCode: string;
  httpStatus?: number;
  latencyMs: number;
  retryable: boolean;
}

export interface TurnCancelledEvent {
  type: 'turn_cancelled';
  turnId: string;
}

export interface ObjectiveEvidenceRecordedEvent {
  type: 'objective_evidence_recorded';
  turnId: string;
  objectiveId: string;
  rubricCriterionId?: string;
  source: 'learner_turn' | 'model_turn' | 'educator';
}

export type LessonCompletionReason = 'objectives_met' | 'budget_spent';

export interface LessonCompletedEvent {
  type: 'lesson_completed';
  reason: LessonCompletionReason;
  turnsUsed: number;
  objectivesMet: number;
}

export type SessionEventPayloadV1 =
  | SessionStartedEvent
  | SessionEndedEvent
  | ViewCaptureSucceededEvent
  | ViewCaptureFailedEvent
  | LearnerMessageSubmittedEvent
  | ModelResponseCompletedEvent
  | ModelResponseFailedEvent
  | TurnCancelledEvent
  | ObjectiveEvidenceRecordedEvent
  | LessonCompletedEvent;

export interface SessionEventV1 {
  schema: typeof SESSION_EVENT_SCHEMA;
  schemaVersion: typeof SESSION_EVENT_SCHEMA_VERSION;
  appVersion: string;
  eventId: string;
  sessionId: string;
  sequence: number;
  occurredAt: string;
  casePackageRef: SessionCasePackageRef;
  lessonPlanRef: LessonPlanRef;
  event: SessionEventPayloadV1;
}

export interface SessionEventValidationResult {
  valid: boolean;
  errors: string[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const LEARNER_LEVELS = new Set<LearnerLevel>([
  'highschool',
  'undergrad',
  'ms_preclinical',
  'ms_clinical',
  'resident',
]);
const MODES = new Set(['chat', 'deep_think', 'search']);
const FINISH_REASONS = new Set<SessionFinishReason>([
  'stop',
  'length',
  'content_filter',
  'tool_calls',
  'error',
  'other',
]);

const FORBIDDEN_FIELD_NAMES = new Set([
  'apikey',
  'authorization',
  'bearertoken',
  'token',
  'password',
  'secret',
  'accesstoken',
  'refreshtoken',
  'credential',
  'credentials',
  'cookie',
  'patientid',
  'patientname',
  'accessionnumber',
  'medicalrecordnumber',
  'mrn',
  'dateofbirth',
  'dob',
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'postaladdress',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    errors.push(`${path} is required and must be an object.`);
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    errors.push(`${path} must be a plain JSON object.`);
    return null;
  }
  return value;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${path}.${key} is not valid in Session Event v1.`);
    }
  }
}

function normalizedFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rejectUnsafeMetadata(
  value: unknown,
  path: string,
  errors: string[],
  seen: WeakSet<object>,
): void {
  if (value === undefined) {
    errors.push(`${path} cannot be undefined. Omit optional fields instead.`);
    return;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^(?:data|blob):/i.test(trimmed)) {
      errors.push(`${path} must not contain data: or blob: content.`);
    }
    if (/\bBearer\s+[A-Za-z0-9._~-]+/i.test(value) || /\bsk-[A-Za-z0-9_-]{8,}/i.test(value)) {
      errors.push(`${path} appears to contain a credential and cannot be recorded.`);
    }
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@/i.test(trimmed)) {
      errors.push(`${path} must not contain a URL with embedded credentials.`);
    }
    return;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    errors.push(`${path} must be a finite JSON number.`);
    return;
  }
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    errors.push(`${path} contains a value that cannot be represented as JSON.`);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (seen.has(value)) {
    errors.push(`${path} must not contain a circular reference.`);
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        errors.push(`${path}[${index}] cannot be an empty array slot.`);
      } else {
        rejectUnsafeMetadata(value[index], `${path}[${index}]`, errors, seen);
      }
    }
    seen.delete(value);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_NAMES.has(normalizedFieldName(key))) {
      errors.push(`${path}.${key} is a credential or direct-identifier shaped field and cannot be recorded.`);
    }
    rejectUnsafeMetadata(entry, `${path}.${key}`, errors, seen);
  }
  seen.delete(value);
}

function requireString(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} is required and must be a non-empty string.`);
    return false;
  }
  return true;
}

function validateUuid(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!UUID_PATTERN.test(value)) errors.push(`${path} must be a canonical UUID.`);
}

function validateSha256(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    errors.push(`${path} must be a lowercase 64-character SHA-256 digest.`);
  }
}

function validateKebabId(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!KEBAB_ID_PATTERN.test(value)) {
    errors.push(`${path} must use lowercase kebab-case characters.`);
  }
}

function validateSemver(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!SEMVER_PATTERN.test(value)) errors.push(`${path} must be a semantic version such as 1.0.0.`);
}

function validateIsoDate(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be an ISO 8601 UTC timestamp.`);
  }
}

function validateNonnegativeInteger(value: unknown, path: string, errors: string[]): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    errors.push(`${path} must be a nonnegative integer.`);
  }
}

function validatePositiveInteger(value: unknown, path: string, errors: string[]): void {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    errors.push(`${path} must be a positive integer.`);
  }
}

function validateSafeModelId(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!SAFE_MODEL_ID_PATTERN.test(value) || value.includes('://')) {
    errors.push(`${path} must be a safe model or provider identifier of at most 200 characters.`);
  }
}

function validateCasePackageRef(value: unknown, errors: string[]): void {
  const ref = requireRecord(value, 'sessionEvent.casePackageRef', errors);
  if (!ref) return;
  rejectUnknownKeys(ref, ['id', 'schemaVersion', 'sha256'], 'sessionEvent.casePackageRef', errors);
  validateKebabId(ref.id, 'sessionEvent.casePackageRef.id', errors);
  if (ref.schemaVersion !== '1.0') {
    errors.push("sessionEvent.casePackageRef.schemaVersion must be '1.0'.");
  }
  validateSha256(ref.sha256, 'sessionEvent.casePackageRef.sha256', errors);
}

function validateLessonPlanRef(value: unknown, errors: string[]): void {
  const ref = requireRecord(value, 'sessionEvent.lessonPlanRef', errors);
  if (!ref) return;
  rejectUnknownKeys(ref, ['id', 'version', 'sha256'], 'sessionEvent.lessonPlanRef', errors);
  validateKebabId(ref.id, 'sessionEvent.lessonPlanRef.id', errors);
  validateSemver(ref.version, 'sessionEvent.lessonPlanRef.version', errors);
  validateSha256(ref.sha256, 'sessionEvent.lessonPlanRef.sha256', errors);
}

function validateAnnotation(value: unknown, errors: string[]): void {
  const annotation = requireRecord(value, 'sessionEvent.event.annotation', errors);
  if (!annotation) return;
  rejectUnknownKeys(
    annotation,
    [
      'present',
      'measurementCount',
      'segmentedFrameCount',
      'activeFrameLabelCount',
      'revision',
      'lastChangedAt',
    ],
    'sessionEvent.event.annotation',
    errors,
  );
  if (typeof annotation.present !== 'boolean') {
    errors.push('sessionEvent.event.annotation.present must be true or false.');
  }
  validateNonnegativeInteger(
    annotation.measurementCount,
    'sessionEvent.event.annotation.measurementCount',
    errors,
  );
  validateNonnegativeInteger(
    annotation.segmentedFrameCount,
    'sessionEvent.event.annotation.segmentedFrameCount',
    errors,
  );
  validateNonnegativeInteger(
    annotation.activeFrameLabelCount,
    'sessionEvent.event.annotation.activeFrameLabelCount',
    errors,
  );
  validateNonnegativeInteger(annotation.revision, 'sessionEvent.event.annotation.revision', errors);
  if (annotation.lastChangedAt !== undefined) {
    validateIsoDate(annotation.lastChangedAt, 'sessionEvent.event.annotation.lastChangedAt', errors);
  }
  if (
    annotation.present === false
    && (annotation.measurementCount !== 0
      || annotation.segmentedFrameCount !== 0
      || annotation.activeFrameLabelCount !== 0)
  ) {
    errors.push('sessionEvent.event.annotation counts must all be zero when present is false.');
  }
  if (
    annotation.present === true
    && annotation.measurementCount === 0
    && annotation.segmentedFrameCount === 0
  ) {
    errors.push(
      'sessionEvent.event.annotation.present must be false when measurementCount and segmentedFrameCount are both zero.',
    );
  }
  if (
    Number.isSafeInteger(annotation.activeFrameLabelCount)
    && (annotation.activeFrameLabelCount as number) > 0
    && annotation.segmentedFrameCount === 0
  ) {
    errors.push(
      'sessionEvent.event.annotation.segmentedFrameCount must be positive when activeFrameLabelCount is positive.',
    );
  }
}

function validateUsage(value: unknown, errors: string[]): void {
  const usage = requireRecord(value, 'sessionEvent.event.usage', errors);
  if (!usage) return;
  rejectUnknownKeys(
    usage,
    ['promptTokens', 'completionTokens', 'totalTokens'],
    'sessionEvent.event.usage',
    errors,
  );
  const suppliedKeys = ['promptTokens', 'completionTokens', 'totalTokens'].filter(
    (key) => usage[key] !== undefined,
  );
  if (suppliedKeys.length === 0) {
    errors.push('sessionEvent.event.usage must contain at least one token count.');
  }
  suppliedKeys.forEach((key) => {
    validateNonnegativeInteger(usage[key], `sessionEvent.event.usage.${key}`, errors);
  });
}

function validateTurnId(value: unknown, errors: string[]): void {
  validateUuid(value, 'sessionEvent.event.turnId', errors);
}

function validateSessionStarted(
  event: Record<string, unknown>,
  sessionId: unknown,
  errors: string[],
): void {
  rejectUnknownKeys(event, ['type', 'startReason', 'previousSessionId'], 'sessionEvent.event', errors);
  if (!['case_opened', 'case_switched', 'lesson_changed', 'user_restarted'].includes(String(event.startReason))) {
    errors.push('sessionEvent.event.startReason must be a supported start reason.');
  }
  if (event.previousSessionId !== undefined) {
    validateUuid(event.previousSessionId, 'sessionEvent.event.previousSessionId', errors);
    if (event.previousSessionId === sessionId) {
      errors.push('sessionEvent.event.previousSessionId must differ from sessionEvent.sessionId.');
    }
  }
  if (event.startReason === 'case_opened' && event.previousSessionId !== undefined) {
    errors.push('sessionEvent.event.previousSessionId must be omitted when startReason is case_opened.');
  }
  if (event.startReason !== 'case_opened' && event.previousSessionId === undefined) {
    errors.push('sessionEvent.event.previousSessionId is required for a restarted or switched session.');
  }
}

function validateSessionEnded(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(event, ['type', 'reason'], 'sessionEvent.event', errors);
  if (!['navigation', 'case_switched', 'lesson_changed', 'user_restarted', 'page_hidden'].includes(String(event.reason))) {
    errors.push('sessionEvent.event.reason must be a supported end reason.');
  }
}

function validateViewCaptureSucceeded(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(
    event,
    [
      'type',
      'turnId',
      'artifactKind',
      'seriesId',
      'frameId',
      'frameIndex',
      'frameCount',
      'assetSha256',
      'annotation',
    ],
    'sessionEvent.event',
    errors,
  );
  validateTurnId(event.turnId, errors);
  if (event.artifactKind !== 'image' && event.artifactKind !== 'image-stack') {
    errors.push("sessionEvent.event.artifactKind must be 'image' or 'image-stack'.");
  }
  validateKebabId(event.seriesId, 'sessionEvent.event.seriesId', errors);
  if (event.frameId !== undefined) validateKebabId(event.frameId, 'sessionEvent.event.frameId', errors);
  validateNonnegativeInteger(event.frameIndex, 'sessionEvent.event.frameIndex', errors);
  validatePositiveInteger(event.frameCount, 'sessionEvent.event.frameCount', errors);
  if (
    Number.isSafeInteger(event.frameIndex)
    && Number.isSafeInteger(event.frameCount)
    && (event.frameIndex as number) >= (event.frameCount as number)
  ) {
    errors.push('sessionEvent.event.frameIndex must be less than frameCount.');
  }
  if (event.artifactKind === 'image') {
    if (event.frameId !== undefined) {
      errors.push('sessionEvent.event.frameId must be omitted for a single image artifact.');
    }
    if (event.frameIndex !== 0 || event.frameCount !== 1) {
      errors.push('sessionEvent.event image artifacts must use frameIndex 0 and frameCount 1.');
    }
  }
  if (event.artifactKind === 'image-stack' && event.frameId === undefined) {
    errors.push('sessionEvent.event.frameId is required for an image-stack artifact.');
  }
  validateSha256(event.assetSha256, 'sessionEvent.event.assetSha256', errors);
  validateAnnotation(event.annotation, errors);
  const annotation = isRecord(event.annotation) ? event.annotation : null;
  if (
    annotation
    && Number.isSafeInteger(annotation.segmentedFrameCount)
    && Number.isSafeInteger(event.frameCount)
    && (annotation.segmentedFrameCount as number) > (event.frameCount as number)
  ) {
    errors.push('sessionEvent.event.annotation.segmentedFrameCount must not exceed frameCount.');
  }
}

function validateViewCaptureFailed(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(event, ['type', 'turnId', 'reason'], 'sessionEvent.event', errors);
  validateTurnId(event.turnId, errors);
  if (event.reason !== 'viewer_loading' && event.reason !== 'no_frame') {
    errors.push("sessionEvent.event.reason must be 'viewer_loading' or 'no_frame'.");
  }
}

function validateLearnerMessage(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(
    event,
    ['type', 'turnId', 'inputSource', 'learnerLevel', 'mode', 'hintId'],
    'sessionEvent.event',
    errors,
  );
  validateTurnId(event.turnId, errors);
  if (!['typed', 'lesson_hint', 'retry'].includes(String(event.inputSource))) {
    errors.push('sessionEvent.event.inputSource must be typed, lesson_hint, or retry.');
  }
  if (typeof event.learnerLevel !== 'string' || !LEARNER_LEVELS.has(event.learnerLevel as LearnerLevel)) {
    errors.push('sessionEvent.event.learnerLevel must be a supported CaseAttend learner level.');
  }
  if (typeof event.mode !== 'string' || !MODES.has(event.mode)) {
    errors.push('sessionEvent.event.mode must be chat, deep_think, or search.');
  }
  if (event.hintId !== undefined) validateKebabId(event.hintId, 'sessionEvent.event.hintId', errors);
  if (event.inputSource === 'lesson_hint' && event.hintId === undefined) {
    errors.push('sessionEvent.event.hintId is required when inputSource is lesson_hint.');
  }
  if (event.inputSource !== 'lesson_hint' && event.hintId !== undefined) {
    errors.push('sessionEvent.event.hintId must be omitted unless inputSource is lesson_hint.');
  }
}

function validateModelResponseCompleted(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(
    event,
    [
      'type',
      'turnId',
      'promptSha256',
      'gateway',
      'requestedModelId',
      'resolvedModelId',
      'upstreamProviderId',
      'latencyMs',
      'usage',
      'finishReason',
    ],
    'sessionEvent.event',
    errors,
  );
  validateTurnId(event.turnId, errors);
  validateSha256(event.promptSha256, 'sessionEvent.event.promptSha256', errors);
  if (event.gateway !== 'openrouter') errors.push("sessionEvent.event.gateway must be 'openrouter'.");
  validateSafeModelId(event.requestedModelId, 'sessionEvent.event.requestedModelId', errors);
  if (event.resolvedModelId !== undefined) {
    validateSafeModelId(event.resolvedModelId, 'sessionEvent.event.resolvedModelId', errors);
  }
  if (event.upstreamProviderId !== undefined) {
    validateSafeModelId(event.upstreamProviderId, 'sessionEvent.event.upstreamProviderId', errors);
  }
  validateNonnegativeInteger(event.latencyMs, 'sessionEvent.event.latencyMs', errors);
  if (event.usage !== undefined) validateUsage(event.usage, errors);
  if (
    event.finishReason !== undefined
    && (typeof event.finishReason !== 'string' || !FINISH_REASONS.has(event.finishReason as SessionFinishReason))
  ) {
    errors.push('sessionEvent.event.finishReason must be a supported metadata-only finish reason.');
  }
}

function validateModelResponseFailed(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(
    event,
    [
      'type',
      'turnId',
      'promptSha256',
      'gateway',
      'requestedModelId',
      'errorCode',
      'httpStatus',
      'latencyMs',
      'retryable',
    ],
    'sessionEvent.event',
    errors,
  );
  validateTurnId(event.turnId, errors);
  if (event.promptSha256 !== undefined) {
    validateSha256(event.promptSha256, 'sessionEvent.event.promptSha256', errors);
  }
  if (event.gateway !== 'openrouter') errors.push("sessionEvent.event.gateway must be 'openrouter'.");
  validateSafeModelId(event.requestedModelId, 'sessionEvent.event.requestedModelId', errors);
  if (typeof event.errorCode !== 'string' || !SAFE_CODE_PATTERN.test(event.errorCode)) {
    errors.push('sessionEvent.event.errorCode must be a lowercase metadata code of at most 64 characters.');
  }
  if (
    event.httpStatus !== undefined
    && (!Number.isSafeInteger(event.httpStatus) || (event.httpStatus as number) < 100 || (event.httpStatus as number) > 599)
  ) {
    errors.push('sessionEvent.event.httpStatus must be an integer from 100 through 599.');
  }
  validateNonnegativeInteger(event.latencyMs, 'sessionEvent.event.latencyMs', errors);
  if (typeof event.retryable !== 'boolean') {
    errors.push('sessionEvent.event.retryable must be true or false.');
  }
}

function validateTurnCancelled(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(event, ['type', 'turnId'], 'sessionEvent.event', errors);
  validateTurnId(event.turnId, errors);
}

function validateObjectiveEvidence(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(
    event,
    ['type', 'turnId', 'objectiveId', 'rubricCriterionId', 'source'],
    'sessionEvent.event',
    errors,
  );
  validateTurnId(event.turnId, errors);
  validateKebabId(event.objectiveId, 'sessionEvent.event.objectiveId', errors);
  if (event.rubricCriterionId !== undefined) {
    validateKebabId(event.rubricCriterionId, 'sessionEvent.event.rubricCriterionId', errors);
  }
  if (!['learner_turn', 'model_turn', 'educator'].includes(String(event.source))) {
    errors.push('sessionEvent.event.source must be learner_turn, model_turn, or educator.');
  }
}

function validateLessonCompleted(event: Record<string, unknown>, errors: string[]): void {
  rejectUnknownKeys(
    event,
    ['type', 'reason', 'turnsUsed', 'objectivesMet'],
    'sessionEvent.event',
    errors,
  );
  if (event.reason !== 'objectives_met' && event.reason !== 'budget_spent') {
    errors.push("sessionEvent.event.reason must be 'objectives_met' or 'budget_spent'.");
  }
  validateNonnegativeInteger(event.turnsUsed, 'sessionEvent.event.turnsUsed', errors);
  validateNonnegativeInteger(event.objectivesMet, 'sessionEvent.event.objectivesMet', errors);
}

function validateEventPayload(value: unknown, sessionId: unknown, errors: string[]): void {
  const event = requireRecord(value, 'sessionEvent.event', errors);
  if (!event) return;
  if (!requireString(event.type, 'sessionEvent.event.type', errors)) {
    rejectUnknownKeys(event, ['type'], 'sessionEvent.event', errors);
    return;
  }

  switch (event.type) {
    case 'session_started':
      validateSessionStarted(event, sessionId, errors);
      return;
    case 'session_ended':
      validateSessionEnded(event, errors);
      return;
    case 'view_capture_succeeded':
      validateViewCaptureSucceeded(event, errors);
      return;
    case 'view_capture_failed':
      validateViewCaptureFailed(event, errors);
      return;
    case 'learner_message_submitted':
      validateLearnerMessage(event, errors);
      return;
    case 'model_response_completed':
      validateModelResponseCompleted(event, errors);
      return;
    case 'model_response_failed':
      validateModelResponseFailed(event, errors);
      return;
    case 'turn_cancelled':
      validateTurnCancelled(event, errors);
      return;
    case 'objective_evidence_recorded':
      validateObjectiveEvidence(event, errors);
      return;
    case 'lesson_completed':
      validateLessonCompleted(event, errors);
      return;
    default:
      rejectUnknownKeys(event, ['type'], 'sessionEvent.event', errors);
      errors.push(`sessionEvent.event.type '${event.type}' is not supported in Session Event v1.`);
  }
}

/**
 * Validate a metadata-only research event. The schema is recursively closed:
 * unknown fields, message text, image bytes, credentials, and direct identifiers
 * are rejected instead of silently carried into an export.
 */
export function validateSessionEventV1(value: unknown): SessionEventValidationResult {
  const errors: string[] = [];
  rejectUnsafeMetadata(value, 'sessionEvent', errors, new WeakSet<object>());

  const envelope = requireRecord(value, 'sessionEvent', errors);
  if (!envelope) return { valid: false, errors };
  rejectUnknownKeys(
    envelope,
    [
      'schema',
      'schemaVersion',
      'appVersion',
      'eventId',
      'sessionId',
      'sequence',
      'occurredAt',
      'casePackageRef',
      'lessonPlanRef',
      'event',
    ],
    'sessionEvent',
    errors,
  );
  if (envelope.schema !== SESSION_EVENT_SCHEMA) {
    errors.push(`sessionEvent.schema must be '${SESSION_EVENT_SCHEMA}'.`);
  }
  if (envelope.schemaVersion !== SESSION_EVENT_SCHEMA_VERSION) {
    errors.push(`sessionEvent.schemaVersion must be '${SESSION_EVENT_SCHEMA_VERSION}'.`);
  }
  validateSemver(envelope.appVersion, 'sessionEvent.appVersion', errors);
  validateUuid(envelope.eventId, 'sessionEvent.eventId', errors);
  validateUuid(envelope.sessionId, 'sessionEvent.sessionId', errors);
  validateNonnegativeInteger(envelope.sequence, 'sessionEvent.sequence', errors);
  validateIsoDate(envelope.occurredAt, 'sessionEvent.occurredAt', errors);
  validateCasePackageRef(envelope.casePackageRef, errors);
  validateLessonPlanRef(envelope.lessonPlanRef, errors);
  validateEventPayload(envelope.event, envelope.sessionId, errors);

  return { valid: errors.length === 0, errors };
}

/** Assert and narrow an unknown value before it enters local storage or export. */
export function assertSessionEventV1(value: unknown): asserts value is SessionEventV1 {
  const result = validateSessionEventV1(value);
  if (!result.valid) {
    throw new Error(
      `Invalid Session Event v1:\n${result.errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
}
