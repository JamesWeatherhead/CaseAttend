// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ParticipantTaskFlow, {
  validateParticipantTaskSet,
  type ParticipantTaskRecorder,
  type ParticipantTaskSet,
} from '../components/ParticipantTaskFlow/ParticipantTaskFlow';

const tasks: ParticipantTaskSet = {
  pre: [{
    id: 'baseline-choice',
    title: 'Baseline question',
    instructions: 'Pick the best answer before the activity.',
    response: {
      kind: 'single-choice',
      options: [
        { id: 'pattern-a', label: 'Pattern A' },
        { id: 'pattern-b', label: 'Pattern B' },
      ],
    },
  }],
  post: [{
    id: 'confidence-after',
    title: 'Confidence after activity',
    instructions: 'Choose your confidence.',
    response: {
      kind: 'integer-scale',
      min: 1,
      max: 5,
      minLabel: 'Not confident',
      maxLabel: 'Very confident',
    },
  }],
};

function recorder(
  recordImplementation: (...args: unknown[]) => Promise<unknown> = async () => ({}),
  endImplementation: (...args: unknown[]) => Promise<unknown> = async () => ({}),
): ParticipantTaskRecorder {
  return {
    record: vi.fn(recordImplementation),
    end: vi.fn(endImplementation),
  } as unknown as ParticipantTaskRecorder;
}

describe('ParticipantTaskFlow', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('runs one exact pre task, the assigned activity, one post task, then ends the run in order', async () => {
    let clock = 100;
    const order: string[] = [];
    const studyRecorder = recorder(
      async (payload) => { order.push(`record:${JSON.stringify(payload)}`); return {}; },
      async (reason) => { order.push(`end:${String(reason)}`); return {}; },
    );
    const onComplete = vi.fn(() => { order.push('complete'); });

    render(
      <ParticipantTaskFlow
        tasks={tasks}
        recorder={studyRecorder}
        renderActivity={<div>Exact assigned teaching workspace</div>}
        nowMs={() => clock}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText('Before activity · Task 1 of 1')).toBeTruthy();
    expect(screen.queryByText('Exact assigned teaching workspace')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Baseline question' })));

    fireEvent.click(screen.getByLabelText('Pattern B'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to activity' }));
    expect(await screen.findByText('Exact assigned teaching workspace')).toBeTruthy();
    expect(screen.queryByText('Confidence after activity')).toBeNull();

    clock = 1_000;
    fireEvent.click(screen.getByRole('button', { name: 'Finish study activity' }));
    expect(await screen.findByText('After activity · Task 1 of 1')).toBeTruthy();
    expect(screen.queryByText('Exact assigned teaching workspace')).toBeNull();

    fireEvent.change(screen.getByLabelText('Choose one value'), { target: { value: '4' } });
    clock = 2_755;
    fireEvent.click(screen.getByRole('button', { name: 'Finish study' }));
    expect(await screen.findByRole('heading', { name: 'Study complete' })).toBeTruthy();

    expect(order).toEqual([
      'record:{"type":"task_choice_recorded","taskId":"baseline-choice","optionId":"pattern-b"}',
      'record:{"type":"task_scored","taskId":"confidence-after","score":3,"maxScore":4,"durationMs":1755}',
      'end:completed',
      'complete',
    ]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('requires a closed valid response and keeps the current task focused until it is saved', async () => {
    const studyRecorder = recorder();
    render(
      <ParticipantTaskFlow
        tasks={tasks}
        recorder={studyRecorder}
        renderActivity={<div>Activity must remain hidden</div>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue to activity' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Choose one response');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(screen.getByRole('heading', { name: 'Baseline question' })).toBeTruthy();
    expect(screen.queryByText('Activity must remain hidden')).toBeNull();
    expect(studyRecorder.record).not.toHaveBeenCalled();
    expect(studyRecorder.end).not.toHaveBeenCalled();
  });

  it('fails closed on record and end errors without skipping or duplicating the task response', async () => {
    const recordMock = vi.fn()
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce({});
    const endMock = vi.fn()
      .mockRejectedValueOnce(new Error('Commit failed'))
      .mockResolvedValueOnce({});
    const studyRecorder = {
      record: recordMock,
      end: endMock,
    } as unknown as ParticipantTaskRecorder;

    render(
      <ParticipantTaskFlow
        tasks={{ pre: tasks.pre, post: [] }}
        recorder={studyRecorder}
        renderActivity={<div>Assigned activity</div>}
      />,
    );
    fireEvent.click(screen.getByLabelText('Pattern A'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to activity' }));

    expect((await screen.findByRole('alert')).textContent).toContain('could not be saved');
    expect(screen.getByRole('heading', { name: 'Baseline question' })).toBeTruthy();
    expect(screen.queryByText('Assigned activity')).toBeNull();
    expect(endMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to activity' }));
    expect(await screen.findByText('Assigned activity')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish study activity' }));

    expect((await screen.findByRole('alert')).textContent).toContain('could not be ended');
    expect(screen.getByRole('heading', { name: 'Finishing study' })).toBeTruthy();
    expect(recordMock).toHaveBeenCalledTimes(2);
    expect(endMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Try finishing again' }));
    expect(await screen.findByRole('heading', { name: 'Study complete' })).toBeTruthy();
    expect(recordMock).toHaveBeenCalledTimes(2);
    expect(endMock).toHaveBeenCalledTimes(2);
  });

  it('cannot finish the activity while a model request lacks a terminal record', async () => {
    const studyRecorder = recorder();
    const emptyTasks: ParticipantTaskSet = { pre: [], post: [] };
    const { rerender } = render(
      <ParticipantTaskFlow
        tasks={emptyTasks}
        recorder={studyRecorder}
        renderActivity={<div>Assigned activity</div>}
        activityBusy
      />,
    );

    const finish = screen.getByRole('button', { name: 'Finish study activity' });
    expect(finish.matches(':disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('AI response is still active');
    fireEvent.click(finish);
    expect(studyRecorder.end).not.toHaveBeenCalled();

    rerender(
      <ParticipantTaskFlow
        tasks={emptyTasks}
        recorder={studyRecorder}
        renderActivity={<div>Assigned activity</div>}
        activityBusy={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish study activity' }));
    expect(await screen.findByRole('heading', { name: 'Study complete' })).toBeTruthy();
    expect(studyRecorder.end).toHaveBeenCalledWith('completed');
  });

  it('rejects unsupported or open task shapes before rendering activity or touching storage', () => {
    const invalidTasks = {
      pre: [{
        id: 'unsafe-task',
        title: 'Unsafe free text',
        instructions: 'Type private details here.',
        response: { kind: 'none', freeText: true },
      }],
      post: [],
    };
    const studyRecorder = recorder();

    expect(validateParticipantTaskSet(invalidTasks)).not.toHaveLength(0);
    render(
      <ParticipantTaskFlow
        tasks={invalidTasks as unknown as ParticipantTaskSet}
        recorder={studyRecorder}
        renderActivity={<div>Must not launch</div>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Study task configuration error' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('No activity or response recording has started');
    expect(screen.queryByText('Must not launch')).toBeNull();
    expect(studyRecorder.record).not.toHaveBeenCalled();
    expect(studyRecorder.end).not.toHaveBeenCalled();
  });

  it('persists only closed IDs or normalized numbers, never task copy or option labels', async () => {
    const rawMarker = 'DO-NOT-PERSIST-RAW-TASK-CONTENT';
    const privateTasks: ParticipantTaskSet = {
      pre: [{
        id: 'private-choice',
        title: rawMarker,
        instructions: `${rawMarker} instructions`,
        response: {
          kind: 'single-choice',
          options: [
            { id: 'yes', label: `${rawMarker} yes label` },
            { id: 'no', label: `${rawMarker} no label` },
          ],
        },
      }],
      post: [],
    };
    const persisted: unknown[] = [];
    const studyRecorder = recorder(async (payload) => { persisted.push(payload); return {}; });

    render(
      <ParticipantTaskFlow
        tasks={privateTasks}
        recorder={studyRecorder}
        renderActivity={<div>Activity</div>}
      />,
    );
    fireEvent.click(screen.getByLabelText(`${rawMarker} yes label`));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to activity' }));
    await screen.findByText('Activity');

    expect(persisted).toEqual([{
      type: 'task_choice_recorded',
      taskId: 'private-choice',
      optionId: 'yes',
    }]);
    expect(JSON.stringify(persisted)).not.toContain(rawMarker);
  });

  it('uses semantic, full-width controls with an explicit 320px layout', () => {
    render(
      <ParticipantTaskFlow
        tasks={tasks}
        recorder={recorder()}
        renderActivity={<div>Activity</div>}
      />,
    );

    expect(screen.getByRole('group', { name: 'Choose one response' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Continue to activity' })).toBeTruthy();

    const css = readFileSync(resolve(process.cwd(), 'src/components/ParticipantTaskFlow/ParticipantTaskFlow.css'), 'utf8');
    expect(css).toContain('@media (max-width: 360px)');
    expect(css).toMatch(/\.participant-task-primary\s*\{[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.participant-task-finish-bar button\s*\{\s*width:\s*100%/s);
    expect(css).not.toMatch(/min-width:\s*[3-9]\d{2}px/);
  });
});
