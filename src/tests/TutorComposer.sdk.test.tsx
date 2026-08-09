import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArtifactReference, CaseMaterial, RunTurnInput, RunTurnResult } from '../../packages/core/src/index';
import { TutorComposer } from '../../packages/react/src/index';

const material: CaseMaterial = Object.freeze({
  id: 'synthetic-test-case',
  title: 'Synthetic test case',
  domainId: 'test-domain',
  casePackage: Object.freeze({ synthetic: true }),
  lessonId: 'test-lesson',
});

const artifact: ArtifactReference = Object.freeze({
  id: 'current-view',
  label: 'Frame at submit',
  mimeType: 'image/png',
  sha256: 'b'.repeat(64),
});

const result: RunTurnResult = Object.freeze({
  text: 'What visible feature supports that observation?',
  turnId: 'turn-1',
  promptSha256: 'a'.repeat(64),
  modelId: 'local-test-model',
  finishReason: 'stop',
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TutorComposer SDK component', () => {
  it('captures the current view synchronously before starting the engine turn', async () => {
    const order: string[] = [];
    let observedInput: RunTurnInput | undefined;
    const captureCurrentView = vi.fn(() => {
      order.push('capture');
      return artifact;
    });
    const runTurn = vi.fn(async (input: RunTurnInput) => {
      order.push('runTurn');
      observedInput = input;
      return result;
    });

    render(
      <TutorComposer
        engine={{ runTurn }}
        material={material}
        captureCurrentView={captureCurrentView}
        learnerLevel="undergrad"
        mode="chat"
      />,
    );

    fireEvent.change(screen.getByLabelText('Your observation or question'), {
      target: { value: 'The circle overlaps both other shapes.' },
    });
    const sendButton = screen.getByRole('button', { name: 'Send with current view' });
    sendButton.focus();
    fireEvent.click(sendButton);

    expect(order).toEqual(['capture', 'runTurn']);
    await screen.findByText(result.text);
    expect(observedInput).toMatchObject({
      caseId: material.id,
      learnerMessage: 'The circle overlaps both other shapes.',
      artifact,
      learnerLevel: 'undergrad',
      mode: 'chat',
      hasImage: true,
      historyWindowMessages: [],
    });
    expect(screen.getByText('Current view: Frame at submit')).toBeTruthy();
    expect(screen.getByRole('log', { name: 'Tutor conversation' })).toBeTruthy();
    expect(document.activeElement).toBe(sendButton);
  });

  it('suppresses rapid duplicate submits before React can re-render busy state', async () => {
    let resolveTurn: ((value: RunTurnResult) => void) | undefined;
    const runTurn = vi.fn(() => new Promise<RunTurnResult>((resolve) => { resolveTurn = resolve; }));
    const captureCurrentView = vi.fn(() => artifact);
    render(<TutorComposer engine={{ runTurn }} material={material} captureCurrentView={captureCurrentView} />);
    fireEvent.change(screen.getByLabelText('Your observation or question'), { target: { value: 'One turn only' } });
    const form = screen.getByRole('button', { name: 'Send with current view' }).closest('form')!;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(captureCurrentView).toHaveBeenCalledTimes(1);
    expect(runTurn).toHaveBeenCalledTimes(1);

    await act(async () => { resolveTurn?.(result); });
    expect(await screen.findByText(result.text)).toBeTruthy();
  });

  it('does not capture or run inference for an empty message', () => {
    const captureCurrentView = vi.fn(() => artifact);
    const runTurn = vi.fn(async () => result);
    render(
      <TutorComposer
        engine={{ runTurn }}
        material={material}
        captureCurrentView={captureCurrentView}
      />,
    );

    fireEvent.submit(screen.getByRole('button', { name: 'Send with current view' }).closest('form')!);

    expect(screen.getByRole('alert').textContent).toContain('Enter an observation');
    expect(captureCurrentView).not.toHaveBeenCalled();
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('fails locally when capture returns null and never calls the engine', () => {
    const runTurn = vi.fn(async () => result);
    render(
      <TutorComposer
        engine={{ runTurn }}
        material={material}
        captureCurrentView={() => null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Your observation or question'), {
      target: { value: 'A valid observation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send with current view' }));

    expect(screen.getByRole('alert').textContent).toContain('current view could not be captured');
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('never renders an arbitrary adapter error value', async () => {
    const runTurn = vi.fn(async () => {
      throw new Error('Bearer sk-sensitive-value');
    });
    render(
      <TutorComposer
        engine={{ runTurn }}
        material={material}
        captureCurrentView={() => artifact}
      />,
    );

    fireEvent.change(screen.getByLabelText('Your observation or question'), {
      target: { value: 'A valid observation' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send with current view' }));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe('The tutor could not complete this request. Try again.');
    expect(document.body.textContent).not.toContain('sk-sensitive-value');
  });
});
