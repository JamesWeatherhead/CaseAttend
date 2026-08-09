import { describe, expect, it } from 'vitest';
import {
  exportSessionEventsCsv,
  exportSessionEventsJsonl,
  SESSION_EVENT_CSV_COLUMNS,
  sortSessionEventsV1,
} from '../core/sessionExports';
import type { SessionEventPayloadV1, SessionEventV1 } from '../core/sessionEvents';

const SESSION_A = '00000000-0000-4000-8000-000000000100';
const SESSION_B = '00000000-0000-4000-8000-000000000200';
const TURN_ID = '00000000-0000-4000-8000-000000000300';

function eventId(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function makeEvent(
  sessionId: string,
  sequence: number,
  event: SessionEventPayloadV1,
): SessionEventV1 {
  return {
    schema: 'caseattend.session-event',
    schemaVersion: '1.0',
    appVersion: '0.2.0',
    eventId: eventId(sequence + (sessionId === SESSION_A ? 1 : 100)),
    sessionId,
    sequence,
    occurredAt: `2026-08-09T12:00:0${sequence}.000Z`,
    casePackageRef: {
      id: 'derm-example',
      schemaVersion: '1.0',
      sha256: '1'.repeat(64),
    },
    lessonPlanRef: {
      id: 'derm-description',
      version: '1.0.0',
      sha256: '2'.repeat(64),
    },
    event,
  };
}

describe('Session Event v1 exports', () => {
  const sessionAStart = makeEvent(SESSION_A, 0, {
    type: 'session_started',
    startReason: 'case_opened',
  });
  const sessionASubmit = makeEvent(SESSION_A, 1, {
    type: 'learner_message_submitted',
    turnId: TURN_ID,
    inputSource: 'typed',
    learnerLevel: 'undergrad',
    mode: 'chat',
  });
  const sessionBEnd = makeEvent(SESSION_B, 2, {
    type: 'session_ended',
    reason: 'navigation',
  });

  it('sorts a copy by session and sequence without mutating the input', () => {
    const input = [sessionBEnd, sessionASubmit, sessionAStart];

    const sorted = sortSessionEventsV1(input);

    expect(sorted.map((entry) => [entry.sessionId, entry.sequence])).toEqual([
      [SESSION_A, 0],
      [SESSION_A, 1],
      [SESSION_B, 2],
    ]);
    expect(input).toEqual([sessionBEnd, sessionASubmit, sessionAStart]);
  });

  it('writes deterministic canonical JSONL with one terminal newline', () => {
    const exported = exportSessionEventsJsonl([sessionBEnd, sessionASubmit, sessionAStart]);
    const lines = exported.trimEnd().split('\n');

    expect(exported.endsWith('\n')).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('{"appVersion"')).toBe(true);
    expect(lines.map((line) => JSON.parse(line).sequence)).toEqual([0, 1, 2]);
    expect(exportSessionEventsJsonl([sessionBEnd, sessionASubmit, sessionAStart])).toBe(exported);
  });

  it('writes a fixed tidy CSV with CRLF line endings and no raw message column', () => {
    const exported = exportSessionEventsCsv([sessionASubmit, sessionAStart]);
    const rows = exported.trimEnd().split('\r\n');
    const headers = rows[0].split(',');
    const start = rows[1].split(',');
    const submit = rows[2].split(',');

    expect(headers).toEqual(SESSION_EVENT_CSV_COLUMNS);
    expect(rows).toHaveLength(3);
    expect(headers).not.toContain('message');
    expect(headers).not.toContain('response');
    expect(start[headers.indexOf('event_type')]).toBe('session_started');
    expect(start[headers.indexOf('session_start_reason')]).toBe('case_opened');
    expect(submit[headers.indexOf('event_type')]).toBe('learner_message_submitted');
    expect(submit[headers.indexOf('learner_level')]).toBe('undergrad');
    expect(exported).toContain('\r\n');
    expect(exported.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('returns an empty string when there are no events to export', () => {
    expect(exportSessionEventsJsonl([])).toBe('');
    expect(exportSessionEventsCsv([])).toBe('');
  });

  it('rejects duplicate sequence numbers within a session', () => {
    const duplicate = {
      ...sessionAStart,
      eventId: eventId(999),
      event: { type: 'session_ended', reason: 'navigation' } as const,
    };

    expect(() => exportSessionEventsJsonl([sessionAStart, duplicate])).toThrow(
      `Cannot export duplicate sequence 0 for session '${SESSION_A}'.`,
    );
  });

  it('refuses invalid events before writing either export format', () => {
    const invalid = {
      ...sessionAStart,
      event: { ...sessionAStart.event, rawMessage: 'do not export this' },
    } as unknown as SessionEventV1;

    expect(() => exportSessionEventsJsonl([invalid])).toThrow(
      'sessionEvent.event.rawMessage is not valid in Session Event v1.',
    );
    expect(() => exportSessionEventsCsv([invalid])).toThrow(
      'sessionEvent.event.rawMessage is not valid in Session Event v1.',
    );
  });
});
