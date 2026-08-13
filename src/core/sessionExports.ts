import { canonicalizeJson } from './casePackage';
import {
  assertSessionEventV1,
  type SessionEventPayloadV1,
  type SessionEventV1,
} from './sessionEvents';

export const SESSION_EVENT_CSV_COLUMNS = [
  'schema',
  'schema_version',
  'app_version',
  'event_id',
  'session_id',
  'sequence',
  'occurred_at',
  'case_package_id',
  'case_package_schema_version',
  'case_package_sha256',
  'lesson_plan_id',
  'lesson_plan_version',
  'lesson_plan_sha256',
  'event_type',
  'session_start_reason',
  'previous_session_id',
  'session_end_reason',
  'turn_id',
  'view_capture_failure_reason',
  'artifact_kind',
  'series_id',
  'frame_id',
  'frame_index',
  'frame_count',
  'asset_sha256',
  'annotation_present',
  'annotation_measurement_count',
  'annotation_segmented_frame_count',
  'annotation_active_frame_label_count',
  'annotation_revision',
  'annotation_last_changed_at',
  'input_source',
  'learner_level',
  'mode',
  'hint_id',
  'prompt_sha256',
  'gateway',
  'requested_model_id',
  'resolved_model_id',
  'upstream_provider_id',
  'latency_ms',
  'usage_prompt_tokens',
  'usage_completion_tokens',
  'usage_total_tokens',
  'finish_reason',
  'error_code',
  'http_status',
  'retryable',
  'objective_id',
  'rubric_criterion_id',
  'evidence_source',
  'lesson_completion_reason',
  'lesson_turns_used',
  'lesson_objectives_met',
] as const;

export type SessionEventCsvColumn = (typeof SESSION_EVENT_CSV_COLUMNS)[number];
type CsvCell = string | number | boolean | undefined;
type CsvRow = Record<SessionEventCsvColumn, CsvCell>;

function validatedSortedCopy(events: readonly SessionEventV1[]): SessionEventV1[] {
  events.forEach((event, index) => {
    try {
      assertSessionEventV1(event);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot export Session Event at index ${index}:\n${detail}`);
    }
  });

  const eventIds = new Set<string>();
  const sequenceKeys = new Set<string>();
  events.forEach((event) => {
    if (eventIds.has(event.eventId)) {
      throw new Error(`Cannot export duplicate eventId '${event.eventId}'.`);
    }
    eventIds.add(event.eventId);
    const sequenceKey = `${event.sessionId}:${event.sequence}`;
    if (sequenceKeys.has(sequenceKey)) {
      throw new Error(
        `Cannot export duplicate sequence ${event.sequence} for session '${event.sessionId}'.`,
      );
    }
    sequenceKeys.add(sequenceKey);
  });

  return [...events].sort((left, right) => {
    const sessionOrder = left.sessionId < right.sessionId
      ? -1
      : left.sessionId > right.sessionId
        ? 1
        : 0;
    if (sessionOrder !== 0) return sessionOrder;
    const sequenceOrder = left.sequence - right.sequence;
    if (sequenceOrder !== 0) return sequenceOrder;
    return left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0;
  });
}

/** Validate and sort without mutating the caller's event array. */
export function sortSessionEventsV1(events: readonly SessionEventV1[]): SessionEventV1[] {
  return validatedSortedCopy(events);
}

/**
 * Export canonical JSON Lines in session and sequence order. Object keys are
 * sorted, optional keys remain omitted, and a nonempty file ends in a newline.
 */
export function exportSessionEventsJsonl(events: readonly SessionEventV1[]): string {
  const sorted = validatedSortedCopy(events);
  if (sorted.length === 0) return '';
  return `${sorted.map((event) => canonicalizeJson(event)).join('\n')}\n`;
}

function blankRow(event: SessionEventV1): CsvRow {
  return {
    schema: event.schema,
    schema_version: event.schemaVersion,
    app_version: event.appVersion,
    event_id: event.eventId,
    session_id: event.sessionId,
    sequence: event.sequence,
    occurred_at: event.occurredAt,
    case_package_id: event.casePackageRef.id,
    case_package_schema_version: event.casePackageRef.schemaVersion,
    case_package_sha256: event.casePackageRef.sha256,
    lesson_plan_id: event.lessonPlanRef.id,
    lesson_plan_version: event.lessonPlanRef.version,
    lesson_plan_sha256: event.lessonPlanRef.sha256,
    event_type: event.event.type,
    session_start_reason: undefined,
    previous_session_id: undefined,
    session_end_reason: undefined,
    turn_id: undefined,
    view_capture_failure_reason: undefined,
    artifact_kind: undefined,
    series_id: undefined,
    frame_id: undefined,
    frame_index: undefined,
    frame_count: undefined,
    asset_sha256: undefined,
    annotation_present: undefined,
    annotation_measurement_count: undefined,
    annotation_segmented_frame_count: undefined,
    annotation_active_frame_label_count: undefined,
    annotation_revision: undefined,
    annotation_last_changed_at: undefined,
    input_source: undefined,
    learner_level: undefined,
    mode: undefined,
    hint_id: undefined,
    prompt_sha256: undefined,
    gateway: undefined,
    requested_model_id: undefined,
    resolved_model_id: undefined,
    upstream_provider_id: undefined,
    latency_ms: undefined,
    usage_prompt_tokens: undefined,
    usage_completion_tokens: undefined,
    usage_total_tokens: undefined,
    finish_reason: undefined,
    error_code: undefined,
    http_status: undefined,
    retryable: undefined,
    objective_id: undefined,
    rubric_criterion_id: undefined,
    evidence_source: undefined,
    lesson_completion_reason: undefined,
    lesson_turns_used: undefined,
    lesson_objectives_met: undefined,
  };
}

function eventCells(event: SessionEventPayloadV1): Partial<CsvRow> {
  switch (event.type) {
    case 'session_started':
      return {
        session_start_reason: event.startReason,
        previous_session_id: event.previousSessionId,
      };
    case 'session_ended':
      return { session_end_reason: event.reason };
    case 'view_capture_succeeded':
      return {
        turn_id: event.turnId,
        artifact_kind: event.artifactKind,
        series_id: event.seriesId,
        frame_id: event.frameId,
        frame_index: event.frameIndex,
        frame_count: event.frameCount,
        asset_sha256: event.assetSha256,
        annotation_present: event.annotation.present,
        annotation_measurement_count: event.annotation.measurementCount,
        annotation_segmented_frame_count: event.annotation.segmentedFrameCount,
        annotation_active_frame_label_count: event.annotation.activeFrameLabelCount,
        annotation_revision: event.annotation.revision,
        annotation_last_changed_at: event.annotation.lastChangedAt,
      };
    case 'view_capture_failed':
      return {
        turn_id: event.turnId,
        view_capture_failure_reason: event.reason,
      };
    case 'learner_message_submitted':
      return {
        turn_id: event.turnId,
        input_source: event.inputSource,
        learner_level: event.learnerLevel,
        mode: event.mode,
        hint_id: event.hintId,
      };
    case 'model_response_completed':
      return {
        turn_id: event.turnId,
        prompt_sha256: event.promptSha256,
        gateway: event.gateway,
        requested_model_id: event.requestedModelId,
        resolved_model_id: event.resolvedModelId,
        upstream_provider_id: event.upstreamProviderId,
        latency_ms: event.latencyMs,
        usage_prompt_tokens: event.usage?.promptTokens,
        usage_completion_tokens: event.usage?.completionTokens,
        usage_total_tokens: event.usage?.totalTokens,
        finish_reason: event.finishReason,
      };
    case 'model_response_failed':
      return {
        turn_id: event.turnId,
        prompt_sha256: event.promptSha256,
        gateway: event.gateway,
        requested_model_id: event.requestedModelId,
        latency_ms: event.latencyMs,
        error_code: event.errorCode,
        http_status: event.httpStatus,
        retryable: event.retryable,
      };
    case 'turn_cancelled':
      return { turn_id: event.turnId };
    case 'objective_evidence_recorded':
      return {
        turn_id: event.turnId,
        objective_id: event.objectiveId,
        rubric_criterion_id: event.rubricCriterionId,
        evidence_source: event.source,
      };
    case 'lesson_completed':
      return {
        lesson_completion_reason: event.reason,
        lesson_turns_used: event.turnsUsed,
        lesson_objectives_met: event.objectivesMet,
      };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function encodeCsvCell(value: CsvCell): string {
  if (value === undefined) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Export one fixed-column RFC 4180 row per event, ordered by session and sequence. */
export function exportSessionEventsCsv(events: readonly SessionEventV1[]): string {
  const sorted = validatedSortedCopy(events);
  if (sorted.length === 0) return '';
  const rows = sorted.map((event) => ({ ...blankRow(event), ...eventCells(event.event) }));
  return [
    SESSION_EVENT_CSV_COLUMNS.join(','),
    ...rows.map((row) => SESSION_EVENT_CSV_COLUMNS.map((column) => encodeCsvCell(row[column])).join(',')),
  ].join('\r\n') + '\r\n';
}
