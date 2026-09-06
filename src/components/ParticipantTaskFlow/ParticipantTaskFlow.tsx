import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RESEARCH_MANIFEST_LIMITS,
  type ResearchTaskV1,
} from '../../core/researchManifest';
import type { ResearchRecorder } from '../../services/researchRecorder';
import type { ResearchRecordPayloadV1 } from '../../services/researchStore';
import './ParticipantTaskFlow.css';

export interface ParticipantTaskSet {
  pre: readonly ResearchTaskV1[];
  post: readonly ResearchTaskV1[];
}

export type ParticipantTaskRecordPayload = Extract<
  ResearchRecordPayloadV1,
  { type: 'task_choice_recorded' | 'task_scored' }
>;

/**
 * The task runner needs only the recorder's structured-event boundary. It never
 * accepts, returns, or retains the raw participant code.
 */
export type ParticipantTaskRecorder = Pick<ResearchRecorder, 'record' | 'end'>;

export interface ParticipantTaskFlowProps {
  tasks: ParticipantTaskSet;
  recorder: ParticipantTaskRecorder;
  /** The already-assigned activity. No arm details are rendered by this runner. */
  renderActivity: React.ReactNode;
  onComplete?: () => void;
  /** True while the assigned tutor has a request without a persisted terminal event. */
  activityBusy?: boolean;
  /** False while a required activity tool is loading or could not be loaded. */
  activityReady?: boolean;
  /** Monotonic clock injection for deterministic duration tests. */
  nowMs?: () => number;
}

type TaskPhase = 'pre' | 'activity' | 'post' | 'ending' | 'complete';

const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isNonemptyText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function validateTaskResponse(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    errors.push(`${path} must use a supported closed response type.`);
    return;
  }

  if (value.kind === 'none') {
    if (!hasExactKeys(value, ['kind'])) errors.push(`${path} contains unsupported fields.`);
    return;
  }

  if (value.kind === 'single-choice') {
    if (!hasExactKeys(value, ['kind', 'options'])) errors.push(`${path} contains unsupported fields.`);
    if (!Array.isArray(value.options)
      || value.options.length < 2
      || value.options.length > RESEARCH_MANIFEST_LIMITS.maxTaskOptions) {
      errors.push(`${path} must contain 2-${RESEARCH_MANIFEST_LIMITS.maxTaskOptions} choices.`);
      return;
    }
    const optionIds = new Set<string>();
    value.options.forEach((entry, index) => {
      const optionPath = `${path}.options[${index}]`;
      if (!isRecord(entry) || !hasExactKeys(entry, ['id', 'label'])) {
        errors.push(`${optionPath} must contain only id and label.`);
        return;
      }
      if (typeof entry.id !== 'string' || !KEBAB_ID_PATTERN.test(entry.id)) {
        errors.push(`${optionPath}.id must be a kebab-case identifier.`);
      } else if (optionIds.has(entry.id)) {
        errors.push(`${optionPath}.id duplicates another choice.`);
      } else {
        optionIds.add(entry.id);
      }
      if (!isNonemptyText(entry.label, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)) {
        errors.push(`${optionPath}.label is required.`);
      }
    });
    return;
  }

  if (value.kind === 'integer-scale') {
    if (!hasExactKeys(value, ['kind', 'min', 'max', 'minLabel', 'maxLabel'])) {
      errors.push(`${path} contains unsupported fields.`);
    }
    const validMin = Number.isInteger(value.min)
      && (value.min as number) >= -1000
      && (value.min as number) <= 1000;
    const validMax = Number.isInteger(value.max)
      && (value.max as number) >= -1000
      && (value.max as number) <= 1000;
    if (!validMin || !validMax
      || (value.max as number) <= (value.min as number)
      || (value.max as number) - (value.min as number) > 100) {
      errors.push(`${path} must define an integer range of 1-100 intervals.`);
    }
    if (!isNonemptyText(value.minLabel, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)
      || !isNonemptyText(value.maxLabel, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)) {
      errors.push(`${path} requires both endpoint labels.`);
    }
    return;
  }

  errors.push(`${path}.kind must be none, single-choice, or integer-scale.`);
}

function validateTaskArray(
  value: unknown,
  phase: 'pre' | 'post',
  allIds: Set<string>,
  errors: string[],
): void {
  const path = `tasks.${phase}`;
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (value.length > RESEARCH_MANIFEST_LIMITS.maxTasksPerPhase) {
    errors.push(`${path} contains too many tasks.`);
  }
  value.forEach((entry, index) => {
    const taskPath = `${path}[${index}]`;
    if (!isRecord(entry)
      || !hasExactKeys(entry, ['id', 'title', 'instructions', 'response'])) {
      errors.push(`${taskPath} must use the closed Research Task v1 shape.`);
      return;
    }
    if (typeof entry.id !== 'string' || !KEBAB_ID_PATTERN.test(entry.id)) {
      errors.push(`${taskPath}.id must be a kebab-case identifier.`);
    } else if (allIds.has(entry.id)) {
      errors.push(`${taskPath}.id duplicates another pre/post task.`);
    } else {
      allIds.add(entry.id);
    }
    if (!isNonemptyText(entry.title, RESEARCH_MANIFEST_LIMITS.maxShortTextLength)) {
      errors.push(`${taskPath}.title is required.`);
    }
    if (!isNonemptyText(entry.instructions, RESEARCH_MANIFEST_LIMITS.maxTextLength)) {
      errors.push(`${taskPath}.instructions are required.`);
    }
    validateTaskResponse(entry.response, `${taskPath}.response`, errors);
  });
}

/** Defensive launch validation. Frozen manifests should already pass the same limits. */
export function validateParticipantTaskSet(value: unknown): readonly string[] {
  const errors: string[] = [];
  if (!isRecord(value) || !hasExactKeys(value, ['pre', 'post'])) {
    return ['The task sequence must contain only pre and post task arrays.'];
  }
  const ids = new Set<string>();
  validateTaskArray(value.pre, 'pre', ids, errors);
  validateTaskArray(value.post, 'post', ids, errors);
  return errors;
}

function defaultNowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function initialPhase(tasks: ParticipantTaskSet): TaskPhase {
  return tasks.pre.length > 0 ? 'pre' : 'activity';
}

function integerScaleValues(
  response: Extract<ResearchTaskV1['response'], { kind: 'integer-scale' }>,
): number[] {
  return Array.from(
    { length: response.max - response.min + 1 },
    (_, offset) => response.min + offset,
  );
}

const ParticipantTaskFlow: React.FC<ParticipantTaskFlowProps> = ({
  tasks,
  recorder,
  renderActivity,
  onComplete,
  activityBusy = false,
  activityReady = true,
  nowMs = defaultNowMs,
}) => {
  const validationErrors = useMemo(() => validateParticipantTaskSet(tasks), [tasks]);
  const [phase, setPhase] = useState<TaskPhase>(() => initialPhase(tasks));
  const [taskIndex, setTaskIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef(nowMs);
  const taskStartedAtRef = useRef(nowMs());
  nowRef.current = nowMs;

  const currentTasks = phase === 'pre' ? tasks.pre : phase === 'post' ? tasks.post : [];
  const currentTask = currentTasks[taskIndex];

  useEffect(() => {
    if (phase !== 'pre' && phase !== 'post') return;
    taskStartedAtRef.current = nowRef.current();
    setAnswer('');
    setError('');
    queueMicrotask(() => headingRef.current?.focus());
  }, [phase, taskIndex]);

  const showError = (message: string) => {
    setError(message);
    queueMicrotask(() => errorRef.current?.focus());
  };

  const finishRun = async () => {
    setPhase('ending');
    setBusy(true);
    setError('');
    try {
      await recorder.end('completed');
    } catch {
      showError('The study could not be ended in persistent storage. Your saved responses were not submitted again. Try finishing once more or exit the study.');
      setBusy(false);
      return;
    }
    setBusy(false);
    setPhase('complete');
    onComplete?.();
  };

  const moveAfterTask = async () => {
    if (phase === 'pre') {
      if (taskIndex + 1 < tasks.pre.length) setTaskIndex((index) => index + 1);
      else {
        setTaskIndex(0);
        setPhase('activity');
      }
      return;
    }
    if (taskIndex + 1 < tasks.post.length) {
      setTaskIndex((index) => index + 1);
      return;
    }
    await finishRun();
  };

  const submitTask = async () => {
    if (!currentTask || busy) return;
    let payload: ParticipantTaskRecordPayload | null = null;

    if (currentTask.response.kind === 'single-choice') {
      const option = currentTask.response.options.find((candidate) => candidate.id === answer);
      if (!option) {
        showError('Choose one response before continuing.');
        return;
      }
      payload = {
        type: 'task_choice_recorded',
        taskId: currentTask.id,
        optionId: option.id,
      };
    } else if (currentTask.response.kind === 'integer-scale') {
      if (answer === '') {
        showError('Choose one scale value before continuing.');
        return;
      }
      const selected = Number(answer);
      if (!Number.isInteger(selected)
        || selected < currentTask.response.min
        || selected > currentTask.response.max) {
        showError('Choose a valid scale value before continuing.');
        return;
      }
      payload = {
        type: 'task_scored',
        taskId: currentTask.id,
        score: selected - currentTask.response.min,
        maxScore: currentTask.response.max - currentTask.response.min,
        durationMs: Math.max(0, Math.round(nowRef.current() - taskStartedAtRef.current)),
      };
    }

    setBusy(true);
    setError('');
    try {
      if (payload) await recorder.record(payload);
    } catch {
      showError('Your response could not be saved in persistent storage. The study has not advanced. Try again or exit the study.');
      setBusy(false);
      return;
    }
    setBusy(false);
    await moveAfterTask();
  };

  const finishActivity = async () => {
    if (busy || activityBusy || !activityReady) return;
    if (tasks.post.length > 0) {
      setTaskIndex(0);
      setPhase('post');
      return;
    }
    await finishRun();
  };

  if (validationErrors.length > 0) {
    return (
      <section className="participant-task-flow participant-task-error-panel" aria-labelledby="participant-task-config-error">
        <h1 id="participant-task-config-error">Study task configuration error</h1>
        <div role="alert">
          This frozen study contains an invalid task sequence. No activity or response recording has started. Ask the study team for help.
        </div>
      </section>
    );
  }

  if (phase === 'activity') {
    return (
      <section className="participant-task-activity" aria-labelledby="participant-activity-heading">
        <h1 id="participant-activity-heading" className="participant-task-sr-only">Study activity</h1>
        <div className="participant-task-activity-content">{renderActivity}</div>
        <div className="participant-task-finish-bar">
          <p id="participant-task-finish-guidance" role="status" aria-live="polite">
            {!activityReady
              ? 'The study tools are not ready yet. Wait for them to open. If loading fails, use Exit study to safely end this session.'
              : activityBusy
              ? 'An AI response is still active. Wait for it to finish or cancel it before finishing this activity.'
              : 'Complete the configured activity before continuing. You cannot return after finishing it.'}
          </p>
          <button
            type="button"
            onClick={() => { void finishActivity(); }}
            disabled={busy || activityBusy || !activityReady}
            aria-describedby="participant-task-finish-guidance"
          >
            Finish study activity
          </button>
        </div>
      </section>
    );
  }

  if (phase === 'ending') {
    return (
      <section className="participant-task-flow" aria-labelledby="participant-task-ending-heading">
        <h1 id="participant-task-ending-heading">Finishing study</h1>
        <p>{busy ? 'Saving the completed run in this browser.' : 'The completed run still needs to be finalized in this browser.'}</p>
        {!busy && (
          <button type="button" className="participant-task-primary" onClick={() => { void finishRun(); }}>
            Try finishing again
          </button>
        )}
        {error && <div role="alert" tabIndex={-1} ref={errorRef} className="participant-task-error">{error}</div>}
      </section>
    );
  }

  if (phase === 'complete') {
    return (
      <section className="participant-task-flow" aria-labelledby="participant-task-complete-heading">
        <h1 id="participant-task-complete-heading">Study complete</h1>
        <p>Your configured activity has ended. Use Exit study to leave Participant Mode.</p>
      </section>
    );
  }

  if (!currentTask) return null;
  const progressLabel = `${phase === 'pre' ? 'Before activity' : 'After activity'} · Task ${taskIndex + 1} of ${currentTasks.length}`;

  return (
    <section className="participant-task-flow" aria-labelledby="participant-current-task-heading">
      <p className="participant-task-progress">{progressLabel}</p>
      <h1 id="participant-current-task-heading" ref={headingRef} tabIndex={-1}>{currentTask.title}</h1>
      <p className="participant-task-instructions">{currentTask.instructions}</p>

      <form onSubmit={(event) => { event.preventDefault(); void submitTask(); }}>
        {currentTask.response.kind === 'single-choice' && (
          <fieldset className="participant-task-options" disabled={busy}>
            <legend>Choose one response</legend>
            {currentTask.response.options.map((option) => (
              <label key={option.id}>
                <input
                  type="radio"
                  name={`task-${currentTask.id}`}
                  value={option.id}
                  checked={answer === option.id}
                  onChange={(event) => { setAnswer(event.target.value); setError(''); }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        {currentTask.response.kind === 'integer-scale' && (
          <div className="participant-task-scale">
            <label htmlFor={`task-scale-${currentTask.id}`}>Choose one value</label>
            <select
              id={`task-scale-${currentTask.id}`}
              value={answer}
              disabled={busy}
              onChange={(event) => { setAnswer(event.target.value); setError(''); }}
            >
              <option value="">Select a value</option>
              {integerScaleValues(currentTask.response)
                .map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <div className="participant-task-scale-labels" aria-hidden="true">
              <span>{currentTask.response.min}: {currentTask.response.minLabel}</span>
              <span>{currentTask.response.max}: {currentTask.response.maxLabel}</span>
            </div>
          </div>
        )}

        {currentTask.response.kind === 'none' && (
          <p className="participant-task-no-response" role="note">This task does not collect a response.</p>
        )}

        <button type="submit" className="participant-task-primary" disabled={busy}>
          {busy ? 'Saving…' : taskIndex + 1 < currentTasks.length ? 'Save and continue' : phase === 'pre' ? 'Continue to activity' : 'Finish study'}
        </button>
        {error && <div role="alert" tabIndex={-1} ref={errorRef} className="participant-task-error">{error}</div>}
      </form>
    </section>
  );
};

export default ParticipantTaskFlow;
