import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LESSON_TURN_BUDGET_BASE,
  DEFAULT_LESSON_TURN_BUDGET_PER_OBJECTIVE,
  MAX_LESSON_TURN_BUDGET,
  MIN_LESSON_TURN_BUDGET,
  computeLessonProgress,
  computeLessonProgressFromCounts,
  deriveLessonTurnBudget,
  determineLessonCompletion,
  formatSilentLessonProgressSteer,
} from '../core/lessonTurnBudget';
import type { LessonPlanV1Draft } from '../core/lessonPlan';
import type { SessionEventPayloadV1 } from '../core/sessionEvents';

const TURN_A = '00000000-0000-4000-8000-0000000000a1';
const TURN_B = '00000000-0000-4000-8000-0000000000a2';
const TURN_C = '00000000-0000-4000-8000-0000000000a3';

function planWithObjectives(count: number, turnBudget?: number): Pick<LessonPlanV1Draft, 'objectives' | 'turnBudget'> {
  const objectives = Array.from({ length: count }, (_, index) => ({
    id: `obj-${index + 1}`,
    description: `Objective ${index + 1}`,
  }));
  return turnBudget === undefined ? { objectives } : { objectives, turnBudget };
}

describe('deriveLessonTurnBudget', () => {
  it('uses base + perObjective * objectives.length when no override is set', () => {
    const plan = planWithObjectives(3);
    expect(deriveLessonTurnBudget(plan)).toBe(
      DEFAULT_LESSON_TURN_BUDGET_BASE + DEFAULT_LESSON_TURN_BUDGET_PER_OBJECTIVE * 3,
    );
  });

  it('respects an authored override', () => {
    const plan = planWithObjectives(2, 12);
    expect(deriveLessonTurnBudget(plan)).toBe(12);
  });

  it('clamps overrides above the accepted range', () => {
    const plan = planWithObjectives(2, MAX_LESSON_TURN_BUDGET + 100);
    expect(deriveLessonTurnBudget(plan)).toBe(MAX_LESSON_TURN_BUDGET);
  });

  it('clamps overrides below the accepted range', () => {
    const plan = planWithObjectives(2, 1);
    expect(deriveLessonTurnBudget(plan)).toBe(MIN_LESSON_TURN_BUDGET);
  });
});

describe('computeLessonProgress', () => {
  const plan = planWithObjectives(2, 6);

  it('returns 0-of-Y before any events, with the derived budget', () => {
    const progress = computeLessonProgress(plan, []);
    expect(progress.turnsUsed).toBe(0);
    expect(progress.turnBudget).toBe(6);
    expect(progress.turnsRemaining).toBe(6);
    expect(progress.objectivesTotal).toBe(2);
    expect(progress.objectivesMet).toBe(0);
    expect(progress.openObjectiveIds).toEqual(['obj-1', 'obj-2']);
    expect(progress.completed).toBe(false);
    expect(progress.completionReason).toBeNull();
  });

  it('deduplicates turnIds and counts each learner turn once', () => {
    const events: SessionEventPayloadV1[] = [
      { type: 'learner_message_submitted', turnId: TURN_A, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'learner_message_submitted', turnId: TURN_A, inputSource: 'retry', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'learner_message_submitted', turnId: TURN_B, inputSource: 'lesson_hint', hintId: 'use-location-shape-signal', learnerLevel: 'ms_preclinical', mode: 'chat' },
    ];
    const progress = computeLessonProgress(plan, events);
    expect(progress.turnsUsed).toBe(2);
    expect(progress.turnsRemaining).toBe(4);
  });

  it('flags objectives_met once every objective has evidence', () => {
    const events: SessionEventPayloadV1[] = [
      { type: 'learner_message_submitted', turnId: TURN_A, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'objective_evidence_recorded', turnId: TURN_A, objectiveId: 'obj-1', source: 'learner_turn' },
      { type: 'objective_evidence_recorded', turnId: TURN_A, objectiveId: 'obj-2', source: 'model_turn' },
    ];
    const progress = computeLessonProgress(plan, events);
    expect(progress.completed).toBe(true);
    expect(progress.completionReason).toBe('objectives_met');
    expect(progress.objectivesMet).toBe(2);
    expect(progress.openObjectiveIds).toEqual([]);
  });

  it('falls back to budget_spent when the budget is exhausted without full evidence', () => {
    const events: SessionEventPayloadV1[] = Array.from({ length: 6 }, (_, index) => ({
      type: 'learner_message_submitted' as const,
      turnId: `00000000-0000-4000-8000-0000000${(300 + index).toString(16).padStart(5, '0')}`,
      inputSource: 'typed' as const,
      learnerLevel: 'ms_preclinical' as const,
      mode: 'chat' as const,
    }));
    events.push({ type: 'objective_evidence_recorded', turnId: TURN_A, objectiveId: 'obj-1', source: 'learner_turn' });
    const progress = computeLessonProgress(plan, events);
    expect(progress.turnsUsed).toBe(6);
    expect(progress.turnsRemaining).toBe(0);
    expect(progress.completed).toBe(true);
    expect(progress.completionReason).toBe('budget_spent');
    expect(progress.objectivesMet).toBe(1);
  });

  it('prefers objectives_met when both conditions trigger on the same turn', () => {
    const smallBudget = planWithObjectives(2, 4);
    const events: SessionEventPayloadV1[] = [
      { type: 'learner_message_submitted', turnId: TURN_A, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'learner_message_submitted', turnId: TURN_B, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'learner_message_submitted', turnId: TURN_C, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'learner_message_submitted', turnId: '00000000-0000-4000-8000-0000000000a4', inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'objective_evidence_recorded', turnId: TURN_A, objectiveId: 'obj-1', source: 'learner_turn' },
      { type: 'objective_evidence_recorded', turnId: TURN_B, objectiveId: 'obj-2', source: 'model_turn' },
    ];
    const progress = computeLessonProgress(smallBudget, events);
    expect(progress.turnsUsed).toBe(4);
    expect(progress.completionReason).toBe('objectives_met');
  });

  it('respects a prior lesson_completed event and does not re-derive its reason', () => {
    const events: SessionEventPayloadV1[] = [
      { type: 'lesson_completed', reason: 'budget_spent', turnsUsed: 0, objectivesMet: 0 },
    ];
    const progress = computeLessonProgress(plan, events);
    expect(progress.completed).toBe(true);
    expect(progress.completionReason).toBe('budget_spent');
  });
});

describe('computeLessonProgressFromCounts', () => {
  it('matches the event-stream computation when given equivalent counts', () => {
    const plan = planWithObjectives(3, 10);
    const events: SessionEventPayloadV1[] = [
      { type: 'learner_message_submitted', turnId: TURN_A, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'learner_message_submitted', turnId: TURN_B, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'objective_evidence_recorded', turnId: TURN_A, objectiveId: 'obj-1', source: 'learner_turn' },
    ];
    const stream = computeLessonProgress(plan, events);
    const counts = computeLessonProgressFromCounts(plan, {
      turnsUsed: 2,
      evidencedObjectiveIds: ['obj-1'],
    });
    expect(counts).toEqual(stream);
  });
});

describe('formatSilentLessonProgressSteer', () => {
  const plan = planWithObjectives(2, 6);

  it('returns a nonempty steer that mentions the ratio and open objectives', () => {
    const progress = computeLessonProgress(plan, []);
    const steer = formatSilentLessonProgressSteer(progress);
    expect(steer).toContain('Turn 0 of 6');
    expect(steer).toContain('Objectives still open: obj-1, obj-2');
    expect(steer).toContain('SILENT');
  });

  it('escalates the pacing note as the budget nears zero', () => {
    const nearlyOut = computeLessonProgressFromCounts(plan, { turnsUsed: 5 });
    expect(formatSilentLessonProgressSteer(nearlyOut)).toContain('Few turns remain');
  });

  it('returns empty when the plan has no objectives', () => {
    const empty = computeLessonProgressFromCounts({ objectives: [] }, { turnsUsed: 1 });
    expect(formatSilentLessonProgressSteer(empty)).toBe('');
  });
});

describe('determineLessonCompletion', () => {
  it('returns null while the lesson is still open', () => {
    const plan = planWithObjectives(2, 8);
    const progress = computeLessonProgress(plan, []);
    expect(determineLessonCompletion(progress)).toBeNull();
  });

  it('returns the payload once objectives_met or budget_spent triggers', () => {
    const plan = planWithObjectives(1, 4);
    const events: SessionEventPayloadV1[] = [
      { type: 'learner_message_submitted', turnId: TURN_A, inputSource: 'typed', learnerLevel: 'ms_preclinical', mode: 'chat' },
      { type: 'objective_evidence_recorded', turnId: TURN_A, objectiveId: 'obj-1', source: 'learner_turn' },
    ];
    const progress = computeLessonProgress(plan, events);
    expect(determineLessonCompletion(progress)).toEqual({
      reason: 'objectives_met',
      turnsUsed: 1,
      objectivesMet: 1,
    });
  });
});
