import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    fireEvent.change(screen.getAllByLabelText('Opening question')[0], {
      target: { value: 'Begin by naming the visible pattern.' },
    });
    fireEvent.change(screen.getByLabelText('Reviewer name'), {
      target: { value: 'Alex Educator' },
    });
    fireEvent.change(screen.getByLabelText('Credentials'), {
      target: { value: 'MD' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve starter answers/i }));

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

  it('keeps regeneration unavailable while reviewed edits are being saved and approved', async () => {
    let finishSave!: () => void;
    let finishApproval!: () => void;
    const saveDraft = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve; }));
    const approve = vi.fn(() => new Promise<void>(resolve => { finishApproval = resolve; }));
    const regenerate = vi.fn();
    render(<IntroCachePanel caseId="browser-case" status={{ kind: 'ready-for-review', draft: draftCache() }} busy={false}
      generate={vi.fn()} regenerate={regenerate} approve={approve} saveDraft={saveDraft} hasApiKey />);
    fireEvent.change(screen.getAllByLabelText('Opening question')[0], { target: { value: 'Reviewed question' } });
    fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Alex Educator' } });
    fireEvent.change(screen.getByLabelText('Credentials'), { target: { value: 'MD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve starter answers' }));
    expect(screen.getByRole('button', { name: 'Regenerate draft answers' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Save edits' }).matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate draft answers' }));
    expect(regenerate).not.toHaveBeenCalled();
    await act(async () => finishSave());
    expect(approve).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Regenerate draft answers' }).matches(':disabled')).toBe(true);
    await act(async () => finishApproval());
    expect(screen.getByRole('button', { name: 'Regenerate draft answers' }).matches(':disabled')).toBe(false);
  });

  it('does not approve after unmounting during the preceding edit save', async () => {
    let finishSave!: () => void;
    const approve = vi.fn();
    const onReviewBusyChange = vi.fn();
    const view = render(<IntroCachePanel caseId="browser-case" status={{ kind: 'ready-for-review', draft: draftCache() }} busy={false}
      generate={vi.fn()} regenerate={vi.fn()} approve={approve} hasApiKey onReviewBusyChange={onReviewBusyChange}
      saveDraft={() => new Promise<void>(resolve => { finishSave = resolve; })} />);
    fireEvent.change(screen.getAllByLabelText('Opening question')[0], { target: { value: 'Reviewed question' } });
    fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Alex Educator' } });
    fireEvent.change(screen.getByLabelText('Credentials'), { target: { value: 'MD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve starter answers' }));
    expect(onReviewBusyChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    await act(async () => finishSave());
    expect(approve).not.toHaveBeenCalled();
    expect(onReviewBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('preserves unsaved edits across an equivalent cache refresh', () => {
    const draft = draftCache();
    const shared = { caseId: 'browser-case', busy: false, generate: vi.fn(), regenerate: vi.fn(), approve: vi.fn(), saveDraft: vi.fn(), hasApiKey: true };
    const view = render(<IntroCachePanel {...shared} status={{ kind: 'ready-for-review', draft }} />);
    fireEvent.change(screen.getAllByLabelText('Opening question')[0], { target: { value: 'Unsaved educator correction' } });
    view.rerender(<IntroCachePanel {...shared} status={{ kind: 'ready-for-review', draft: structuredClone(draft) }} />);
    expect((screen.getAllByLabelText('Opening question')[0] as HTMLTextAreaElement).value).toBe('Unsaved educator correction');
    expect(screen.getByRole('button', { name: 'Save edits' }).matches(':disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Load latest answers' })).toBeNull();
  });

  it('preserves conflicting edits until the educator explicitly loads the latest answers', () => {
    const shared = { caseId: 'browser-case', busy: false, generate: vi.fn(), regenerate: vi.fn(), approve: vi.fn(), saveDraft: vi.fn(), hasApiKey: true };
    const view = render(<IntroCachePanel {...shared} status={{ kind: 'ready-for-review', draft: draftCache() }} />);
    fireEvent.change(screen.getAllByLabelText('Opening question')[0], { target: { value: 'Unsaved educator correction' } });
    fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Alex Educator' } });
    fireEvent.change(screen.getByLabelText('Credentials'), { target: { value: 'MD' } });
    const stored = draftCache();
    const changed = { ...stored, levels: { ...stored.levels, highschool: { ...stored.levels.highschool, introPrompt: 'Another stored question' } } };
    view.rerender(<IntroCachePanel {...shared} status={{ kind: 'ready-for-review', draft: changed }} />);
    expect((screen.getAllByLabelText('Opening question')[0] as HTMLTextAreaElement).value).toBe('Unsaved educator correction');
    expect(screen.getByRole('button', { name: 'Save edits' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Approve starter answers' }).matches(':disabled')).toBe(true);
    const latest = structuredClone(changed);
    latest.levels.highschool.introPrompt = 'Latest stored question';
    view.rerender(<IntroCachePanel {...shared} status={{ kind: 'stale', cache: latest }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load latest answers' }));
    expect((screen.getAllByLabelText('Opening question')[0] as HTMLTextAreaElement).value).toBe('Latest stored question');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
