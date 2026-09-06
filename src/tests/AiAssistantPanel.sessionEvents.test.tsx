// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistantPanel from '../components/AiAssistantPanel';
import type { SessionEventV1 } from '../core/sessionEvents';
import {
  CASE_SESSION_EXIT_EVENT,
  clearCaseTransition,
  type SessionRecorderContext,
} from '../services/sessionRecorder';
import { SESSION_DATA_DELETED_EVENT } from '../services/sessionStore';

const mocks = vi.hoisted(() => ({
  streamChatResponse: vi.fn(),
  hasKey: vi.fn(() => true),
  getModel: vi.fn(() => 'openai/gpt-4.1-mini'),
}));

vi.mock('../services/aiClient', () => ({
  SafeInferenceError: class SafeInferenceError extends Error {},
  streamChatResponse: mocks.streamChatResponse,
}));

vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed',
  getModel: mocks.getModel,
  hasKey: mocks.hasKey,
  modelLabel: () => 'Test vision model',
}));

vi.mock('../lib/domains', () => ({
  getDomain: (key: 'radiology' | 'dermatology') => ({
    key,
    artifactHints: {
      showWindowLevel: key === 'radiology',
      showSeriesSelector: key === 'radiology',
      showSegmentation: true,
    },
    welcomeMessage: () => 'Welcome',
    getInitialSuggestions: () => [],
    contextLabel: (modality: string) => modality,
    captureLabel: () => key === 'dermatology' ? 'Clinical photograph' : 'Medical image',
  }),
}));

const CASE_HASH_A = '1'.repeat(64);
const LESSON_HASH_A = '2'.repeat(64);
const CASE_HASH_B = '3'.repeat(64);
const LESSON_HASH_B = '4'.repeat(64);
const ASSET_HASH = '5'.repeat(64);
const PROMPT_HASH = '6'.repeat(64);
const RAW_QUESTION = 'PRIVATE learner prose that must never be exported';
const RAW_IMAGE = 'data:image/png;base64,PRIVATE_CAPTURE_BYTES';
const PRIVATE_KEY = 'sk-private-browser-only-sentinel';
const testInferenceResult = {
  promptSha256: PROMPT_HASH,
  provider: 'openrouter' as const,
  model: 'openai/gpt-4.1-mini',
  resolvedModelId: 'openai/gpt-4.1-mini-2026-08-01',
  upstreamProviderId: 'openai',
  latencyMs: 321,
  usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
  finishReason: 'stop' as const,
};

const radiologyStudy = {
  studyId: 'ct-epidural',
  description: 'Epidural hematoma',
  modality: 'CT',
  domain: 'radiology' as const,
};

const dermatologyStudy = {
  studyId: 'derm-melanoma',
  description: 'Pigmented lesion',
  modality: 'XC',
  domain: 'dermatology' as const,
};

const radiologyContext: SessionRecorderContext = {
  casePackageRef: {
    id: 'ct-epidural',
    schemaVersion: '1.0',
    sha256: CASE_HASH_A,
  },
  lessonPlanRef: {
    id: 'ct-epidural-lesson',
    version: '1.0.0',
    sha256: LESSON_HASH_A,
  },
};

const dermatologyContext: SessionRecorderContext = {
  casePackageRef: {
    id: 'derm-melanoma',
    schemaVersion: '1.0',
    sha256: CASE_HASH_B,
  },
  lessonPlanRef: {
    id: 'derm-melanoma-lesson',
    version: '1.0.0',
    sha256: LESSON_HASH_B,
  },
};

const revisedRadiologyContext: SessionRecorderContext = {
  ...radiologyContext,
  lessonPlanRef: {
    id: 'ct-epidural-lesson',
    version: '1.1.0',
    sha256: '7'.repeat(64),
  },
};

const capturedView = {
  image: RAW_IMAGE,
  slice: 7,
  total: 12,
  label: 'Axial series',
  viewSnapshot: {
    artifactKind: 'image-stack' as const,
    seriesId: 'axial-brain',
    frameId: 'frame-007',
    frameIndex: 6,
    frameCount: 12,
    assetSha256: ASSET_HASH,
    annotation: {
      present: true,
      measurementCount: 2,
      segmentedFrameCount: 1,
      activeFrameLabelCount: 1,
      revision: 9,
      lastChangedAt: '2026-08-09T12:34:56.000Z',
    },
  },
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeEventStore() {
  const events: SessionEventV1[] = [];
  const append = vi.fn(async (event: SessionEventV1) => {
    events.push(structuredClone(event));
  });
  return { events, store: { append } };
}

function eventTypes(events: SessionEventV1[]): string[] {
  return events.map((event) => event.event.type);
}

async function waitForLesson(): Promise<void> {
  await screen.findByText(/Lesson v1\.0\.0/);
}

describe('AiAssistantPanel Session Event v1 integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('caseattend_openrouter_key', PRIVATE_KEY);
    mocks.hasKey.mockReturnValue(true);
    mocks.getModel.mockReturnValue('openai/gpt-4.1-mini');
    mocks.streamChatResponse.mockResolvedValue(testInferenceResult);
  });

  afterEach(() => {
    cleanup();
    clearCaseTransition();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('starts a version-bound browser-local session when a case opens', async () => {
    const { events, store } = makeEventStore();

    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );

    await waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      schema: 'caseattend.session-event',
      schemaVersion: '1.0',
      sequence: 0,
      casePackageRef: radiologyContext.casePackageRef,
      lessonPlanRef: radiologyContext.lessonPlanRef,
      event: { type: 'session_started', startReason: 'case_opened' },
    });
  });

  it('does not create throwaway sessions during the StrictMode effect replay', async () => {
    const { events, store } = makeEventStore();
    render(
      <React.StrictMode>
        <AiAssistantPanel
          captureCurrentView={() => capturedView}
          sessionContext={radiologyContext}
          sessionEventStore={store}
          studyMetadata={radiologyStudy}
        />
      </React.StrictMode>,
    );

    await waitFor(() => expect(events).toHaveLength(1));
    await act(async () => Promise.resolve());
    expect(eventTypes(events)).toEqual(['session_started']);
  });

  it('ends on pagehide and starts a fresh session after a BFCache pageshow', async () => {
    const { events, store } = makeEventStore();
    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(1));
    const firstSessionId = events[0].sessionId;

    act(() => window.dispatchEvent(new Event('pagehide')));
    await waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({
      sessionId: firstSessionId,
      event: { type: 'session_ended', reason: 'page_hidden' },
    });

    const pageShow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(pageShow, 'persisted', { value: true });
    act(() => window.dispatchEvent(pageShow));
    await waitFor(() => expect(events).toHaveLength(3));
    expect(events[2]).toMatchObject({
      event: { type: 'session_started', startReason: 'case_opened' },
    });
    expect(events[2].sessionId).not.toBe(firstSessionId);
  });

  it.each([
    ['send button', 'button'],
    ['Enter', 'enter'],
  ] as const)('records capture, submission, and completion in exact order via %s without private payloads', async (_label, action) => {
    const { events, store } = makeEventStore();
    const captureCurrentView = vi.fn(() => capturedView);

    render(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitForLesson();

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: RAW_QUESTION } });
    if (action === 'enter') {
      fireEvent.keyDown(input, { key: 'Enter' });
    } else {
      fireEvent.click(screen.getByLabelText('Send view and question'));
    }

    await waitFor(() => expect(eventTypes(events)).toEqual([
      'session_started',
      'view_capture_succeeded',
      'learner_message_submitted',
      'model_response_completed',
    ]));

    const [started, capture, submitted, completed] = events;
    const turnId = 'turnId' in capture.event ? capture.event.turnId : undefined;
    expect(capture.event).toEqual({ type: 'view_capture_succeeded', turnId, ...capturedView.viewSnapshot });
    expect(submitted.event).toEqual({
      type: 'learner_message_submitted',
      turnId,
      inputSource: 'typed',
      learnerLevel: 'ms_preclinical',
      mode: 'chat',
    });
    expect(completed.event).toMatchObject({
      type: 'model_response_completed',
      turnId,
      promptSha256: PROMPT_HASH,
      gateway: 'openrouter',
      requestedModelId: 'openai/gpt-4.1-mini',
      resolvedModelId: 'openai/gpt-4.1-mini-2026-08-01',
      upstreamProviderId: 'openai',
      latencyMs: 321,
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      finishReason: 'stop',
    });
    expect(events.every((event) => event.sessionId === started.sessionId)).toBe(true);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(events.every((event) => event.casePackageRef.sha256 === CASE_HASH_A)).toBe(true);
    expect(events.every((event) => event.lessonPlanRef.sha256 === LESSON_HASH_A)).toBe(true);
    expect(captureCurrentView).toHaveBeenCalledTimes(1);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(RAW_QUESTION);
    expect(serialized).not.toContain(RAW_IMAGE);
    expect(serialized).not.toContain(PRIVATE_KEY);
    expect(serialized).not.toMatch(/authorization|bearer|apiKey/i);
  });

  it('records a capture failure and makes no inference when the current view is unavailable', async () => {
    const { events, store } = makeEventStore();
    const captureCurrentView = vi.fn(() => null);

    render(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
        activeSeriesInfo={{ description: 'Axial brain', instanceCount: 12 }}
      />,
    );

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: RAW_QUESTION } });
    fireEvent.click(screen.getByLabelText('Send view and question'));

    await waitFor(() => expect(eventTypes(events)).toEqual([
      'session_started',
      'view_capture_failed',
    ]));
    expect(events[1].event).toMatchObject({
      type: 'view_capture_failed',
      reason: 'viewer_loading',
    });
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe(RAW_QUESTION);
    expect(JSON.stringify(events)).not.toContain(RAW_QUESTION);
  });

  it('cancels an in-flight turn once, ends the old session, and starts a linked session on case switch', async () => {
    const { events, store } = makeEventStore();
    const inferenceGate = deferred<{
      promptSha256: string;
      latencyMs: number;
    }>();
    mocks.streamChatResponse.mockReturnValueOnce(inferenceGate.promise);

    const { rerender } = render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitForLesson();

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'Question before switch' } });
    fireEvent.click(screen.getByLabelText('Send view and question'));
    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1));

    rerender(
      <AiAssistantPanel
        captureCurrentView={() => ({
          ...capturedView,
          viewSnapshot: {
            ...capturedView.viewSnapshot,
            artifactKind: 'image' as const,
            seriesId: 'clinical-photo',
            frameId: undefined,
            frameIndex: 0,
            frameCount: 1,
          },
        })}
        sessionContext={dermatologyContext}
        sessionEventStore={store}
        studyMetadata={dermatologyStudy}
      />,
    );

    await waitFor(() => expect(eventTypes(events)).toEqual([
      'session_started',
      'view_capture_succeeded',
      'learner_message_submitted',
      'turn_cancelled',
      'session_ended',
      'session_started',
    ]));

    const oldSessionId = events[0].sessionId;
    const newSessionId = events[5].sessionId;
    const cancellationEvents = events.filter((event) => event.event.type === 'turn_cancelled');
    expect(cancellationEvents).toHaveLength(1);
    expect(events[3].sessionId).toBe(oldSessionId);
    expect(events[4]).toMatchObject({
      sessionId: oldSessionId,
      sequence: 4,
      event: { type: 'session_ended', reason: 'case_switched' },
    });
    expect(events[5]).toMatchObject({
      sessionId: newSessionId,
      sequence: 0,
      casePackageRef: dermatologyContext.casePackageRef,
      lessonPlanRef: dermatologyContext.lessonPlanRef,
      event: {
        type: 'session_started',
        startReason: 'case_switched',
        previousSessionId: oldSessionId,
      },
    });
    expect(newSessionId).not.toBe(oldSessionId);

    await act(async () => {
      inferenceGate.resolve({ promptSha256: PROMPT_HASH, latencyMs: 999 });
      await inferenceGate.promise;
    });
    expect(events.filter((event) => (
      event.event.type === 'model_response_completed'
      || event.event.type === 'model_response_failed'
    ))).toHaveLength(0);
    expect(events.filter((event) => event.event.type === 'turn_cancelled')).toHaveLength(1);
  });

  it('resets an in-flight turn and starts a linked session when the same case lesson revision changes', async () => {
    const { events, store } = makeEventStore();
    const inferenceGate = deferred<typeof testInferenceResult>();
    mocks.streamChatResponse.mockReturnValueOnce(inferenceGate.promise);

    const { rerender } = render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitForLesson();

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'Question before lesson revision' } });
    fireEvent.click(screen.getByLabelText('Send view and question'));
    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1));

    rerender(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={revisedRadiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );

    await waitFor(() => expect(eventTypes(events)).toEqual([
      'session_started',
      'view_capture_succeeded',
      'learner_message_submitted',
      'turn_cancelled',
      'session_ended',
      'session_started',
    ]));

    const previousSessionId = events[0].sessionId;
    expect(events[4]).toMatchObject({
      sessionId: previousSessionId,
      event: { type: 'session_ended', reason: 'lesson_changed' },
    });
    expect(events[5]).toMatchObject({
      lessonPlanRef: revisedRadiologyContext.lessonPlanRef,
      event: {
        type: 'session_started',
        startReason: 'lesson_changed',
        previousSessionId,
      },
    });
    expect(events[5].sessionId).not.toBe(previousSessionId);
    expect(screen.queryByText('Question before lesson revision')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
    expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).value).toBe('');

    await act(async () => {
      inferenceGate.resolve(testInferenceResult);
      await inferenceGate.promise;
    });
    expect(events.filter((event) => (
      event.event.type === 'model_response_completed'
      || event.event.type === 'model_response_failed'
    ))).toHaveLength(0);
    expect(events.filter((event) => event.event.type === 'turn_cancelled')).toHaveLength(1);
  });

  it('Clear ends the current session and starts a linked user-restarted session', async () => {
    const { events, store } = makeEventStore();

    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(1));
    const oldSessionId = events[0].sessionId;

    fireEvent.click(screen.getByTitle('Clear Chat / New Conversation'));

    await waitFor(() => expect(eventTypes(events)).toEqual([
      'session_started',
      'session_ended',
      'session_started',
    ]));
    expect(events[1]).toMatchObject({
      sessionId: oldSessionId,
      sequence: 1,
      event: { type: 'session_ended', reason: 'user_restarted' },
    });
    expect(events[2]).toMatchObject({
      sequence: 0,
      casePackageRef: radiologyContext.casePackageRef,
      lessonPlanRef: radiologyContext.lessonPlanRef,
      event: {
        type: 'session_started',
        startReason: 'user_restarted',
        previousSessionId: oldSessionId,
      },
    });
    expect(events[2].sessionId).not.toBe(oldSessionId);
  });

  it('owns the restarted session through a later case switch', async () => {
    const { events, store } = makeEventStore();
    const { rerender } = render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(1));

    fireEvent.click(screen.getByTitle('Clear Chat / New Conversation'));
    await waitFor(() => expect(events).toHaveLength(3));
    const restartedSessionId = events[2].sessionId;

    rerender(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={dermatologyContext}
        sessionEventStore={store}
        studyMetadata={dermatologyStudy}
      />,
    );

    await waitFor(() => expect(events).toHaveLength(5));
    expect(events[3]).toMatchObject({
      sessionId: restartedSessionId,
      sequence: 1,
      event: { type: 'session_ended', reason: 'case_switched' },
    });
    expect(events[4]).toMatchObject({
      casePackageRef: dermatologyContext.casePackageRef,
      event: {
        type: 'session_started',
        startReason: 'case_switched',
        previousSessionId: restartedSessionId,
      },
    });
  });

  it('links sessions across the real catalog unmount and next case mount', async () => {
    const { events, store } = makeEventStore();
    const first = render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(1));
    const previousSessionId = events[0].sessionId;

    act(() => window.dispatchEvent(new Event(CASE_SESSION_EXIT_EVENT)));
    await waitFor(() => expect(events).toHaveLength(2));
    first.unmount();

    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={dermatologyContext}
        sessionEventStore={store}
        studyMetadata={dermatologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(3));
    expect(events[1]).toMatchObject({
      sessionId: previousSessionId,
      event: { type: 'session_ended', reason: 'case_switched' },
    });
    expect(events[2]).toMatchObject({
      casePackageRef: dermatologyContext.casePackageRef,
      event: {
        type: 'session_started',
        startReason: 'case_switched',
        previousSessionId,
      },
    });
  });

  it('records a same-case catalog reopen as a case switch, not a lesson change', async () => {
    const { events, store } = makeEventStore();
    const first = render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(1));
    const previousSessionId = events[0].sessionId;

    act(() => window.dispatchEvent(new Event(CASE_SESSION_EXIT_EVENT)));
    await waitFor(() => expect(events).toHaveLength(2));
    first.unmount();

    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(3));
    expect(events[2]).toMatchObject({
      event: {
        type: 'session_started',
        startReason: 'case_switched',
        previousSessionId,
      },
    });
  });

  it('clears a pending catalog transition when its session is deleted while the panel is unmounted', async () => {
    const { events, store } = makeEventStore();
    const first = render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(1));
    const deletedSessionId = events[0].sessionId;

    act(() => window.dispatchEvent(new Event(CASE_SESSION_EXIT_EVENT)));
    await waitFor(() => expect(events).toHaveLength(2));
    first.unmount();
    act(() => window.dispatchEvent(new CustomEvent(SESSION_DATA_DELETED_EVENT, {
      detail: { all: false, sessionId: deletedSessionId },
    })));

    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitFor(() => expect(events).toHaveLength(3));
    expect(events[2]).toMatchObject({
      event: {
        type: 'session_started',
        startReason: 'case_opened',
      },
    });
    expect(events[2].event).not.toHaveProperty('previousSessionId');
  });

  it('abandons a deleted active session before an in-flight completion can recreate it', async () => {
    const { events, store } = makeEventStore();
    const inferenceGate = deferred<typeof testInferenceResult>();
    mocks.streamChatResponse.mockReturnValueOnce(inferenceGate.promise);

    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitForLesson();
    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'Question before deletion' } });
    fireEvent.click(screen.getByLabelText('Send view and question'));
    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new CustomEvent(SESSION_DATA_DELETED_EVENT, {
      detail: { all: true },
    })));
    events.length = 0;
    await act(async () => {
      inferenceGate.resolve(testInferenceResult);
      await inferenceGate.promise;
    });
    expect(events).toEqual([]);

    const nextInput = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(nextInput, { target: { value: 'Question after deletion' } });
    fireEvent.click(screen.getByLabelText('Send view and question'));
    await waitFor(() => expect(eventTypes(events)).toEqual([
      'session_started',
      'view_capture_succeeded',
      'learner_message_submitted',
      'model_response_completed',
    ]));
  });

  it('records lesson suggestions as hint IDs without storing the suggestion text', async () => {
    const { events, store } = makeEventStore();

    render(
      <AiAssistantPanel
        captureCurrentView={() => capturedView}
        sessionContext={radiologyContext}
        sessionEventStore={store}
        studyMetadata={radiologyStudy}
      />,
    );
    await waitForLesson();

    const suggestionButton = (await screen.findAllByRole('button', {
      name: /Send suggested question with current view:/,
    }))[0];
    const suggestionText = suggestionButton.textContent?.trim() ?? '';
    fireEvent.click(suggestionButton);

    await waitFor(() => expect(events.some((event) => (
      event.event.type === 'learner_message_submitted'
      && event.event.inputSource === 'lesson_hint'
    ))).toBe(true));
    const submitted = events.find((event) => event.event.type === 'learner_message_submitted');
    expect(submitted?.event).toMatchObject({
      type: 'learner_message_submitted',
      inputSource: 'lesson_hint',
    });
    expect(submitted?.event).toHaveProperty('hintId');
    expect(JSON.stringify(events)).not.toContain(suggestionText);
  });
});
