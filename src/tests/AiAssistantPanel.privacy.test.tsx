// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistantPanel from '../components/AiAssistantPanel';
import * as caseRegistry from '../data/caseRegistry';
import * as lessonRegistry from '../data/lessonRegistry';
import type { ReproducibleViewSnapshot } from '../types';

const mocks = vi.hoisted(() => ({
  streamChatResponse: vi.fn(),
  hasKey: vi.fn(() => true),
}));

vi.mock('../services/aiClient', () => ({
  streamChatResponse: mocks.streamChatResponse,
}));

vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed',
  getModel: () => 'openai/gpt-4.1-mini',
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

const radiologyStudy = {
  studyId: 'ct-epidural',
  patientName: 'Teaching case',
  description: 'Epidural hematoma',
  modality: 'CT',
  domain: 'radiology' as const,
};

const dermatologyStudy = {
  studyId: 'derm-melanoma',
  patientName: 'Teaching case',
  description: 'Pigmented lesion',
  modality: 'XC',
  domain: 'dermatology' as const,
};

const testViewSnapshot: ReproducibleViewSnapshot = {
  artifactKind: 'image' as const,
  seriesId: 'clinical-photo',
  frameIndex: 0,
  frameCount: 1,
  assetSha256: 'a'.repeat(64),
  annotation: {
    present: true,
    measurementCount: 1,
    segmentedFrameCount: 0,
    activeFrameLabelCount: 0,
    revision: 1,
    lastChangedAt: '2026-08-09T12:00:00.000Z',
  },
};

const testInferenceResult = {
  provider: 'openrouter' as const,
  model: 'openai/gpt-4.1-mini',
  latencyMs: 12,
  promptSha256: 'b'.repeat(64),
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

describe('AiAssistantPanel image transmission privacy', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.hasKey.mockReturnValue(true);
    mocks.streamChatResponse.mockResolvedValue(testInferenceResult);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not call a model when a connected user opens, reconnects, or switches cases', async () => {
    const captureCurrentView = vi.fn(() => ({
      image: 'data:image/png;base64,unused',
      slice: 1,
      total: 1,
      label: 'Clinical photograph',
      viewSnapshot: testViewSnapshot,
    }));

    const { rerender } = render(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        studyMetadata={radiologyStudy}
      />,
    );

    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
    expect(captureCurrentView).not.toHaveBeenCalled();

    fireEvent(window, new Event('caseattend:byok-changed'));
    rerender(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        studyMetadata={dermatologyStudy}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Nothing is sent to a model until you submit a question')).toBeTruthy();
    });
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
    expect(captureCurrentView).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders without inference when browser preference storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    });

    expect(() => render(
      <AiAssistantPanel
        captureCurrentView={() => null}
        studyMetadata={dermatologyStudy}
      />,
    )).not.toThrow();
    expect(await screen.findByRole('log', { name: 'AI tutor conversation' })).toBeTruthy();
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
  });

  it('exposes a live conversation log and accessible send, suggestion, and cancel targets', async () => {
    const inferenceGate = deferred<typeof testInferenceResult>();
    mocks.streamChatResponse.mockReturnValueOnce(inferenceGate.promise);
    render(
      <AiAssistantPanel
        captureCurrentView={() => ({
          image: 'data:image/png;base64,accessible-view',
          slice: 1,
          total: 1,
          label: 'Clinical photograph',
          viewSnapshot: testViewSnapshot,
        })}
        studyMetadata={dermatologyStudy}
      />,
    );

    const log = screen.getByRole('log', { name: 'AI tutor conversation' });
    expect(log.getAttribute('aria-live')).toBe('polite');
    const suggestions = await screen.findAllByRole('button', {
      name: /Send suggested question with current view:/,
    });
    expect(suggestions[0].className).toContain('min-h-11');

    const send = screen.getByLabelText('Send view and question');
    expect(send.className).toContain('min-h-11');
    fireEvent.change(screen.getByLabelText('Question for the AI tutor'), {
      target: { value: 'What should I notice?' },
    });
    fireEvent.click(send);

    const cancel = await screen.findByRole('button', { name: 'Cancel AI response' });
    expect(cancel.className).toContain('min-h-11');
    expect(log.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      inferenceGate.resolve(testInferenceResult);
      await inferenceGate.promise;
    });
  });

  it('keeps the retry action at least 44px tall after an inference failure', async () => {
    mocks.streamChatResponse.mockRejectedValueOnce(new Error('Temporary provider failure'));
    render(
      <AiAssistantPanel
        captureCurrentView={() => ({
          image: 'data:image/png;base64,retry-view',
          slice: 1,
          total: 1,
          label: 'Clinical photograph',
          viewSnapshot: testViewSnapshot,
        })}
        studyMetadata={dermatologyStudy}
      />,
    );
    await screen.findByText(/Lesson v1\.0\.0/);

    fireEvent.change(screen.getByLabelText('Question for the AI tutor'), {
      target: { value: 'Please try this view' },
    });
    fireEvent.click(screen.getByLabelText('Send view and question'));

    const retry = await screen.findByRole('button', { name: 'Retry question with current view' });
    expect(retry.className).toContain('min-h-11');
  });

  it.each(['button', 'enter'] as const)('sends the current annotated view once via %s for a single-frame case', async (action) => {
    const exactCurrentView = 'data:image/png;base64,current-frame-with-annotation';
    const captureCurrentView = vi.fn(() => ({
      image: exactCurrentView,
      slice: 1,
      total: 1,
      label: 'Clinical photograph',
      viewSnapshot: testViewSnapshot,
    }));

    render(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        studyMetadata={dermatologyStudy}
      />,
    );

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, {
      target: { value: 'What feature should I notice?' },
    });
    if (action === 'enter') {
      fireEvent.keyDown(input, { key: 'Enter' });
    } else {
      fireEvent.click(screen.getByLabelText('Send view and question'));
    }

    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1));
    expect(captureCurrentView).toHaveBeenCalledTimes(1);
    expect(mocks.streamChatResponse.mock.calls[0][3]).toBe(exactCurrentView);
    expect(mocks.streamChatResponse.mock.calls[0][0]).not.toContain('IMAGE PRE-ANALYSIS');
  });

  it('shows the exact single-frame capture on the learner message while inference is pending', async () => {
    const inferenceGate = deferred<typeof testInferenceResult>();
    mocks.streamChatResponse.mockReturnValueOnce(inferenceGate.promise);
    const exactCurrentView = 'data:image/png;base64,immutable-send-time-view';

    render(
      <AiAssistantPanel
        captureCurrentView={() => ({
          image: exactCurrentView,
          slice: 1,
          total: 1,
          label: 'Clinical photograph',
          viewSnapshot: testViewSnapshot,
        })}
        studyMetadata={dermatologyStudy}
      />,
    );
    await screen.findByText(/Lesson v1\.0\.0/);

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'Use this exact photograph' } });
    fireEvent.click(screen.getByLabelText('Send view and question'));

    const thumbnail = await screen.findByAltText(
      'Captured view sent with this question: Clinical photograph',
    );
    expect(thumbnail.getAttribute('src')).toBe(exactCurrentView);
    expect(thumbnail.className).toContain('object-contain');
    expect(screen.getByText('View 1 of 1 • Clinical photograph')).toBeTruthy();
    expect(screen.getByText('Use this exact photograph')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();

    await act(async () => {
      inferenceGate.resolve(testInferenceResult);
      await inferenceGate.promise;
    });
  });

  it('does not send a text-only request when the current view is unavailable', async () => {
    const captureCurrentView = vi.fn(() => null);

    render(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        studyMetadata={radiologyStudy}
      />,
    );

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'What do you see?' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect((await screen.findByRole('alert')).textContent).toContain('The current view is still loading');
    expect(captureCurrentView).toHaveBeenCalledTimes(1);
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('What do you see?');
  });

  it('captures before delayed lesson resolution and locks out rapid duplicate sends', async () => {
    const casePackage = await caseRegistry.requireCasePackage(dermatologyStudy.studyId);
    const resolvedPlan = await lessonRegistry.requireLessonPlanForCase(casePackage);
    const lessonGate = deferred<typeof resolvedPlan>();
    vi.spyOn(caseRegistry, 'requireCasePackage').mockResolvedValue(casePackage);
    vi.spyOn(lessonRegistry, 'requireLessonPlanForCase').mockImplementation(() => lessonGate.promise);

    let visibleView = 'data:image/png;base64,annotation-at-send';
    const captureCurrentView = vi.fn(() => ({
      image: visibleView,
      slice: 1,
      total: 1,
      label: 'Clinical photograph',
      viewSnapshot: testViewSnapshot,
    }));

    render(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        studyMetadata={dermatologyStudy}
      />,
    );

    const input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'Use this exact annotation' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    visibleView = 'data:image/png;base64,later-view-after-send';
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(captureCurrentView).toHaveBeenCalledTimes(1);
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();

    await act(async () => {
      lessonGate.resolve(resolvedPlan);
      await lessonGate.promise;
    });

    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1));
    expect(mocks.streamChatResponse.mock.calls[0][3]).toBe('data:image/png;base64,annotation-at-send');
    expect(screen.getAllByText('Use this exact annotation')).toHaveLength(1);
  });

  it('isolates an old request from a switched case and its later request', async () => {
    const firstGate = deferred<typeof testInferenceResult>();
    const secondGate = deferred<typeof testInferenceResult>();
    let firstOnChunk: ((...args: any[]) => void) | undefined;
    let secondOnChunk: ((...args: any[]) => void) | undefined;
    mocks.streamChatResponse
      .mockReset()
      .mockImplementationOnce((...args: any[]) => {
        firstOnChunk = args[4];
        return firstGate.promise;
      })
      .mockImplementationOnce((...args: any[]) => {
        secondOnChunk = args[4];
        return secondGate.promise;
      });

    let visibleView = 'data:image/png;base64,first-case-view';
    let currentSnapshot: ReproducibleViewSnapshot = {
      artifactKind: 'image-stack',
      seriesId: 'axial-stack',
      frameId: 'frame-1',
      frameIndex: 0,
      frameCount: 2,
      assetSha256: testViewSnapshot.assetSha256,
      annotation: testViewSnapshot.annotation,
    };
    const captureCurrentView = vi.fn(() => ({
      image: visibleView,
      slice: currentSnapshot.frameIndex + 1,
      total: currentSnapshot.frameCount,
      label: 'Current view',
      viewSnapshot: currentSnapshot,
    }));
    const onJumpToSlice = vi.fn();
    const onPointers = vi.fn();

    const { rerender } = render(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        studyMetadata={radiologyStudy}
        onJumpToSlice={onJumpToSlice}
        onPointers={onPointers}
      />,
    );

    await screen.findByText(/Lesson v1\.0\.0/);
    let input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'First case question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1));

    visibleView = 'data:image/png;base64,second-case-view';
    currentSnapshot = testViewSnapshot;
    rerender(
      <AiAssistantPanel
        captureCurrentView={captureCurrentView}
        studyMetadata={dermatologyStudy}
        onJumpToSlice={onJumpToSlice}
        onPointers={onPointers}
      />,
    );
    await screen.findByText(/Lesson v1\.0\.0/);
    input = screen.getByLabelText('Question for the AI tutor');
    fireEvent.change(input, { target: { value: 'Second case question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(2));

    onJumpToSlice.mockClear();
    onPointers.mockClear();
    const staleSuggestions = {
      highschool: ['Stale follow-up'],
      undergrad: ['Stale follow-up'],
      ms_preclinical: ['Stale follow-up'],
      ms_clinical: ['Stale follow-up'],
      resident: ['Stale follow-up'],
    };
    act(() => {
      firstOnChunk?.(
        'Stale answer',
        undefined,
        [{ name: 'set_cursor_frame', args: { index: 99 } }],
        staleSuggestions,
        undefined,
        [{ x: 99, y: 99, label: 'stale' }],
      );
    });
    await act(async () => {
      firstGate.resolve(testInferenceResult);
      await firstGate.promise;
    });

    expect(screen.queryByText('Stale answer')).toBeNull();
    expect(screen.queryByText('Stale follow-up')).toBeNull();
    expect(onJumpToSlice).not.toHaveBeenCalled();
    expect(onPointers).not.toHaveBeenCalled();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect((screen.getByLabelText('Question for the AI tutor') as HTMLInputElement).disabled).toBe(true);

    const freshSuggestions = {
      highschool: ['Fresh follow-up'],
      undergrad: ['Fresh follow-up'],
      ms_preclinical: ['Fresh follow-up'],
      ms_clinical: ['Fresh follow-up'],
      resident: ['Fresh follow-up'],
    };
    act(() => {
      secondOnChunk?.(
        'Fresh answer',
        undefined,
        [{ name: 'set_cursor_frame', args: { index: 1 } }],
        freshSuggestions,
        undefined,
        [{ x: 25, y: 50, label: 'fresh' }],
      );
    });
    await act(async () => {
      secondGate.resolve(testInferenceResult);
      await secondGate.promise;
    });

    expect(await screen.findByText('Fresh answer')).toBeTruthy();
    expect(await screen.findByText('Fresh follow-up')).toBeTruthy();
    expect(onJumpToSlice).toHaveBeenCalledWith(1);
    expect(onPointers).toHaveBeenCalledWith([{ x: 25, y: 50, label: 'fresh' }]);
  });
});
