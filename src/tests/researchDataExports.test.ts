// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  RESEARCH_DATA_CSV_COLUMNS,
  RESEARCH_DATA_EXPORT_CONTENT_POLICY,
  createResearchDataExport,
  encodeResearchDataCsvCell,
  exportResearchDataCsv,
  exportResearchDataJsonl,
} from '../core/researchDataExports';
import type {
  ResearchRecordV1,
  ResearchRunV1,
  ResearchStudyExportSnapshotV1,
} from '../services/researchStore';

const STUDY_SHA = '1'.repeat(64);
const PARTICIPANT_A = 'a'.repeat(64);
const PARTICIPANT_B = 'b'.repeat(64);
const RUN_A = '10000000-0000-4000-8000-000000000001';
const RUN_B = '10000000-0000-4000-8000-000000000002';
const RECORD_A = '20000000-0000-4000-8000-000000000001';
const RECORD_B = '20000000-0000-4000-8000-000000000002';
const RECORD_C = '20000000-0000-4000-8000-000000000003';
const RECORD_D = '20000000-0000-4000-8000-000000000004';

const SENTINELS = {
  learnerChat: 'SENTINEL_RAW_LEARNER_CHAT_DO_NOT_EXPORT',
  modelChat: 'SENTINEL_RAW_MODEL_CHAT_DO_NOT_EXPORT',
  prompt: 'SENTINEL_LESSON_PROMPT_DO_NOT_EXPORT',
  image: 'data:image/jpeg;base64,SENTINEL_IMAGE_BYTES_DO_NOT_EXPORT',
  key: 'sk-or-v1-SENTINEL_KEY_DO_NOT_EXPORT',
  participantCode: 'SENTINEL_PARTICIPANT_CODE_DO_NOT_EXPORT',
  provenance: 'SENTINEL_SOURCE_PROVENANCE_DO_NOT_EXPORT',
};

function manifestRef() {
  return { id: 'study-1', version: '1.0.0', sha256: STUDY_SHA };
}

function run(overrides: Partial<ResearchRunV1> = {}): ResearchRunV1 {
  return {
    schema: 'caseattend.research-run',
    schemaVersion: '1.0',
    runId: RUN_A,
    manifestRef: manifestRef(),
    participantId: PARTICIPANT_A,
    armId: 'arm-1',
    startedAt: '2026-08-09T12:00:00.000Z',
    endedAt: '2026-08-09T12:10:00.000Z',
    status: 'ended',
    nextSequence: 3,
    ...overrides,
  };
}

function record(overrides: Partial<ResearchRecordV1> = {}): ResearchRecordV1 {
  return {
    schema: 'caseattend.research-record',
    schemaVersion: '1.0',
    recordId: RECORD_A,
    runId: RUN_A,
    manifestRef: manifestRef(),
    participantId: PARTICIPANT_A,
    sequence: 0,
    occurredAt: '2026-08-09T12:00:00.000Z',
    event: { type: 'run_started', armId: 'arm-1' },
    ...overrides,
  };
}

function snapshot(options: {
  reverse?: boolean;
  formulaStudyId?: boolean;
} = {}): ResearchStudyExportSnapshotV1 {
  const id = options.formulaStudyId ? '=HYPERLINK("https://bad.example")' : 'study-1';
  const ref = { ...manifestRef(), id };
  const runs = [
    run({ manifestRef: ref }),
    run({
      runId: RUN_B,
      manifestRef: ref,
      participantId: PARTICIPANT_B,
      armId: 'arm-2',
      startedAt: '2026-08-09T13:00:00.000Z',
      endedAt: undefined,
      status: 'active',
      nextSequence: 1,
    }),
  ];
  const records = [
    record({ manifestRef: ref }),
    record({
      recordId: RECORD_B,
      manifestRef: ref,
      sequence: 1,
      occurredAt: '2026-08-09T12:00:02.000Z',
      event: {
        type: 'learner_turn_submitted',
        caseStepId: 'step-1',
        inputSource: 'typed',
        mode: 'chat',
      },
    }),
    record({
      recordId: RECORD_C,
      runId: RUN_B,
      manifestRef: ref,
      participantId: PARTICIPANT_B,
      sequence: 0,
      occurredAt: '2026-08-09T13:00:00.000Z',
      event: { type: 'run_started', armId: 'arm-2' },
    }),
    record({
      recordId: RECORD_D,
      manifestRef: ref,
      sequence: 2,
      occurredAt: '2026-08-09T12:10:00.000Z',
      event: { type: 'run_ended', reason: 'completed' },
    }),
  ];
  if (options.reverse) {
    runs.reverse();
    records.reverse();
  }
  return {
    bundle: {
      rawLearnerText: SENTINELS.learnerChat,
      rawModelText: SENTINELS.modelChat,
      portableCases: [{
        casePackage: {
          source: { notes: SENTINELS.provenance },
          participantCode: SENTINELS.participantCode,
        },
        lessonPlan: { providerPrompt: SENTINELS.prompt },
        assets: { 'case://image': SENTINELS.image },
      }],
      apiKey: SENTINELS.key,
    } as never,
    study: {
      id,
      version: '1.0.0',
      manifestSha256: STUDY_SHA,
      caseCount: 1,
      retentionExpiresAt: '2027-01-01T00:00:00.000Z',
      createdAt: '2026-08-09T11:00:00.000Z',
      title: SENTINELS.prompt,
    } as never,
    runs: runs.map((value) => ({
      ...value,
      participantCode: SENTINELS.participantCode,
    })) as never,
    records: records.map((value) => ({
      ...value,
      rawModelText: SENTINELS.modelChat,
    })) as never,
  };
}

describe('restricted research data exports', () => {
  it('serializes only a study reference, pseudonymous runs, and closed records', () => {
    const contents = exportResearchDataJsonl(snapshot());
    const lines = contents.trimEnd().split('\n').map((line) => JSON.parse(line));

    expect(lines.map((line) => line.rowType)).toEqual([
      'study_ref', 'run', 'run', 'record', 'record', 'record', 'record',
    ]);
    expect(lines[0].contentPolicy).toEqual(RESEARCH_DATA_EXPORT_CONTENT_POLICY);
    expect(lines[0].contentPolicy).toHaveProperty(
      'containsParticipantEnteredDirectIdentifierFields',
      false,
    );
    expect(lines[0].contentPolicy).not.toHaveProperty('containsDirectIdentifiers');
    expect(lines.slice(1, 3).map((line) => line.run.runId)).toEqual([RUN_A, RUN_B]);
    expect(lines[1].run).toMatchObject({
      snapshotState: 'ended-complete',
      recordHighWaterSequence: 2,
    });
    expect(lines[2].run).toMatchObject({
      snapshotState: 'active-point-in-time',
      recordHighWaterSequence: 0,
    });
    expect(lines.slice(3).map((line) => [line.record.runId, line.record.sequence])).toEqual([
      [RUN_A, 0],
      [RUN_A, 1],
      [RUN_A, 2],
      [RUN_B, 0],
    ]);
    expect(lines[1].run).not.toHaveProperty('nextSequence');
    expect(lines[1].run).not.toHaveProperty('participantCode');
    expect(lines[3].record).not.toHaveProperty('rawModelText');
    for (const sentinel of Object.values(SENTINELS)) {
      expect(contents).not.toContain(sentinel);
    }
    expect(contents).not.toMatch(/portableCases|casePackage|lessonPlan|provenance|sourceText/i);
  });

  it('is byte-deterministic across input ordering and uses only content-derived filenames', async () => {
    const first = await createResearchDataExport(snapshot(), 'jsonl');
    const reordered = await createResearchDataExport(snapshot({ reverse: true }), 'jsonl');
    const csv = await createResearchDataExport(snapshot(), 'csv');

    expect(first.contents).toBe(reordered.contents);
    expect(first.contentSha256).toBe(reordered.contentSha256);
    expect(first.filename).toBe(reordered.filename);
    expect(first.filename).toMatch(/^caseattend-research-[a-f0-9]{12}-[a-f0-9]{16}\.jsonl$/);
    expect(first.filename).not.toMatch(/2026|\d{4}-\d{2}-\d{2}/);
    expect(csv.filename).toMatch(/^caseattend-research-[a-f0-9]{12}-[a-f0-9]{16}\.csv$/);
    expect(csv.contents).toBe(exportResearchDataCsv(snapshot()));
  });

  it('uses fixed CSV columns, repeats explicit false flags, and neutralizes formulas', () => {
    const contents = exportResearchDataCsv(snapshot({ formulaStudyId: true }));
    const lines = contents.trimEnd().split('\r\n');

    expect(lines[0]).toBe(RESEARCH_DATA_CSV_COLUMNS.join(','));
    expect(lines[0]).toContain('contains_participant_entered_direct_identifier_fields');
    expect(lines[0]).not.toContain('contains_direct_identifiers');
    expect(lines).toHaveLength(8);
    expect(contents).toContain('"\'=HYPERLINK(""https://bad.example"")"');
    expect(encodeResearchDataCsvCell('=2+2')).toBe('"\'=2+2"');
    expect(encodeResearchDataCsvCell('  -2+3')).toBe('"\'  -2+3"');
    expect(encodeResearchDataCsvCell('@SUM(A1:A2)')).toBe('"\'@SUM(A1:A2)"');
    expect(encodeResearchDataCsvCell('\t=cmd')).toBe('"\'\t=cmd"');
    expect(contents.match(/false/g)?.length).toBe(7 * 7);
  });

  it('fails closed when a record gains a raw or unknown event field', () => {
    const unsafe = snapshot();
    const first = unsafe.records[0] as ResearchRecordV1 & { event: Record<string, unknown> };
    first.event = {
      type: 'run_started',
      armId: 'arm-1',
      rawLearnerText: SENTINELS.learnerChat,
    };

    expect(() => exportResearchDataJsonl(unsafe)).toThrow(/unknown or raw-content field/i);
    expect(() => exportResearchDataCsv(unsafe)).toThrow(/unknown or raw-content field/i);
  });

  it('fails closed on cross-study, orphaned, or participant-mismatched records', () => {
    const crossStudy = snapshot();
    crossStudy.records[0].manifestRef.sha256 = '9'.repeat(64);
    expect(() => exportResearchDataJsonl(crossStudy)).toThrow(/different study/i);

    const orphan = snapshot();
    orphan.records[0].runId = '90000000-0000-4000-8000-000000000009';
    expect(() => exportResearchDataJsonl(orphan)).toThrow(/no matching run/i);

    const mismatch = snapshot();
    mismatch.records[0].participantId = PARTICIPANT_B;
    expect(() => exportResearchDataJsonl(mismatch)).toThrow(/mismatched participant/i);
  });

  it('fails closed on invalid timestamps, status contradictions, and incomplete high-water snapshots', () => {
    const invalidTime = snapshot();
    invalidTime.runs[0].startedAt = 'not-an-iso-time';
    expect(() => exportResearchDataJsonl(invalidTime)).toThrow(/valid UTC ISO timestamp/i);

    const activeWithEnd = snapshot();
    activeWithEnd.runs[1].endedAt = '2026-08-09T13:01:00.000Z';
    expect(() => exportResearchDataJsonl(activeWithEnd)).toThrow(/active run .* has an end time/i);

    const endedWithoutEndRecord = snapshot();
    const endedRun = endedWithoutEndRecord.runs[0];
    endedRun.nextSequence = 2;
    endedWithoutEndRecord.records = endedWithoutEndRecord.records.filter(
      (candidate) => candidate.recordId !== RECORD_D,
    );
    expect(() => exportResearchDataJsonl(endedWithoutEndRecord)).toThrow(/not complete through its end record/i);

    const gap = snapshot();
    gap.records = gap.records.filter((candidate) => candidate.recordId !== RECORD_B);
    expect(() => exportResearchDataJsonl(gap)).toThrow(/sequence gap/i);
  });
});
