/**
 * Lesson turn budget: derive a soft per-lesson budget Y from a Lesson Plan and
 * account per-turn progress against it from the existing Session Event stream.
 *
 * The budget is soft. Its purpose is to steer the tutor to closure (silent
 * system-prompt note) and, optionally, to show the learner a subtle chip. It
 * does not hard-stop a lesson. Completion is decided by objective evidence
 * first; if the budget is spent first, the tutor wraps up gracefully.
 *
 * The learner's pre-cached opening round counts as turn 1 (the welcome message
 * is the tutor's first exchange). Every `learner_message_submitted` event of
 * any `inputSource` (typed, lesson_hint, retry) advances the counter, so the
 * companion intro-cache branch that fires a `learner_message_submitted` for a
 * cached opening question is consistent with a live-model turn.
 */

import type { LessonPlanV1, LessonPlanV1Draft } from './lessonPlan';
import type { SessionEventPayloadV1 } from './sessionEvents';

/** Baseline turns granted independent of objective count. */
export const DEFAULT_LESSON_TURN_BUDGET_BASE = 4;
/** Additional turns per learning objective. */
export const DEFAULT_LESSON_TURN_BUDGET_PER_OBJECTIVE = 3;
/** Minimum authored or derived budget accepted by the app. */
export const MIN_LESSON_TURN_BUDGET = 4;
/** Maximum authored or derived budget accepted by the app. */
export const MAX_LESSON_TURN_BUDGET = 40;

export type LessonCompletionReason = 'objectives_met' | 'budget_spent';

export interface LessonProgress {
  /** Total soft budget Y for this lesson. */
  turnBudget: number;
  /** Learner turns observed so far. Counts the cached opening as turn 1. */
  turnsUsed: number;
  /** max(0, Y - X). */
  turnsRemaining: number;
  /** Total objectives on the plan. */
  objectivesTotal: number;
  /** Objectives with at least one evidence event. */
  objectivesMet: number;
  /** Stable-order ids of objectives still lacking evidence. */
  openObjectiveIds: readonly string[];
  /** True once completion is triggered (either branch). */
  completed: boolean;
  /**
   * Reason for completion. `objectives_met` wins over `budget_spent` when both
   * conditions are true on the same turn.
   */
  completionReason: LessonCompletionReason | null;
}

function clampBudget(value: number): number {
  if (!Number.isSafeInteger(value)) return MIN_LESSON_TURN_BUDGET;
  if (value < MIN_LESSON_TURN_BUDGET) return MIN_LESSON_TURN_BUDGET;
  if (value > MAX_LESSON_TURN_BUDGET) return MAX_LESSON_TURN_BUDGET;
  return value;
}

/**
 * Derive Y for a lesson. Uses the authored `turnBudget` when present;
 * otherwise `base + perObjective * objectives.length`, clamped to
 * [MIN_LESSON_TURN_BUDGET, MAX_LESSON_TURN_BUDGET].
 */
export function deriveLessonTurnBudget(
  plan: Pick<LessonPlanV1 | LessonPlanV1Draft, 'objectives' | 'turnBudget'>,
): number {
  if (typeof plan.turnBudget === 'number' && Number.isSafeInteger(plan.turnBudget)) {
    return clampBudget(plan.turnBudget);
  }
  const derived = DEFAULT_LESSON_TURN_BUDGET_BASE
    + DEFAULT_LESSON_TURN_BUDGET_PER_OBJECTIVE * plan.objectives.length;
  return clampBudget(derived);
}

export interface ComputeLessonProgressOptions {
  /** Override the derived budget. Clamped to the accepted range. */
  turnBudget?: number;
}

/**
 * Compute lesson progress from a Lesson Plan and its Session Events. The
 * caller passes ALL events for the current lesson session, in any order; the
 * function is order-independent because it only counts turns and reduces
 * objective evidence.
 */
export function computeLessonProgress(
  plan: Pick<LessonPlanV1 | LessonPlanV1Draft, 'objectives' | 'turnBudget'>,
  events: readonly SessionEventPayloadV1[],
  options: ComputeLessonProgressOptions = {},
): LessonProgress {
  const seenTurns = new Set<string>();
  const evidencedObjectives = new Set<string>();
  let alreadyCompletedByPriorEvent: LessonCompletionReason | null = null;
  for (const event of events) {
    if (event.type === 'learner_message_submitted') {
      seenTurns.add(event.turnId);
      continue;
    }
    if (event.type === 'objective_evidence_recorded') {
      evidencedObjectives.add(event.objectiveId);
      continue;
    }
    if (event.type === 'lesson_completed') {
      alreadyCompletedByPriorEvent = event.reason;
    }
  }
  return computeLessonProgressFromCounts(plan, {
    turnsUsed: seenTurns.size,
    evidencedObjectiveIds: Array.from(evidencedObjectives),
    priorCompletionReason: alreadyCompletedByPriorEvent,
    turnBudget: options.turnBudget,
  });
}

export interface ProgressCountsInput {
  turnsUsed: number;
  evidencedObjectiveIds?: readonly string[];
  /** Set when a lesson_completed event was already recorded in the session. */
  priorCompletionReason?: LessonCompletionReason | null;
  /** Override the derived budget. Clamped to the accepted range. */
  turnBudget?: number;
}

/**
 * Compute progress from primitive counts, for callers (like the tutor panel)
 * that already track learner turns separately from the full event stream.
 */
export function computeLessonProgressFromCounts(
  plan: Pick<LessonPlanV1 | LessonPlanV1Draft, 'objectives' | 'turnBudget'>,
  input: ProgressCountsInput,
): LessonProgress {
  const turnBudget = clampBudget(
    typeof input.turnBudget === 'number' ? input.turnBudget : deriveLessonTurnBudget(plan),
  );
  const objectiveIds = plan.objectives.map((objective) => objective.id);
  const objectivesTotal = objectiveIds.length;
  const evidencedSet = new Set(input.evidencedObjectiveIds ?? []);
  const openObjectiveIds = objectiveIds.filter((id) => !evidencedSet.has(id));
  const objectivesMet = objectivesTotal - openObjectiveIds.length;
  const turnsUsed = Number.isSafeInteger(input.turnsUsed) && input.turnsUsed > 0
    ? input.turnsUsed
    : 0;
  const turnsRemaining = Math.max(0, turnBudget - turnsUsed);

  let completionReason: LessonCompletionReason | null = input.priorCompletionReason ?? null;
  if (!completionReason) {
    if (objectivesTotal > 0 && openObjectiveIds.length === 0) {
      completionReason = 'objectives_met';
    } else if (turnsUsed >= turnBudget) {
      completionReason = 'budget_spent';
    }
  }

  return {
    turnBudget,
    turnsUsed,
    turnsRemaining,
    objectivesTotal,
    objectivesMet,
    openObjectiveIds,
    completed: completionReason !== null,
    completionReason,
  };
}

/**
 * Build the SHORT silent steer sent to the tutor as an extra system-role
 * message. Not shown verbatim to the learner. Returns an empty string when
 * the plan has no objectives (nothing meaningful to steer against).
 */
export function formatSilentLessonProgressSteer(progress: LessonProgress): string {
  if (progress.objectivesTotal === 0) return '';
  const remaining = progress.turnsRemaining;
  const openList = progress.openObjectiveIds.length > 0
    ? progress.openObjectiveIds.join(', ')
    : 'none';
  const pacing = progress.completed
    ? progress.completionReason === 'objectives_met'
      ? 'Every objective now has evidence. Consolidate what was learned, recap the rubric-level evidence, and close the lesson.'
      : 'The turn budget is spent. Wrap up: consolidate, name any unmet objectives, and offer a brief recap.'
    : remaining <= 2
      ? 'Few turns remain. Begin consolidating and cover the open objectives before wrap up.'
      : remaining <= Math.ceil(progress.turnBudget / 3)
        ? 'The budget is running low. Start narrowing toward the open objectives.'
        : 'Continue guiding the learner toward the open objectives at a normal pace.';

  return [
    'LESSON PACING (SILENT, NEVER READ VERBATIM TO THE LEARNER)',
    `Turn ${progress.turnsUsed} of ${progress.turnBudget}.`,
    `Objectives met: ${progress.objectivesMet} of ${progress.objectivesTotal}.`,
    `Objectives still open: ${openList}.`,
    pacing,
  ].join('\n');
}

export interface LessonCompletionSummary {
  reason: LessonCompletionReason;
  turnsUsed: number;
  objectivesMet: number;
}

/**
 * Return the summary payload to emit as a `lesson_completed` Session Event
 * once, or `null` if the lesson is not yet complete.
 */
export function determineLessonCompletion(progress: LessonProgress): LessonCompletionSummary | null {
  if (!progress.completed || progress.completionReason === null) return null;
  return {
    reason: progress.completionReason,
    turnsUsed: progress.turnsUsed,
    objectivesMet: progress.objectivesMet,
  };
}
