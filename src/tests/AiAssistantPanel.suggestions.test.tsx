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
      resident: levelEntry,
    },
  };
}

async function renderPanel() {
  render(
    <AiAssistantPanel
      captureCurrentView={() => capturedView}
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

  describe('label gating (fix 1)', () => {
    it('hides the "Free · instant · no key" tag when connected to OpenRouter', async () => {
      mocks.hasKey.mockReturnValue(true);
      await renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/Suggested Follow-ups/i)).toBeTruthy();
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
