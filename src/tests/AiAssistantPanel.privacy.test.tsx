// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistantPanel from '../components/AiAssistantPanel';

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

describe('AiAssistantPanel image transmission privacy', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.hasKey.mockReturnValue(true);
    mocks.streamChatResponse.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not call a model when a connected user opens, reconnects, or switches cases', async () => {
    const captureCurrentView = vi.fn(() => ({
      image: 'data:image/png;base64,unused',
      slice: 1,
      total: 1,
      label: 'Clinical photograph',
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

  it.each(['button', 'enter'] as const)('sends the current annotated view once via %s for a single-frame case', async (action) => {
    const exactCurrentView = 'data:image/png;base64,current-frame-with-annotation';
    const captureCurrentView = vi.fn(() => ({
      image: exactCurrentView,
      slice: 1,
      total: 1,
      label: 'Clinical photograph',
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
});
