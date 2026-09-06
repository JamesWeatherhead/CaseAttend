// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistantPanel from '../components/AiAssistantPanel';
import type { IntroCacheV1 } from '../core/introCache';
import type { LearnerLevel } from '../constants';

// Bug fixes covered here (see issue #75):
//  1. The "Free · instant · no key" tag is hidden once a key is connected.
//  2. Dynamic per-turn suggestions win over the pre-cached intro chips once a
//     keyed learner has had at least one live model turn.
//
// The suggestion state machine is driven by two panel-owned signals:
//   - byokConnected (from hasKey() + BYOK_CHANGED_EVENT)
//   - dynamicSuggestionsMap (only set from the live stream's suggestionsPayload)
// so exercising those two is enough to cover the required behaviours without
// spinning up a full inference round.

const mocks = vi.hoisted(() => ({
  streamChatResponse: vi.fn(),
  hasKey: vi.fn(() => true),
  loadIntroCache: vi.fn(),
}));

vi.mock('../services/aiClient', () => ({
  SafeInferenceError: class SafeInferenceError extends Error {},
  streamChatResponse: mocks.streamChatResponse,
}));

vi.mock('../services/byokStore', () => ({
  BYOK_CHANGED_EVENT: 'caseattend:byok-changed',
  getModel: () => 'openai/gpt-4.1-mini',
  hasKey: mocks.hasKey,
  modelLabel: () => 'Test vision model',
  setModel: vi.fn(),
  clearKey: () => {
    mocks.hasKey.mockReturnValue(false);
    window.dispatchEvent(new Event('caseattend:byok-changed'));
  },
  MODEL_OPTIONS: [{ id: 'openai/gpt-4.1-mini', label: 'Test vision model' }],
}));

vi.mock('../services/introCacheStore', () => ({
  loadIntroCache: mocks.loadIntroCache,
}));

vi.mock('../lib/domains', () => ({
  getDomain: () => ({
    key: 'radiology',
    artifactHints: {
      showWindowLevel: true,
      showSeriesSelector: true,
      showSegmentation: true,
    },
    welcomeMessage: () => 'Welcome',
    getInitialSuggestions: () => ['Domain fallback question A'],
    contextLabel: (modality: string) => modality,
    captureLabel: () => 'Medical image',
  }),
}));

const CASE_HASH = '1'.repeat(64);
const LESSON_HASH = '2'.repeat(64);
const ASSET_HASH = '5'.repeat(64);
const PROMPT_HASH = '6'.repeat(64);

const study = {
  studyId: 'ct-epidural',
  description: 'Epidural hematoma',
  modality: 'CT',
  domain: 'radiology' as const,
};

const sessionContext = {
  casePackageRef: { id: 'ct-epidural', schemaVersion: '1.0' as const, sha256: CASE_HASH },
  lessonPlanRef: { id: 'ct-epidural-lesson', version: '1.0.0', sha256: LESSON_HASH },
};

const capturedView = {
  image: 'data:image/png;base64,PLACEHOLDER',
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

function makeIntroCache(): IntroCacheV1 {
  const levelEntry = {
    introPrompt: 'Welcome to the epidural hematoma case.',
    introQuestions: [
      { id: 'q1', label: 'What is an epidural hematoma?', prompt: 'What is an epidural hematoma?', cachedAnswer: 'A collection of blood between the skull and dura.' },
      { id: 'q2', label: 'What causes it?', prompt: 'What causes it?', cachedAnswer: 'Usually trauma with a middle meningeal artery tear.' },
      { id: 'q3', label: 'How is it treated?', prompt: 'How is it treated?', cachedAnswer: 'Educational content, not treatment advice.' },
    ],
  };
  return {
    schema: 'caseattend.intro-cache' as const,
    schemaVersion: '1.0' as const,
    caseId: 'ct-epidural',
    lessonPlanSha256: 'a'.repeat(64),
    provenance: {
      modelId: 'anthropic/claude-opus-4',
      systemPromptSha256: 'b'.repeat(64),
      requestTemplateVersion: '1.0' as const,
      mediaSha: 'c'.repeat(64),
      generatedAt: '2026-08-13T00:00:00.000Z',
    },
    review: {
      status: 'approved',
      reviewer: 'James Weatherhead',
      credentials: 'MD, PhD candidate',
      reviewedAt: '2026-08-13T00:00:00.000Z',
    },
    levels: {
      highschool: levelEntry,
      undergrad: levelEntry,
      ms_preclinical: levelEntry,
      ms_clinical: levelEntry,
      ms_step2: levelEntry,
      resident: levelEntry,
    },
  };
}

async function renderPanel() {
  const captureCurrentView = vi.fn(() => capturedView);
  const view = render(
    <AiAssistantPanel
      captureCurrentView={captureCurrentView}
      sessionContext={sessionContext}
      studyMetadata={study}
    />,
  );
  // Lesson resolution is async (case package + lesson plan); block on the
  // chip that only appears once the lesson is ready before probing chips.
  await screen.findByText(/Lesson v1\.0\.0/);
  // Give the intro-cache promise chain a chance to resolve + re-render.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { ...view, captureCurrentView };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('AiAssistantPanel suggested follow-ups', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.hasKey.mockReturnValue(true);
    mocks.loadIntroCache.mockResolvedValue(makeIntroCache());
    mocks.streamChatResponse.mockResolvedValue({
      promptSha256: PROMPT_HASH,
      provider: 'openrouter' as const,
      model: 'openai/gpt-4.1-mini',
      latencyMs: 12,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each(['pointer', 'touch', 'keyboard'])('reveals a reviewed answer from %s at its beginning without capture or inference', async (interaction) => {
    mocks.hasKey.mockReturnValue(false);
    const { captureCurrentView } = await renderPanel();
    const chat = screen.getByRole('log');
    vi.spyOn(chat, 'scrollHeight', 'get').mockReturnValue(2000);
    vi.spyOn(chat, 'clientHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.getAttribute('data-tutor-message')?.endsWith('-model') ? 800 : 100;
      return { top, bottom: top + 300, left: 0, right: 300, width: 300, height: 300, x: 0, y: top, toJSON: () => ({}) };
    });
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const question = screen.getByRole('button', { name: 'Show pre-cached answer for: What is an epidural hematoma?' });
    if (interaction === 'pointer') fireEvent.pointerDown(question);
    if (interaction === 'touch') fireEvent.touchStart(question);
    if (interaction === 'keyboard') question.focus();
    fireEvent.click(question, { detail: interaction === 'keyboard' ? 0 : 1 });
    const answer = await screen.findByRole('article', { name: 'Reviewed starter answer' });
    expect(answer.textContent).toBe('A collection of blood between the skull and dura.');
    expect(document.activeElement).toBe(answer);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(chat.scrollTop).toBe(688);
    await act(async () => {});
    expect(chat.scrollTop).toBe(688);
    expect(captureCurrentView).not.toHaveBeenCalled();
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('Your level')).toHaveLength(1);
    expect(document.querySelectorAll('[data-tour-id="ai-suggestions"]')).toHaveLength(1);

    const introduction = screen.getByText('Case introduction').closest('details')!;
    introduction.open = true;
    fireEvent(introduction, new Event('toggle'));
    chat.scrollTop = 1000;
    fireEvent.click(screen.getByRole('button', { name: 'Clear chat and start a new conversation' }));
    expect(await screen.findByRole('heading', { name: 'Start with a free question' })).toBeTruthy();
    expect(introduction.open).toBe(false);
    expect(chat.scrollTop).toBe(0);
    expect(screen.queryByRole('article', { name: 'Reviewed starter answer' })).toBeNull();
  });

  it('uses distinct level questions and preserves the original introduction after an exchange', async () => {
    const base = makeIntroCache();
    const cache: IntroCacheV1 = { ...base, levels: { ...base.levels,
      highschool: { introPrompt: 'High school introduction.', introQuestions: [{ id: 'hs', label: 'High school question', prompt: 'High school prompt.', cachedAnswer: 'High school answer.' }] },
      resident: { introPrompt: 'Resident introduction.', introQuestions: [{ id: 'resident', label: 'Resident question', prompt: 'Resident prompt.', cachedAnswer: 'Resident answer.' }] },
    } };
    mocks.hasKey.mockReturnValue(false);
    mocks.loadIntroCache.mockResolvedValue(cache);
    await renderPanel();
    fireEvent.change(screen.getByLabelText('Your level'), { target: { value: 'highschool' } });
    await screen.findByRole('button', { name: 'Show pre-cached answer for: High school question' });
    expect(screen.getByText('High school introduction.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your level'), { target: { value: 'resident' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Show pre-cached answer for: Resident question' }));
    expect(await screen.findByText('Resident answer.')).toBeTruthy();
    expect(screen.getByText('Resident prompt.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your level'), { target: { value: 'highschool' } });
    expect(screen.getByText('Resident introduction.')).toBeTruthy();
    expect(screen.queryByText('High school introduction.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show pre-cached answer for: High school question' })).toBeTruthy();
    mocks.hasKey.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('caseattend:byok-changed')));
    fireEvent.change(screen.getByLabelText('Question for the AI tutor'), { target: { value: 'Continue the lesson.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send view and question' }));
    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalledTimes(1));
    expect(mocks.streamChatResponse.mock.calls[0][0]).toContain('Resident introduction.');
    expect(mocks.streamChatResponse.mock.calls[0][0]).toContain('Resident answer.');
    expect(mocks.streamChatResponse.mock.calls[0][2]).toBe('highschool');
  });

  it.each(['missing', 'rejected'])('distinguishes loading from %s starter answers without suggesting a free live call', async (outcome) => {
    mocks.hasKey.mockReturnValue(false);
    const gate = deferred<IntroCacheV1 | null>();
    mocks.loadIntroCache.mockReturnValue(gate.promise);
    await renderPanel();
    expect(screen.getByText('Loading starter questions…')).toBeTruthy();
    expect(screen.queryByText('Free · instant · no key')).toBeNull();
    expect(screen.queryByRole('button', { name: /Send suggested question/ })).toBeNull();
    await act(async () => { if (outcome === 'missing') gate.resolve(null); else gate.reject(new Error('offline')); });
    expect(await screen.findByText(/Free starter answers aren’t available/)).toBeTruthy();
    expect(screen.queryByText('Loading starter questions…')).toBeNull();
    expect(screen.queryByRole('button', { name: /pre-cached answer/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect to ask your own question' })).toBeTruthy();
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
  });

  it('discards an earlier case’s delayed cache after a case switch', async () => {
    const oldCache = deferred<IntroCacheV1 | null>();
    const base = makeIntroCache();
    const nextCache: IntroCacheV1 = { ...base, caseId: 'ct-subdural', levels: { ...base.levels,
      ms_preclinical: { introPrompt: 'Current case introduction.', introQuestions: [{ id: 'new', label: 'Current case question', prompt: 'Current case prompt.', cachedAnswer: 'Current case answer.' }] },
    } };
    mocks.hasKey.mockReturnValue(false);
    mocks.loadIntroCache.mockImplementation(id => id === study.studyId ? oldCache.promise : Promise.resolve(nextCache));
    const { rerender, captureCurrentView } = await renderPanel();
    rerender(<AiAssistantPanel captureCurrentView={captureCurrentView} studyMetadata={{ ...study, studyId: 'ct-subdural' }} />);
    await screen.findByRole('button', { name: 'Show pre-cached answer for: Current case question' });
    await act(async () => oldCache.resolve(makeIntroCache()));
    expect(screen.queryByRole('button', { name: 'Show pre-cached answer for: What is an epidural hematoma?' })).toBeNull();
    expect(screen.getByText('Current case introduction.')).toBeTruthy();
  });

  it('returns focus to Connect after disconnecting removes the Change trigger', async () => {
    await renderPanel();
    const change = screen.getByRole('button', { name: 'Change' });
    change.focus();
    fireEvent.click(change);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect OpenRouter' }));
    expect(change.isConnected).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Connect to ask your own question' }));
    expect(mocks.streamChatResponse).not.toHaveBeenCalled();
  });

  it.each(['scroll away', 'pause near bottom'])('respects %s while streaming and resumes only after Jump to latest', async (interaction) => {
    const gate = deferred<{ provider: 'openrouter'; model: string; latencyMs: number; promptSha256: string }>();
    let chunk!: (text: string) => void;
    mocks.streamChatResponse.mockImplementation((...args: any[]) => { chunk = args[4]; return gate.promise; });
    await renderPanel();
    const chat = screen.getByRole('log');
    let height = 2000;
    vi.spyOn(chat, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(chat, 'clientHeight', 'get').mockReturnValue(300);
    fireEvent.change(screen.getByLabelText('Question for the AI tutor'), { target: { value: 'Explain the image.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send view and question' }));
    await waitFor(() => expect(mocks.streamChatResponse).toHaveBeenCalled());
    expect(screen.getByLabelText('Your level')).toHaveProperty('disabled', true);
    if (interaction === 'scroll away') {
      fireEvent.wheel(chat);
      chat.scrollTop = 240;
      fireEvent.scroll(chat);
    } else {
      chat.scrollTop = height - 300;
      fireEvent.pointerDown(chat);
      expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
      height = 2500;
    }
    act(() => chunk('First part of the response.'));
    expect(chat.scrollTop).toBe(interaction === 'scroll away' ? 240 : 1700);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    expect(chat.scrollTop).toBe(height);
    height = 2900;
    act(() => chunk(' Another part of the response.'));
    expect(chat.scrollTop).toBe(2900);
    await act(async () => gate.resolve({ provider: 'openrouter', model: 'openai/gpt-4.1-mini', latencyMs: 12, promptSha256: PROMPT_HASH }));
    expect(screen.getByLabelText('Your level')).toHaveProperty('disabled', false);
  });

  describe('label gating (fix 1)', () => {
    it('hides the "Free · instant · no key" tag when connected to OpenRouter', async () => {
      mocks.hasKey.mockReturnValue(true);
      await renderPanel();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Choose a first question' })).toBeTruthy();
      });
      expect(screen.queryByText(/Free · instant · no key/)).toBeNull();
    });

    it('shows the tag when no key is connected and intro cache is available', async () => {
      mocks.hasKey.mockReturnValue(false);
      await renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/Free · instant · no key/)).toBeTruthy();
      });
    });

    it('drops the tag when the learner connects a key via BYOK_CHANGED_EVENT', async () => {
      mocks.hasKey.mockReturnValue(false);
      await renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/Free · instant · no key/)).toBeTruthy();
      });

      mocks.hasKey.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('caseattend:byok-changed'));
      });

      await waitFor(() => {
        expect(screen.queryByText(/Free · instant · no key/)).toBeNull();
      });
    });
  });

  describe('suggestion source precedence (fix 2)', () => {
    it('shows the pre-cached intro chips when no key is connected', async () => {
      mocks.hasKey.mockReturnValue(false);
      await renderPanel();

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /pre-cached answer for/i }).length).toBeGreaterThan(0);
      });
      expect(screen.getByText('What is an epidural hematoma?')).toBeTruthy();
    });

    it('still shows the pre-cached intro chips when connected but before any live turn', async () => {
      mocks.hasKey.mockReturnValue(true);
      await renderPanel();

      // The pre-cached suggestions are still an acceptable opener before the
      // first live turn; only the tag flips off, not the chips themselves.
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /pre-cached answer for/i }).length).toBeGreaterThan(0);
      });
      expect(screen.getByText('What is an epidural hematoma?')).toBeTruthy();
    });

    it('promotes dynamic follow-ups over the intro cache after a live turn', async () => {
      mocks.hasKey.mockReturnValue(true);
      const dynamicSuggestions: Record<LearnerLevel, string[]> = {
        highschool: ['HS q1', 'HS q2', 'HS q3'],
        undergrad: ['UG q1', 'UG q2', 'UG q3'],
        ms_preclinical: ['Dynamic MS1 q1', 'Dynamic MS1 q2', 'Dynamic MS1 q3'],
        ms_clinical: ['MS3 q1', 'MS3 q2', 'MS3 q3'],
        ms_step2: ['MS3 q1', 'MS3 q2', 'MS3 q3'],
        resident: ['Res q1', 'Res q2', 'Res q3'],
      };
      mocks.streamChatResponse.mockImplementation(async (
        _message: unknown,
        _mode: unknown,
        _learnerLevel: unknown,
        _image: unknown,
        onChunk: (
          text: string,
          sources?: unknown,
          toolCalls?: unknown,
          allLevelSuggestions?: Record<LearnerLevel, string[]>,
        ) => void,
      ) => {
        onChunk('Tutor answer text.');
        onChunk('', undefined, undefined, dynamicSuggestions);
        return {
          promptSha256: PROMPT_HASH,
          provider: 'openrouter' as const,
          model: 'openai/gpt-4.1-mini',
          latencyMs: 12,
        };
      });

      await renderPanel();

      // Baseline: the intro-cache chips are what a connected learner sees before
      // the first live turn.
      await waitFor(() => {
        expect(screen.getByText('What is an epidural hematoma?')).toBeTruthy();
      });

      const composer = screen.getByLabelText('Question for the AI tutor') as HTMLTextAreaElement;
      fireEvent.change(composer, { target: { value: 'Where is the lens visible on this MRI?' } });
      // The composer submits on Enter (see AiAssistantPanel keyboard handler).
      fireEvent.keyDown(composer, { key: 'Enter' });
      // Let the stream callback + setDynamicSuggestionsMap flush.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // After the live turn, the dynamic chips take precedence over the intro
      // cache and the intro-cache label copy disappears from the chip set.
      await waitFor(() => {
        expect(screen.getByText('Dynamic MS1 q1')).toBeTruthy();
      });
      expect(screen.queryByText('What is an epidural hematoma?')).toBeNull();
      // The connected-user path never shows the free/instant tag.
      expect(screen.queryByText(/Free · instant · no key/)).toBeNull();
    });
  });
});
