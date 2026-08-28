import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import IntroCachePanel from '../components/CaseStudio/IntroCachePanel';
import {
  INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
  INTRO_CACHE_SCHEMA,
  INTRO_CACHE_SCHEMA_VERSION,
  type IntroCacheV1,
} from '../core/introCache';

function draftCache(): IntroCacheV1 {
  const level = {
    introPrompt: 'What do you notice first?',
    introQuestions: [{
      id: 'notice-first',
      label: 'What should I notice?',
      prompt: 'What should I notice first?',
      cachedAnswer: 'Start with the central finding. Educational use only.',
    }],
  };
  return {
    schema: INTRO_CACHE_SCHEMA,
    schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
    caseId: 'browser-case',
    lessonPlanSha256: 'a'.repeat(64),
    provenance: {
      modelId: 'test/model',
      systemPromptSha256: 'b'.repeat(64),
      requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
      mediaSha: 'c'.repeat(64),
      generatedAt: '2026-08-28T12:00:00.000Z',
    },
    review: { status: 'draft' },
    levels: {
      highschool: level,
      undergrad: level,
      ms_preclinical: level,
      ms_clinical: level,
      resident: level,
    },
  };
}

describe('IntroCachePanel', () => {
  afterEach(() => cleanup());

  it('offers a direct OpenRouter connection when generation needs a key', () => {
    const onConnectOpenRouter = vi.fn();
    render(
      <IntroCachePanel
        caseId="browser-case"
        status={{ kind: 'idle' }}
        busy={false}
        generate={vi.fn()}
        regenerate={vi.fn()}
        approve={vi.fn()}
        saveDraft={vi.fn()}
        hasApiKey={false}
        onConnectOpenRouter={onConnectOpenRouter}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect OpenRouter' }));
    expect(onConnectOpenRouter).toHaveBeenCalledTimes(1);
  });

  it('saves hand edits before approving the reviewed artifact', async () => {
    const saveDraft = vi.fn(async () => undefined);
    const approve = vi.fn(async () => undefined);
    render(
      <IntroCachePanel
        caseId="browser-case"
        status={{ kind: 'ready-for-review', draft: draftCache() }}
        busy={false}
        generate={vi.fn()}
        regenerate={vi.fn()}
        approve={approve}
        saveDraft={saveDraft}
        hasApiKey
      />,
    );

    fireEvent.change(screen.getAllByLabelText('Intro prompt (Markdown)')[0], {
      target: { value: 'Begin by naming the visible pattern.' },
    });
    fireEvent.change(screen.getByLabelText('Reviewer name'), {
      target: { value: 'Alex Educator' },
    });
    fireEvent.change(screen.getByLabelText('Credentials'), {
      target: { value: 'MD' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve intro cache/i }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith({
      name: 'Alex Educator',
      credentials: 'MD',
    }));
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      levels: expect.objectContaining({
        highschool: expect.objectContaining({
          introPrompt: 'Begin by naming the visible pattern.',
        }),
      }),
    }));
    expect(saveDraft.mock.invocationCallOrder[0]).toBeLessThan(approve.mock.invocationCallOrder[0]);
  });
});
