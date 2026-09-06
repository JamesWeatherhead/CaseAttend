// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ParticipantMode, {
  type ParticipantLaunchConfig,
  type ParticipantModeProps,
} from '../components/ParticipantMode/ParticipantMode';
import type { ParticipantTaskRecorder } from '../components/ParticipantTaskFlow/ParticipantTaskFlow';
import DeferredFeature, { deferFeature } from '../components/DeferredFeature';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function config(overrides: Partial<ParticipantLaunchConfig> = {}): ParticipantLaunchConfig {
  const base: ParticipantLaunchConfig = {
    studyTitle: 'Visual reasoning pilot',
    manifestRef: { id: 'visual-reasoning-pilot', version: '1.0.0', sha256: HASH_A },
    assignmentSummary: 'Fixed assignment to the configured arm.',
    arms: [{
      id: 'question-first',
      label: 'Question-first tutor',
      caseRef: { id: 'derm-pattern-01', manifestSha256: HASH_B },
      lessonRef: { id: 'derm-pattern-01-lesson', version: '1.0.0', sha256: HASH_C },
      provider: 'Example provider',
      model: 'example-vlm-1',
      temperature: 0.2,
      topP: 1,
      learnerLevel: 'undergrad',
      captureSummary: 'The current teaching image and your annotations are sent when you ask the tutor.',
    }],
    providerDestinations: [{
      gateway: 'OpenRouter',
      gatewayUrl: 'https://openrouter.ai/api/v1/chat/completions',
      upstreamProvider: 'Example provider',
      policyUrl: 'https://provider.example/privacy',
    }],
    participantInformation: {
      version: '1.0.0',
      language: 'en',
      keyInformation: 'You are invited to a visual teaching activity.',
      purpose: 'Study visual reasoning education.',
      procedures: 'Review one visual teaching case. You may exit at any time.',
      risks: 'The AI can be inaccurate.',
      benefits: 'You may receive no direct benefit.',
      privacy: 'A pseudonymous reference and structured events are stored in this browser.',
      voluntaryParticipation: 'Participation is voluntary.',
      compensation: 'No compensation.',
      vlmDisclosure: {
        term: 'vision-language model (VLM)',
        plainLanguage: 'A vision-language model, or VLM, is an AI model that can interpret images and words together. Many current frontier models are VLMs, but the terms are not synonyms.',
        limitations: 'It can miss details or invent facts.',
        notMedicalAdvice: true,
      },
      contacts: [{ name: 'Research Office', role: 'Study contact', email: 'research@example.edu' }],
      acknowledgement: { kind: 'required' },
    },
    dataFields: ['structured learner actions', 'outcome responses'],
    rawChatEnabled: false,
    retentionSummary: 'Retain for 30 days, then delete from the research browser.',
    institutionDetermined: true,
  };
  return { ...base, ...overrides };
}

function props(overrides: Partial<ParticipantModeProps> = {}): ParticipantModeProps {
  return {
    config: config(),
    storageStatus: {
      persistent: true,
      launchAllowed: true,
      message: 'Research records are stored persistently in this browser.',
    },
    inferenceReady: true,
    onStart: vi.fn(async () => ({ participantReference: 'participant:derived-reference', armId: 'question-first' })),
    onExit: vi.fn(),
    ...overrides,
  };
}

describe('ParticipantMode', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps task progress and safe exit when a required tool fails to download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const download = deferred<{ default: React.FC }>();
    const load = deferFeature(() => download.promise);
    const end = vi.fn().mockRejectedValueOnce(new Error('Final record unavailable')).mockResolvedValueOnce(undefined);
    const onStart = vi.fn(async () => ({
      participantReference: 'participant:derived-reference',
      armId: 'question-first',
      taskFlow: {
        tasks: { pre: [{ id: 'baseline', title: 'Baseline check', instructions: 'Read before continuing.', response: { kind: 'none' as const } }], post: [] },
        recorder: { record: vi.fn(), end } as unknown as ParticipantTaskRecorder,
      },
    }));
    const cancel = vi.fn(async () => {});
    function Session() {
      const [ready, setReady] = React.useState(false);
      const [exited, setExited] = React.useState(false);
      return exited ? <div>Returned to cases</div> : <ParticipantMode {...props({
        onStart,
        activityReady: ready,
        cancelInferenceAndWait: cancel,
        onExit: async () => { await end('withdrawn'); setExited(true); },
        renderActivity: () => <DeferredFeature label="tutor" component={load} allowReload={false} onReadyChange={setReady}>
          {Tutor => <Tutor />}
        </DeferredFeature>,
      })} />;
    }
    render(<Session />);
    fireEvent.change(screen.getByLabelText('Pseudonymous participant code'), { target: { value: '01234-56789-ABCDEFGHJK' } });
    fireEvent.click(screen.getByLabelText(/I read the participant information/));
    fireEvent.click(screen.getByRole('button', { name: 'Start study session' }));
    await screen.findByRole('heading', { name: 'Baseline check' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to activity' }));
    await screen.findByRole('heading', { name: 'Opening the tutor' });
    expect(screen.getByRole('button', { name: 'Finish study activity' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Exit study' }).matches(':disabled')).toBe(false);
    await act(async () => { download.reject(new Error('offline')); });
    expect(await screen.findByRole('heading', { name: "Couldn't load the tutor" })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Baseline check' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Finish study activity' }));
    expect(end).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Exit study' }));
    await screen.findByText('Final record unavailable');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: "Couldn't load the tutor" })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exit study' }));
    await screen.findByText('Returned to cases');
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenLastCalledWith('withdrawn');
  });

  it('shows the exact locked disclosures without catalog, authoring, model, level, or general data controls', () => {
    render(<ParticipantMode {...props()} />);

    expect(screen.getByText('Visual reasoning pilot')).toBeTruthy();
    expect(screen.getByText(/locked to one frozen study configuration/)).toBeTruthy();
    expect(screen.getByText('Not recorded')).toBeTruthy();
    expect(screen.queryByText(/case b{64}; lesson c{64}/i)).toBeNull();
    expect(screen.queryByText('Question-first tutor')).toBeNull();
    expect(screen.queryByText('example-vlm-1')).toBeNull();
    expect(screen.getByRole('link', { name: 'Example provider' }).getAttribute('href')).toBe('https://provider.example/privacy');
    expect(screen.getByText(/key is stored in this browser and sent only to OpenRouter/i)).toBeTruthy();
    expect(screen.getByText(/cannot verify eligibility, prevent code reuse/i)).toBeTruthy();
    expect(screen.getByText(/intentionally hidden until the session starts/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Create a case|Create a lesson|Session data/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /model|level|case/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Exit study' })).toBeTruthy();
  });

  it('blocks launch when persistent storage or an external institutional determination is missing', () => {
    const onStart = vi.fn();
    const { rerender } = render(<ParticipantMode {...props({
      config: config({ institutionDetermined: false }),
      onStart,
    })} />);

    expect(screen.getByRole('alert').textContent).toContain('institution');
    expect(screen.getByLabelText('Pseudonymous participant code').matches(':disabled')).toBe(true);

    rerender(<ParticipantMode {...props({
      storageStatus: {
        persistent: false,
        launchAllowed: false,
        message: 'Memory-only mode.',
      },
      onStart,
    })} />);
    expect(screen.getByRole('alert').textContent).toContain('persistent browser storage');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('blocks before recorder start when this browser has no OpenRouter key', () => {
    const onStart = vi.fn();
    render(<ParticipantMode {...props({ inferenceReady: false, onStart })} />);

    const blocker = screen.getByRole('alert');
    expect(blocker.textContent).toContain('does not have an OpenRouter key');
    expect(blocker.textContent).toContain('ask the study team');
    expect(screen.getByRole('button', { name: 'Start study session' }).matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: /connect/i })).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('focuses code errors, derives a participant reference through the launch gate, and clears the raw code', async () => {
    const onStart = vi.fn(async () => ({ participantReference: 'participant:derived-reference', armId: 'question-first' }));
    render(<ParticipantMode
      {...props({
        onStart,
        renderActivity: ({ participantReference }) => (
          <div data-testid="participant-workspace">Workspace for {participantReference}</div>
        ),
      })}
    />);

    fireEvent.change(screen.getByLabelText('Pseudonymous participant code'), { target: { value: 'x' } });
    fireEvent.click(screen.getByLabelText(/I read the participant information/));
    fireEvent.click(screen.getByRole('button', { name: 'Start study session' }));
    const alert = screen.getByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(onStart).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Pseudonymous participant code'), { target: { value: '01234-56789-ABCDEFGHJK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start study session' }));

    expect((await screen.findByTestId('participant-workspace')).textContent).toContain('participant:derived-reference');
    expect(screen.getByText('Question-first tutor')).toBeTruthy();
    expect(screen.getByText(/case b{64}; lesson c{64}/i)).toBeTruthy();
    expect(onStart).toHaveBeenCalledWith('01234-56789-ABCDEFGHJK');
    expect(screen.queryByDisplayValue('01234-56789-ABCDEFGHJK')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('provides an always-available keyboard button for leaving before launch', () => {
    const onExit = vi.fn();
    render(<ParticipantMode {...props({ onExit })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Exit study' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('awaits an active request terminal write before ending the run on Exit study', async () => {
    const order: string[] = [];
    const cancellationGate = deferred<void>();
    const cancelInferenceAndWait = vi.fn(async () => {
      order.push('abort-request');
      await cancellationGate.promise;
      order.push('model_turn_failed:request_aborted');
    });
    const onExit = vi.fn(async () => {
      order.push('run_ended:withdrawn');
    });
    render(<ParticipantMode {...props({
      inferenceBusy: true,
      cancelInferenceAndWait,
      onExit,
      renderActivity: () => <div>Active tutor</div>,
    })} />);

    fireEvent.change(screen.getByLabelText('Pseudonymous participant code'), { target: { value: '01234-56789-ABCDEFGHJK' } });
    fireEvent.click(screen.getByLabelText(/I read the participant information/));
    fireEvent.click(screen.getByRole('button', { name: 'Start study session' }));
    expect(await screen.findByText('Active tutor')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Exit study' }));
    expect(cancelInferenceAndWait).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    expect(order).toEqual(['abort-request']);

    await act(async () => {
      cancellationGate.resolve();
      await cancellationGate.promise;
    });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(order).toEqual([
      'abort-request',
      'model_turn_failed:request_aborted',
      'run_ended:withdrawn',
    ]);
  });

  it('keeps browser zoom enabled and assigns one mobile vertical scroll owner', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const css = readFileSync(resolve(process.cwd(), 'src/components/ParticipantMode/ParticipantMode.css'), 'utf8');
    expect(html).not.toMatch(/user-scalable\s*=\s*(?:0|no)/i);
    expect(html).not.toMatch(/maximum-scale\s*=\s*1/i);
    expect(css).toMatch(/\.participant-active\s*\{[^}]*min-height:\s*100dvh/s);
    expect(css).toContain('@media (max-width: 520px)');
  });

  it('uses only the post-assignment task flow and ends the recorder after pre, activity, and post phases', async () => {
    const record = vi.fn(async () => ({}));
    const end = vi.fn(async () => ({}));
    const onStart = vi.fn(async () => ({
      participantReference: 'participant:derived-reference',
      armId: 'question-first',
      taskFlow: {
        tasks: {
          pre: [{
            id: 'read-baseline',
            title: 'Baseline check',
            instructions: 'Read this instruction before the assigned activity.',
            response: { kind: 'none' as const },
          }],
          post: [{
            id: 'confidence-after',
            title: 'Confidence after activity',
            instructions: 'Choose one value.',
            response: {
              kind: 'integer-scale' as const,
              min: 1,
              max: 3,
              minLabel: 'Low',
              maxLabel: 'High',
            },
          }],
        },
        recorder: { record, end } as unknown as ParticipantTaskRecorder,
      },
    }));

    render(<ParticipantMode
      {...props({
        onStart,
        renderActivity: () => <div>Exact assigned tutor workspace</div>,
      })}
    />);

    expect(screen.queryByText('Baseline check')).toBeNull();
    expect(screen.queryByText('Confidence after activity')).toBeNull();
    expect(screen.queryByText('Exact assigned tutor workspace')).toBeNull();
    fireEvent.change(screen.getByLabelText('Pseudonymous participant code'), { target: { value: '01234-56789-ABCDEFGHJK' } });
    fireEvent.click(screen.getByLabelText(/I read the participant information/));
    fireEvent.click(screen.getByRole('button', { name: 'Start study session' }));

    expect(await screen.findByRole('heading', { name: 'Baseline check' })).toBeTruthy();
    expect(screen.queryByText('Exact assigned tutor workspace')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to activity' }));
    expect(await screen.findByText('Exact assigned tutor workspace')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Confidence after activity' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Finish study activity' }));
    expect(await screen.findByRole('heading', { name: 'Confidence after activity' })).toBeTruthy();
    expect(screen.queryByText('Exact assigned tutor workspace')).toBeNull();
    fireEvent.change(screen.getByLabelText('Choose one value'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish study' }));

    expect(await screen.findByRole('heading', { name: 'Study complete' })).toBeTruthy();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      type: 'task_scored',
      taskId: 'confidence-after',
      score: 2,
      maxScore: 2,
    }));
    expect(end).toHaveBeenCalledWith('completed');
  });
});
