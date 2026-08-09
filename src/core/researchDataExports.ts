import { canonicalizeJson } from './casePackage';
import type { ResearchManifestRef } from './researchManifest';
import {
  validateResearchParticipantId,
} from './researchParticipant';
import {
  RESEARCH_RECORD_SCHEMA,
  RESEARCH_RECORD_VERSION,
  RESEARCH_RUN_SCHEMA,
  RESEARCH_RUN_VERSION,
  validateResearchRecordPayloadV1,
  type ResearchRecordPayloadV1,
  type ResearchRecordV1,
  type ResearchStudyExportSnapshotV1,
} from '../services/researchStore';

export const RESEARCH_DATA_EXPORT_SCHEMA = 'caseattend.research-data-export' as const;
export const RESEARCH_DATA_EXPORT_VERSION = '1.0' as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * These flags are deliberately repeated in both formats. They describe the
 * strict, closed export vocabulary rather than attempting to infer privacy
 * from the data after it has been serialized.
 */
export const RESEARCH_DATA_EXPORT_CONTENT_POLICY = Object.freeze({
  containsRawLearnerText: false,
  containsRawModelText: false,
  containsPrompts: false,
  containsImages: false,
  containsScreenshots: false,
  containsParticipantEnteredDirectIdentifierFields: false,
  containsAuthenticationKeys: false,
});

export const RESEARCH_DATA_EXPORT_SNAPSHOT_SEMANTICS = Object.freeze({
  activeRuns: 'point-in-time-through-record-high-water' as const,
  endedRuns: 'complete-through-run-ended' as const,
});

export interface ResearchDataStudyLineV1 {
  schema: typeof RESEARCH_DATA_EXPORT_SCHEMA;
  schemaVersion: typeof RESEARCH_DATA_EXPORT_VERSION;
  rowType: 'study_ref';
  studyRef: ResearchManifestRef;
  contentPolicy: typeof RESEARCH_DATA_EXPORT_CONTENT_POLICY;
  snapshotSemantics: typeof RESEARCH_DATA_EXPORT_SNAPSHOT_SEMANTICS;
}

export interface ResearchDataRunV1 {
  schema: typeof RESEARCH_RUN_SCHEMA;
  schemaVersion: typeof RESEARCH_RUN_VERSION;
  runId: string;
  manifestRef: ResearchManifestRef;
  participantId: string;
  armId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'ended';
  snapshotState: 'active-point-in-time' | 'ended-complete';
  recordHighWaterSequence: number;
}

export interface ResearchDataRunLineV1 {
  schema: typeof RESEARCH_DATA_EXPORT_SCHEMA;
  schemaVersion: typeof RESEARCH_DATA_EXPORT_VERSION;
  rowType: 'run';
  run: ResearchDataRunV1;
}

export interface ResearchDataRecordLineV1 {
  schema: typeof RESEARCH_DATA_EXPORT_SCHEMA;
  schemaVersion: typeof RESEARCH_DATA_EXPORT_VERSION;
  rowType: 'record';
  record: ResearchRecordV1;
}

export type ResearchDataJsonlLineV1 =
  | ResearchDataStudyLineV1
  | ResearchDataRunLineV1
  | ResearchDataRecordLineV1;

export const RESEARCH_DATA_CSV_COLUMNS = [
  'export_schema',
  'export_schema_version',
  'row_type',
  'study_id',
  'study_version',
  'study_sha256',
  'contains_raw_learner_text',
  'contains_raw_model_text',
  'contains_prompts',
  'contains_images',
  'contains_screenshots',
  'contains_participant_entered_direct_identifier_fields',
  'contains_authentication_keys',
  'snapshot_semantics',
  'run_schema',
  'run_schema_version',
  'run_id',
  'participant_id',
  'arm_id',
  'started_at',
  'ended_at',
  'run_status',
  'run_snapshot_state',
  'record_high_water_sequence',
  'record_schema',
  'record_schema_version',
  'record_id',
  'sequence',
  'occurred_at',
  'event_type',
  'event_arm_id',
  'case_step_id',
  'artifact_kind',
  'frame_index',
  'frame_count',
  'submitted_view_sha256',
  'mime_type',
  'width',
  'height',
  'capture_pipeline_version',
  'annotation_present',
  'annotation_measurement_count',
  'annotation_segmented_frame_count',
  'annotation_active_frame_label_count',
  'annotation_revision',
  'input_source',
  'mode',
  'hint_id',
  'system_prompt_sha256',
  'inference_config_sha256',
  'requested_model_id',
  'resolved_model_id',
  'upstream_provider_id',
  'latency_ms',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'finish_reason',
  'error_code',
  'http_status',
  'retryable',
  'task_id',
  'score',
  'max_score',
  'duration_ms',
  'option_id',
  'objective_id',
  'rubric_criterion_id',
  'evidence_source',
  'deviation_code',
  'expected_id',
  'observed_id',
  'run_end_reason',
] as const;

export type ResearchDataCsvColumn = (typeof RESEARCH_DATA_CSV_COLUMNS)[number];
type CsvCell = string | number | boolean | undefined;
type CsvRow = Record<ResearchDataCsvColumn, CsvCell>;

export interface ResearchDataExportArtifact {
  format: 'jsonl' | 'csv';
  filename: string;
  contents: string;
  mimeType: 'application/x-ndjson' | 'text/csv;charset=utf-8';
  contentSha256: string;
  runCount: number;
  recordCount: number;
}

interface PreparedResearchExport {
  studyRef: ResearchManifestRef;
  runs: ResearchDataRunV1[];
  records: ResearchRecordV1[];
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Cannot export research data: ${label} must be a nonempty string.`);
  }
  return value;
}

function requireIsoTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))
  ) {
    throw new Error(`Cannot export research data: ${label} must be a valid UTC ISO timestamp.`);
  }
  return timestamp;
}

function cloneManifestRef(value: ResearchManifestRef, label: string): ResearchManifestRef {
  const id = requireString(value?.id, `${label}.id`);
  const version = requireString(value?.version, `${label}.version`);
  const sha256 = requireString(value?.sha256, `${label}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error(`Cannot export research data: ${label}.sha256 is not a lowercase SHA-256 digest.`);
  }
  return { id, version, sha256 };
}

function sameManifestRef(left: ResearchManifestRef, right: ResearchManifestRef): boolean {
  return left.id === right.id && left.version === right.version && left.sha256 === right.sha256;
}

function cloneEvent(event: ResearchRecordPayloadV1): ResearchRecordPayloadV1 {
  if (!validateResearchRecordPayloadV1(event)) {
    throw new Error('Cannot export research data: a record contains an unknown or raw-content field.');
  }
  switch (event.type) {
    case 'run_started':
      return { type: event.type, armId: event.armId };
    case 'case_step_opened':
      return { type: event.type, caseStepId: event.caseStepId };
    case 'capture_recorded':
      return {
        type: event.type,
        caseStepId: event.caseStepId,
        artifactKind: event.artifactKind,
        frameIndex: event.frameIndex,
        frameCount: event.frameCount,
        submittedViewSha256: event.submittedViewSha256,
        mimeType: event.mimeType,
        width: event.width,
        height: event.height,
        capturePipelineVersion: event.capturePipelineVersion,
        annotation: {
          present: event.annotation.present,
          measurementCount: event.annotation.measurementCount,
          segmentedFrameCount: event.annotation.segmentedFrameCount,
          activeFrameLabelCount: event.annotation.activeFrameLabelCount,
          revision: event.annotation.revision,
        },
      };
    case 'learner_turn_submitted':
      return {
        type: event.type,
        caseStepId: event.caseStepId,
        inputSource: event.inputSource,
        mode: event.mode,
        ...(event.hintId === undefined ? {} : { hintId: event.hintId }),
      };
    case 'model_turn_completed':
      return {
        type: event.type,
        caseStepId: event.caseStepId,
        systemPromptSha256: event.systemPromptSha256,
        inferenceConfigSha256: event.inferenceConfigSha256,
        requestedModelId: event.requestedModelId,
        ...(event.resolvedModelId === undefined ? {} : { resolvedModelId: event.resolvedModelId }),
        ...(event.upstreamProviderId === undefined ? {} : { upstreamProviderId: event.upstreamProviderId }),
        latencyMs: event.latencyMs,
        ...(event.promptTokens === undefined ? {} : { promptTokens: event.promptTokens }),
        ...(event.completionTokens === undefined ? {} : { completionTokens: event.completionTokens }),
        ...(event.totalTokens === undefined ? {} : { totalTokens: event.totalTokens }),
        ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
      };
    case 'model_turn_failed':
      return {
        type: event.type,
        caseStepId: event.caseStepId,
        ...(event.systemPromptSha256 === undefined ? {} : { systemPromptSha256: event.systemPromptSha256 }),
        inferenceConfigSha256: event.inferenceConfigSha256,
        requestedModelId: event.requestedModelId,
        errorCode: event.errorCode,
        ...(event.httpStatus === undefined ? {} : { httpStatus: event.httpStatus }),
        latencyMs: event.latencyMs,
        retryable: event.retryable,
      };
    case 'task_scored':
      return {
        type: event.type,
        taskId: event.taskId,
        score: event.score,
        maxScore: event.maxScore,
        ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
      };
    case 'task_choice_recorded':
      return { type: event.type, taskId: event.taskId, optionId: event.optionId };
    case 'objective_evidence_recorded':
      return {
        type: event.type,
        objectiveId: event.objectiveId,
        ...(event.rubricCriterionId === undefined ? {} : { rubricCriterionId: event.rubricCriterionId }),
        source: event.source,
      };
    case 'protocol_deviation':
      return {
        type: event.type,
        caseStepId: event.caseStepId,
        code: event.code,
        ...(event.expectedId === undefined ? {} : { expectedId: event.expectedId }),
        ...(event.observedId === undefined ? {} : { observedId: event.observedId }),
      };
    case 'run_ended':
      return { type: event.type, reason: event.reason };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function prepareResearchExport(snapshot: ResearchStudyExportSnapshotV1): PreparedResearchExport {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Cannot export research data: a browser-local study snapshot is required.');
  }
  // Intentionally do not read snapshot.bundle. Case Packages, Lesson Plans,
  // source/provenance fields, prompts, and binary assets are outside this
  // export's closed study-ref/run/record vocabulary.
  const studyRef = cloneManifestRef({
    id: snapshot.study?.id,
    version: snapshot.study?.version,
    sha256: snapshot.study?.manifestSha256,
  }, 'studyRef');

  const runIds = new Set<string>();
  const runs = snapshot.runs.map((source, index): ResearchDataRunV1 => {
    if (source.schema !== RESEARCH_RUN_SCHEMA || source.schemaVersion !== RESEARCH_RUN_VERSION) {
      throw new Error(`Cannot export research data: run ${index} has an unsupported schema.`);
    }
    if (!UUID_PATTERN.test(source.runId) || runIds.has(source.runId)) {
      throw new Error(`Cannot export research data: run ${index} has an invalid or duplicate run ID.`);
    }
    if (!validateResearchParticipantId(source.participantId)) {
      throw new Error(`Cannot export research data: run ${index} has an invalid pseudonymous participant ID.`);
    }
    const manifestRef = cloneManifestRef(source.manifestRef, `runs[${index}].manifestRef`);
    if (!sameManifestRef(studyRef, manifestRef)) {
      throw new Error(`Cannot export research data: run ${source.runId} belongs to a different study.`);
    }
    if (source.status !== 'active' && source.status !== 'ended') {
      throw new Error(`Cannot export research data: run ${source.runId} has an invalid status.`);
    }
    if (!Number.isSafeInteger(source.nextSequence) || source.nextSequence < 1) {
      throw new Error(`Cannot export research data: run ${source.runId} has an invalid record high-water mark.`);
    }
    const startedAt = requireIsoTimestamp(source.startedAt, `runs[${index}].startedAt`);
    const endedAt = source.endedAt === undefined
      ? undefined
      : requireIsoTimestamp(source.endedAt, `runs[${index}].endedAt`);
    if (source.status === 'active' && endedAt !== undefined) {
      throw new Error(`Cannot export research data: active run ${source.runId} has an end time.`);
    }
    if (source.status === 'ended' && endedAt === undefined) {
      throw new Error(`Cannot export research data: ended run ${source.runId} has no end time.`);
    }
    if (endedAt !== undefined && Date.parse(endedAt) < Date.parse(startedAt)) {
      throw new Error(`Cannot export research data: run ${source.runId} ends before it starts.`);
    }
    runIds.add(source.runId);
    return {
      schema: RESEARCH_RUN_SCHEMA,
      schemaVersion: RESEARCH_RUN_VERSION,
      runId: source.runId,
      manifestRef,
      participantId: source.participantId,
      armId: requireString(source.armId, `runs[${index}].armId`),
      startedAt,
      ...(endedAt === undefined ? {} : { endedAt }),
      status: source.status,
      snapshotState: source.status === 'active' ? 'active-point-in-time' : 'ended-complete',
      recordHighWaterSequence: source.nextSequence - 1,
    };
  }).sort((left, right) => left.runId.localeCompare(right.runId));

  const runsById = new Map(runs.map((run) => [run.runId, run] as const));
  const recordIds = new Set<string>();
  const sequenceKeys = new Set<string>();
  const records = snapshot.records.map((source, index): ResearchRecordV1 => {
    if (source.schema !== RESEARCH_RECORD_SCHEMA || source.schemaVersion !== RESEARCH_RECORD_VERSION) {
      throw new Error(`Cannot export research data: record ${index} has an unsupported schema.`);
    }
    if (!UUID_PATTERN.test(source.recordId) || recordIds.has(source.recordId)) {
      throw new Error(`Cannot export research data: record ${index} has an invalid or duplicate record ID.`);
    }
    const run = runsById.get(source.runId);
    if (!run) {
      throw new Error(`Cannot export research data: record ${source.recordId} has no matching run.`);
    }
    const manifestRef = cloneManifestRef(source.manifestRef, `records[${index}].manifestRef`);
    if (!sameManifestRef(studyRef, manifestRef)) {
      throw new Error(`Cannot export research data: record ${source.recordId} belongs to a different study.`);
    }
    if (source.participantId !== run.participantId) {
      throw new Error(`Cannot export research data: record ${source.recordId} has a mismatched participant.`);
    }
    if (!Number.isSafeInteger(source.sequence) || source.sequence < 0) {
      throw new Error(`Cannot export research data: record ${source.recordId} has an invalid sequence.`);
    }
    const sequenceKey = `${source.runId}:${source.sequence}`;
    if (sequenceKeys.has(sequenceKey)) {
      throw new Error(`Cannot export research data: run ${source.runId} has a duplicate sequence.`);
    }
    recordIds.add(source.recordId);
    sequenceKeys.add(sequenceKey);
    return {
      schema: RESEARCH_RECORD_SCHEMA,
      schemaVersion: RESEARCH_RECORD_VERSION,
      recordId: source.recordId,
      runId: source.runId,
      manifestRef,
      participantId: source.participantId,
      sequence: source.sequence,
      occurredAt: requireIsoTimestamp(source.occurredAt, `records[${index}].occurredAt`),
      event: cloneEvent(source.event),
    };
  }).sort((left, right) => left.runId.localeCompare(right.runId)
    || left.sequence - right.sequence
    || left.recordId.localeCompare(right.recordId));

  const recordsByRun = new Map<string, ResearchRecordV1[]>();
  for (const record of records) {
    const group = recordsByRun.get(record.runId) ?? [];
    group.push(record);
    recordsByRun.set(record.runId, group);
  }
  for (const run of runs) {
    const runRecords = recordsByRun.get(run.runId) ?? [];
    if (runRecords.length === 0 || runRecords[0].sequence !== 0) {
      throw new Error(`Cannot export research data: run ${run.runId} has no sequence-zero start record.`);
    }
    for (let index = 0; index < runRecords.length; index += 1) {
      const current = runRecords[index];
      if (current.sequence !== index) {
        throw new Error(`Cannot export research data: run ${run.runId} has a sequence gap before ${current.sequence}.`);
      }
      if (Date.parse(current.occurredAt) < Date.parse(run.startedAt)) {
        throw new Error(`Cannot export research data: run ${run.runId} has a record before its start time.`);
      }
      if (index > 0 && Date.parse(current.occurredAt) < Date.parse(runRecords[index - 1].occurredAt)) {
        throw new Error(`Cannot export research data: run ${run.runId} has non-monotonic record times.`);
      }
    }
    const firstEvent = runRecords[0].event;
    if (firstEvent.type !== 'run_started' || firstEvent.armId !== run.armId) {
      throw new Error(`Cannot export research data: run ${run.runId} has an inconsistent start record.`);
    }
    const last = runRecords.at(-1)!;
    if (last.sequence !== run.recordHighWaterSequence) {
      throw new Error(`Cannot export research data: run ${run.runId} does not reach its declared record high-water mark.`);
    }
    if (run.status === 'active') {
      if (runRecords.some((candidate) => candidate.event.type === 'run_ended')) {
        throw new Error(`Cannot export research data: active run ${run.runId} contains an end record.`);
      }
    } else if (
      last.event.type !== 'run_ended'
      || Date.parse(last.occurredAt) !== Date.parse(run.endedAt!)
    ) {
      throw new Error(`Cannot export research data: ended run ${run.runId} is not complete through its end record.`);
    }
  }

  return { studyRef, runs, records };
}

function jsonlLines(prepared: PreparedResearchExport): ResearchDataJsonlLineV1[] {
  return [
    {
      schema: RESEARCH_DATA_EXPORT_SCHEMA,
      schemaVersion: RESEARCH_DATA_EXPORT_VERSION,
      rowType: 'study_ref',
      studyRef: prepared.studyRef,
      contentPolicy: RESEARCH_DATA_EXPORT_CONTENT_POLICY,
      snapshotSemantics: RESEARCH_DATA_EXPORT_SNAPSHOT_SEMANTICS,
    },
    ...prepared.runs.map((run): ResearchDataRunLineV1 => ({
      schema: RESEARCH_DATA_EXPORT_SCHEMA,
      schemaVersion: RESEARCH_DATA_EXPORT_VERSION,
      rowType: 'run',
      run,
    })),
    ...prepared.records.map((record): ResearchDataRecordLineV1 => ({
      schema: RESEARCH_DATA_EXPORT_SCHEMA,
      schemaVersion: RESEARCH_DATA_EXPORT_VERSION,
      rowType: 'record',
      record,
    })),
  ];
}

/** Export canonical JSON Lines: study reference, sorted runs, then sorted records. */
export function exportResearchDataJsonl(snapshot: ResearchStudyExportSnapshotV1): string {
  const prepared = prepareResearchExport(snapshot);
  return `${jsonlLines(prepared).map((line) => canonicalizeJson(line)).join('\n')}\n`;
}

function emptyCsvRow(studyRef: ResearchManifestRef, rowType: 'study_ref' | 'run' | 'record'): CsvRow {
  return {
    export_schema: RESEARCH_DATA_EXPORT_SCHEMA,
    export_schema_version: RESEARCH_DATA_EXPORT_VERSION,
    row_type: rowType,
    study_id: studyRef.id,
    study_version: studyRef.version,
    study_sha256: studyRef.sha256,
    contains_raw_learner_text: false,
    contains_raw_model_text: false,
    contains_prompts: false,
    contains_images: false,
    contains_screenshots: false,
    contains_participant_entered_direct_identifier_fields: false,
    contains_authentication_keys: false,
    snapshot_semantics: 'active-through-record-high-water;ended-through-run-ended',
    run_schema: undefined,
    run_schema_version: undefined,
    run_id: undefined,
    participant_id: undefined,
    arm_id: undefined,
    started_at: undefined,
    ended_at: undefined,
    run_status: undefined,
    run_snapshot_state: undefined,
    record_high_water_sequence: undefined,
    record_schema: undefined,
    record_schema_version: undefined,
    record_id: undefined,
    sequence: undefined,
    occurred_at: undefined,
    event_type: undefined,
    event_arm_id: undefined,
    case_step_id: undefined,
    artifact_kind: undefined,
    frame_index: undefined,
    frame_count: undefined,
    submitted_view_sha256: undefined,
    mime_type: undefined,
    width: undefined,
    height: undefined,
    capture_pipeline_version: undefined,
    annotation_present: undefined,
    annotation_measurement_count: undefined,
    annotation_segmented_frame_count: undefined,
    annotation_active_frame_label_count: undefined,
    annotation_revision: undefined,
    input_source: undefined,
    mode: undefined,
    hint_id: undefined,
    system_prompt_sha256: undefined,
    inference_config_sha256: undefined,
    requested_model_id: undefined,
    resolved_model_id: undefined,
    upstream_provider_id: undefined,
    latency_ms: undefined,
    prompt_tokens: undefined,
    completion_tokens: undefined,
    total_tokens: undefined,
    finish_reason: undefined,
    error_code: undefined,
    http_status: undefined,
    retryable: undefined,
    task_id: undefined,
    score: undefined,
    max_score: undefined,
    duration_ms: undefined,
    option_id: undefined,
    objective_id: undefined,
    rubric_criterion_id: undefined,
    evidence_source: undefined,
    deviation_code: undefined,
    expected_id: undefined,
    observed_id: undefined,
    run_end_reason: undefined,
  };
}

function runCells(run: ResearchDataRunV1): Partial<CsvRow> {
  return {
    run_schema: run.schema,
    run_schema_version: run.schemaVersion,
    run_id: run.runId,
    participant_id: run.participantId,
    arm_id: run.armId,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    run_status: run.status,
    run_snapshot_state: run.snapshotState,
    record_high_water_sequence: run.recordHighWaterSequence,
  };
}

function eventCells(event: ResearchRecordPayloadV1): Partial<CsvRow> {
  switch (event.type) {
    case 'run_started':
      return { event_arm_id: event.armId };
    case 'case_step_opened':
      return { case_step_id: event.caseStepId };
    case 'capture_recorded':
      return {
        case_step_id: event.caseStepId,
        artifact_kind: event.artifactKind,
        frame_index: event.frameIndex,
        frame_count: event.frameCount,
        submitted_view_sha256: event.submittedViewSha256,
        mime_type: event.mimeType,
        width: event.width,
        height: event.height,
        capture_pipeline_version: event.capturePipelineVersion,
        annotation_present: event.annotation.present,
        annotation_measurement_count: event.annotation.measurementCount,
        annotation_segmented_frame_count: event.annotation.segmentedFrameCount,
        annotation_active_frame_label_count: event.annotation.activeFrameLabelCount,
        annotation_revision: event.annotation.revision,
      };
    case 'learner_turn_submitted':
      return {
        case_step_id: event.caseStepId,
        input_source: event.inputSource,
        mode: event.mode,
        hint_id: event.hintId,
      };
    case 'model_turn_completed':
      return {
        case_step_id: event.caseStepId,
        system_prompt_sha256: event.systemPromptSha256,
        inference_config_sha256: event.inferenceConfigSha256,
        requested_model_id: event.requestedModelId,
        resolved_model_id: event.resolvedModelId,
        upstream_provider_id: event.upstreamProviderId,
        latency_ms: event.latencyMs,
        prompt_tokens: event.promptTokens,
        completion_tokens: event.completionTokens,
        total_tokens: event.totalTokens,
        finish_reason: event.finishReason,
      };
    case 'model_turn_failed':
      return {
        case_step_id: event.caseStepId,
        system_prompt_sha256: event.systemPromptSha256,
        inference_config_sha256: event.inferenceConfigSha256,
        requested_model_id: event.requestedModelId,
        latency_ms: event.latencyMs,
        error_code: event.errorCode,
        http_status: event.httpStatus,
        retryable: event.retryable,
      };
    case 'task_scored':
      return {
        task_id: event.taskId,
        score: event.score,
        max_score: event.maxScore,
        duration_ms: event.durationMs,
      };
    case 'task_choice_recorded':
      return { task_id: event.taskId, option_id: event.optionId };
    case 'objective_evidence_recorded':
      return {
        objective_id: event.objectiveId,
        rubric_criterion_id: event.rubricCriterionId,
        evidence_source: event.source,
      };
    case 'protocol_deviation':
      return {
        case_step_id: event.caseStepId,
        deviation_code: event.code,
        expected_id: event.expectedId,
        observed_id: event.observedId,
      };
    case 'run_ended':
      return { run_end_reason: event.reason };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * Encode a fixed CSV cell and neutralize spreadsheet formula prefixes. Text
 * values remain quoted so an injected separator can never create a new cell.
 */
export function encodeResearchDataCsvCell(value: CsvCell): string {
  if (value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const protectedText = /^[\t\r]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

/** Export fixed-column RFC 4180 CSV rows: study reference, runs, then records. */
export function exportResearchDataCsv(snapshot: ResearchStudyExportSnapshotV1): string {
  const prepared = prepareResearchExport(snapshot);
  const rows: CsvRow[] = [emptyCsvRow(prepared.studyRef, 'study_ref')];
  for (const run of prepared.runs) {
    rows.push({ ...emptyCsvRow(prepared.studyRef, 'run'), ...runCells(run) });
  }
  const runsById = new Map(prepared.runs.map((run) => [run.runId, run] as const));
  for (const record of prepared.records) {
    const run = runsById.get(record.runId)!;
    rows.push({
      ...emptyCsvRow(prepared.studyRef, 'record'),
      ...runCells(run),
      record_schema: record.schema,
      record_schema_version: record.schemaVersion,
      record_id: record.recordId,
      sequence: record.sequence,
      occurred_at: record.occurredAt,
      event_type: record.event.type,
      ...eventCells(record.event),
    });
  }
  return [
    RESEARCH_DATA_CSV_COLUMNS.join(','),
    ...rows.map((row) => RESEARCH_DATA_CSV_COLUMNS
      .map((column) => encodeResearchDataCsvCell(row[column]))
      .join(',')),
  ].join('\r\n') + '\r\n';
}

async function sha256Text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is required to create a content-derived research export filename.');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Build a deterministic manual-download artifact with no clock-derived metadata. */
export async function createResearchDataExport(
  snapshot: ResearchStudyExportSnapshotV1,
  format: 'jsonl' | 'csv',
): Promise<ResearchDataExportArtifact> {
  const prepared = prepareResearchExport(snapshot);
  const contents = format === 'jsonl'
    ? exportResearchDataJsonl(snapshot)
    : exportResearchDataCsv(snapshot);
  const contentSha256 = await sha256Text(contents);
  const filename = `caseattend-research-${prepared.studyRef.sha256.slice(0, 12)}-${contentSha256.slice(0, 16)}.${format}`;
  return {
    format,
    filename,
    contents,
    mimeType: format === 'jsonl' ? 'application/x-ndjson' : 'text/csv;charset=utf-8',
    contentSha256,
    runCount: prepared.runs.length,
    recordCount: prepared.records.length,
  };
}
