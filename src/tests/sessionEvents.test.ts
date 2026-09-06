import { describe, expect, it } from 'vitest';
import {
  assertSessionEventV1,
  validateSessionEventV1,
  type SessionStartedEvent,
  type SessionEventPayloadV1,
  type SessionEventV1,
  type LearnerMessageSubmittedEvent,
  type ViewCaptureSucceededEvent,
} from '../core/sessionEvents';

const EVENT_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000100';
const PREVIOUS_SESSION_ID = '00000000-0000-4000-8000-000000000200';
const TURN_ID = '00000000-0000-4000-8000-000000000300';
const CASE_HASH = '1'.repeat(64);
const LESSON_HASH = '2'.repeat(64);
const ASSET_HASH = '3'.repeat(64);
const PROMPT_HASH = '4'.repeat(64);

function makeEvent(event: SessionEventPayloadV1, sequence = 0): SessionEventV1 {
  return {
    schema: 'caseattend.session-event',
    schemaVersion: '1.0',
    appVersion: '0.2.0',
    eventId: EVENT_ID,
    sessionId: SESSION_ID,
    sequence,
    occurredAt: '2026-08-09T12:00:00.000Z',
    casePackageRef: {
      id: 'derm-example',
      schemaVersion: '1.0',
      sha256: CASE_HASH,
    },
    lessonPlanRef: {
      id: 'derm-description',
      version: '1.0.0',
      sha256: LESSON_HASH,
    },
    event,
  };
}

function makeInvalidEvent(event: Record<string, unknown>, sequence = 0): unknown {
  return {
    ...makeEvent({ type: 'turn_cancelled', turnId: TURN_ID }, sequence),
    event,
  };
}

const typeCheckedCaseOpened: SessionStartedEvent = {
  type: 'session_started',
  startReason: 'case_opened',
};
const typeCheckedCaseSwitch: SessionStartedEvent = {
  type: 'session_started',
  startReason: 'case_switched',
  previousSessionId: PREVIOUS_SESSION_ID,
};
const typeCheckedSingleImage: ViewCaptureSucceededEvent = {
  type: 'view_capture_succeeded',
  turnId: TURN_ID,
  artifactKind: 'image',
  seriesId: 'clinical-photo',
  frameIndex: 0,
  frameCount: 1,
  assetSha256: ASSET_HASH,
  annotation: {
    present: false,
    measurementCount: 0,
    segmentedFrameCount: 0,
    activeFrameLabelCount: 0,
    revision: 0,
  },
};
const typeCheckedLessonHint: LearnerMessageSubmittedEvent = {
  type: 'learner_message_submitted',
  turnId: TURN_ID,
  inputSource: 'lesson_hint',
  hintId: 'describe-morphology',
  learnerLevel: 'ms_clinical',
  mode: 'chat',
};

// @ts-expect-error linked starts must identify the previous session
const typeRejectedUnlinkedSwitch: SessionStartedEvent = {
  type: 'session_started',
  startReason: 'case_switched',
};
// @ts-expect-error a single image cannot carry a stack frame identifier
const typeRejectedImageFrameId: ViewCaptureSucceededEvent = {
  ...typeCheckedSingleImage,
  frameId: 'frame-1',
};
// @ts-expect-error lesson hint events must identify the stable hint
const typeRejectedUnidentifiedHint: LearnerMessageSubmittedEvent = {
  type: 'learner_message_submitted',
  turnId: TURN_ID,
  inputSource: 'lesson_hint',
  learnerLevel: 'ms_clinical',
  mode: 'chat',
};

void typeCheckedCaseOpened;
void typeCheckedCaseSwitch;
void typeCheckedLessonHint;
void typeRejectedUnlinkedSwitch;
void typeRejectedImageFrameId;
void typeRejectedUnidentifiedHint;

describe('Session Event v1', () => {
  it('retains Step 2 learner turns in ordinary session metadata', () => {
    const event = makeEvent({ type: 'learner_message_submitted', turnId: TURN_ID,
      inputSource: 'typed', learnerLevel: 'ms_step2', mode: 'chat' });
    expect(validateSessionEventV1(event)).toEqual({ valid: true, errors: [] });
    expect(() => assertSessionEventV1(event)).not.toThrow();
  });

  it('accepts every closed metadata-only event variant', () => {
    const variants: SessionEventPayloadV1[] = [
      { type: 'session_started', startReason: 'case_opened' },
      { type: 'session_ended', reason: 'navigation' },
      {
        type: 'view_capture_succeeded',
        turnId: TURN_ID,
        artifactKind: 'image-stack',
        seriesId: 't1-post',
        frameId: 'frame-12',
        frameIndex: 11,
        frameCount: 24,
        assetSha256: ASSET_HASH,
        annotation: {
          present: true,
          measurementCount: 1,
          segmentedFrameCount: 2,
          activeFrameLabelCount: 1,
          revision: 3,
          lastChangedAt: '2026-08-09T11:59:59.000Z',
        },
      },
      { type: 'view_capture_failed', turnId: TURN_ID, reason: 'viewer_loading' },
      {
        type: 'learner_message_submitted',
        turnId: TURN_ID,
        inputSource: 'lesson_hint',
        learnerLevel: 'ms_clinical',
        mode: 'deep_think',
        hintId: 'describe-morphology',
      },
      {
        type: 'model_response_completed',
        turnId: TURN_ID,
        promptSha256: PROMPT_HASH,
        gateway: 'openrouter',
        requestedModelId: 'openai/gpt-5.4',
        resolvedModelId: 'openai/gpt-5.4-2026-08-01',
        upstreamProviderId: 'openai',
        latencyMs: 1450,
        usage: { promptTokens: 250, completionTokens: 80, totalTokens: 330 },
        finishReason: 'stop',
      },
      {
        type: 'model_response_failed',
        turnId: TURN_ID,
        promptSha256: PROMPT_HASH,
        gateway: 'openrouter',
        requestedModelId: 'openai/gpt-5.4',
        errorCode: 'rate_limited',
        httpStatus: 429,
        latencyMs: 300,
        retryable: true,
      },
      { type: 'turn_cancelled', turnId: TURN_ID },
      {
        type: 'objective_evidence_recorded',
        turnId: TURN_ID,
        objectiveId: 'describe-lesion',
        rubricCriterionId: 'morphology-evidence',
        source: 'learner_turn',
      },
      {
        type: 'lesson_completed',
        reason: 'objectives_met',
        turnsUsed: 5,
        objectivesMet: 3,
      },
      {
        type: 'lesson_completed',
        reason: 'budget_spent',
        turnsUsed: 12,
        objectivesMet: 1,
      },
    ];

    variants.forEach((event, index) => {
      expect(validateSessionEventV1(makeEvent(event, index))).toEqual({ valid: true, errors: [] });
    });
  });

  it('rejects a lesson_completed event with an unknown reason or negative counts', () => {
    const unknownReason = validateSessionEventV1(makeEvent({
      type: 'lesson_completed',
      // @ts-expect-error deliberately unsupported reason for this test
      reason: 'user_gave_up',
      turnsUsed: 5,
      objectivesMet: 3,
    }));
    expect(unknownReason.errors).toContain(
      "sessionEvent.event.reason must be 'objectives_met' or 'budget_spent'.",
    );

    const negative = validateSessionEventV1(makeEvent({
      type: 'lesson_completed',
      reason: 'budget_spent',
      turnsUsed: -1,
      objectivesMet: 2,
    }));
    expect(negative.errors).toContain('sessionEvent.event.turnsUsed must be a nonnegative integer.');
  });

  it('requires exact transition linkage and rejects linkage on an initial case opening', () => {
    const missingPrevious = makeInvalidEvent({
      type: 'session_started',
      startReason: 'case_switched',
    });
    const samePrevious = makeEvent({
      type: 'session_started',
      startReason: 'case_switched',
      previousSessionId: SESSION_ID,
    });
    const linked = makeEvent({
      type: 'session_started',
      startReason: 'case_switched',
      previousSessionId: PREVIOUS_SESSION_ID,
    });
    const linkedCaseOpened = makeInvalidEvent({
      type: 'session_started',
      startReason: 'case_opened',
      previousSessionId: PREVIOUS_SESSION_ID,
    });

    expect(validateSessionEventV1(missingPrevious).errors).toContain(
      'sessionEvent.event.previousSessionId is required for a restarted or switched session.',
    );
    expect(validateSessionEventV1(samePrevious).errors).toContain(
      'sessionEvent.event.previousSessionId must differ from sessionEvent.sessionId.',
    );
    expect(validateSessionEventV1(linked)).toEqual({ valid: true, errors: [] });
    expect(validateSessionEventV1(linkedCaseOpened).errors).toContain(
      'sessionEvent.event.previousSessionId must be omitted when startReason is case_opened.',
    );
  });

  it('accepts the canonical metadata for a single-frame image', () => {
    expect(validateSessionEventV1(makeEvent(typeCheckedSingleImage))).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects unknown envelope, nested, and free-text fields instead of preserving them', () => {
    const value = {
      ...makeEvent({ type: 'turn_cancelled', turnId: TURN_ID }),
      participantNotes: 'Learner described a patient.',
      event: {
        type: 'turn_cancelled',
        turnId: TURN_ID,
        messageText: 'This raw learner message must never enter the event log.',
      },
    };

    const result = validateSessionEventV1(value);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'sessionEvent.participantNotes is not valid in Session Event v1.',
    );
    expect(result.errors).toContain(
      'sessionEvent.event.messageText is not valid in Session Event v1.',
    );
  });

  it('rejects credential and direct-identifier shaped fields at any depth', () => {
    const value = {
      ...makeEvent({ type: 'turn_cancelled', turnId: TURN_ID }),
      apiKey: 'sk-private-value',
      event: {
        type: 'turn_cancelled',
        turnId: TURN_ID,
        patientId: 'patient-123',
      },
    };

    const result = validateSessionEventV1(value);

    expect(result.errors).toContain(
      'sessionEvent.apiKey is a credential or direct-identifier shaped field and cannot be recorded.',
    );
    expect(result.errors).toContain(
      'sessionEvent.event.patientId is a credential or direct-identifier shaped field and cannot be recorded.',
    );
    expect(() => assertSessionEventV1(value)).toThrow('Invalid Session Event v1');
  });

  it('rejects data and blob URLs even when placed in an otherwise safe identifier field', () => {
    const dataResult = validateSessionEventV1(makeEvent({
      type: 'model_response_completed',
      turnId: TURN_ID,
      promptSha256: PROMPT_HASH,
      gateway: 'openrouter',
      requestedModelId: 'data:image',
      latencyMs: 1,
    }));
    const blobResult = validateSessionEventV1(makeEvent({
      type: 'model_response_failed',
      turnId: TURN_ID,
      gateway: 'openrouter',
      requestedModelId: 'blob:captured-frame',
      errorCode: 'network_error',
      latencyMs: 1,
      retryable: true,
    }));

    expect(dataResult.errors).toContain(
      'sessionEvent.event.requestedModelId must not contain data: or blob: content.',
    );
    expect(blobResult.errors).toContain(
      'sessionEvent.event.requestedModelId must not contain data: or blob: content.',
    );
  });

  it('rejects URL-shaped model and provider identifiers', () => {
    const result = validateSessionEventV1(makeInvalidEvent({
      type: 'model_response_completed',
      turnId: TURN_ID,
      promptSha256: PROMPT_HASH,
      gateway: 'openrouter',
      requestedModelId: 'https://models.example/gpt',
      resolvedModelId: 'provider://resolved-model',
      upstreamProviderId: 'https://provider.example',
      latencyMs: 1,
    }));

    expect(result.errors).toEqual(expect.arrayContaining([
      'sessionEvent.event.requestedModelId must be a safe model or provider identifier of at most 200 characters.',
      'sessionEvent.event.resolvedModelId must be a safe model or provider identifier of at most 200 characters.',
      'sessionEvent.event.upstreamProviderId must be a safe model or provider identifier of at most 200 characters.',
    ]));
  });

  it('requires exact byte-free artifact metadata and consistent annotation aggregates', () => {
    const result = validateSessionEventV1(makeInvalidEvent({
      type: 'view_capture_succeeded',
      turnId: TURN_ID,
      artifactKind: 'image',
      seriesId: 'clinical-photo',
      frameIndex: 1,
      frameCount: 1,
      assetSha256: 'not-a-hash',
      annotation: {
        present: false,
        measurementCount: 1,
        segmentedFrameCount: 0,
        activeFrameLabelCount: 0,
        revision: 0,
      },
    }));

    expect(result.errors).toContain('sessionEvent.event.frameIndex must be less than frameCount.');
    expect(result.errors).toContain(
      'sessionEvent.event.assetSha256 must be a lowercase 64-character SHA-256 digest.',
    );
    expect(result.errors).toContain(
      'sessionEvent.event.annotation counts must all be zero when present is false.',
    );
    expect(result.errors).toContain(
      'sessionEvent.event image artifacts must use frameIndex 0 and frameCount 1.',
    );
  });

  it('enforces image and image-stack frame identity as distinct artifact shapes', () => {
    const imageWithFrameId = validateSessionEventV1(makeInvalidEvent({
      ...typeCheckedSingleImage,
      frameId: 'frame-1',
    }));
    const stackWithoutFrameId = validateSessionEventV1(makeInvalidEvent({
      type: 'view_capture_succeeded',
      turnId: TURN_ID,
      artifactKind: 'image-stack',
      seriesId: 't1-post',
      frameIndex: 0,
      frameCount: 2,
      assetSha256: ASSET_HASH,
      annotation: {
        present: false,
        measurementCount: 0,
        segmentedFrameCount: 0,
        activeFrameLabelCount: 0,
        revision: 0,
      },
    }));

    expect(imageWithFrameId.errors).toContain(
      'sessionEvent.event.frameId must be omitted for a single image artifact.',
    );
    expect(stackWithoutFrameId.errors).toContain(
      'sessionEvent.event.frameId is required for an image-stack artifact.',
    );
  });

  it('enforces exact annotation presence and frame-count consistency', () => {
    const result = validateSessionEventV1(makeInvalidEvent({
      type: 'view_capture_succeeded',
      turnId: TURN_ID,
      artifactKind: 'image-stack',
      seriesId: 't1-post',
      frameId: 'frame-1',
      frameIndex: 0,
      frameCount: 2,
      assetSha256: ASSET_HASH,
      annotation: {
        present: true,
        measurementCount: 0,
        segmentedFrameCount: 0,
        activeFrameLabelCount: 2,
        revision: 1,
      },
    }));
    const tooManySegmentedFrames = validateSessionEventV1(makeInvalidEvent({
      type: 'view_capture_succeeded',
      turnId: TURN_ID,
      artifactKind: 'image-stack',
      seriesId: 't1-post',
      frameId: 'frame-1',
      frameIndex: 0,
      frameCount: 2,
      assetSha256: ASSET_HASH,
      annotation: {
        present: true,
        measurementCount: 0,
        segmentedFrameCount: 3,
        activeFrameLabelCount: 0,
        revision: 1,
      },
    }));

    expect(result.errors).toEqual(expect.arrayContaining([
      'sessionEvent.event.annotation.present must be false when measurementCount and segmentedFrameCount are both zero.',
      'sessionEvent.event.annotation.segmentedFrameCount must be positive when activeFrameLabelCount is positive.',
    ]));
    expect(tooManySegmentedFrames.errors).toContain(
      'sessionEvent.event.annotation.segmentedFrameCount must not exceed frameCount.',
    );
  });

  it('rejects optional fields explicitly set to undefined so exports remain canonical JSON', () => {
    const value = makeEvent({
      type: 'turn_cancelled',
      turnId: TURN_ID,
    }) as SessionEventV1 & { optionalLeak?: undefined };
    value.optionalLeak = undefined;

    const result = validateSessionEventV1(value);

    expect(result.errors).toContain(
      'sessionEvent.optionalLeak cannot be undefined. Omit optional fields instead.',
    );
  });
});
