import { useEffect, useRef, useState } from 'react';
import { getLessonObjectivesForLevel, type LessonPlanV1 } from '../core/lessonPlan';
import type { LearnerLevel } from '../constants';
import {
  evaluateObjectiveEvidence,
  type ObjectiveEvidenceRequest,
  type ObjectiveEvidenceResult,
} from '../services/objectiveEvidence';

export type EvidenceEvaluator = (request: ObjectiveEvidenceRequest) => Promise<ObjectiveEvidenceResult>;
export type PracticeStage = 'attempt' | 'hint' | 'independent_check';
export type EvidenceRow = {
  objectiveId: string;
  status: 'observed' | 'partial' | 'not_observed' | 'needs_review' | 'not_assessed';
  quote: string;
  turnId: string;
  turnNumber: number;
  assistance: ObjectiveEvidenceRequest['assistance'];
};

const EMPTY_ROWS: Readonly<Record<string, EvidenceRow>> = {};
const EMPTY_IDS: readonly string[] = [];

/** Ephemeral evidence only: learner text and evaluator output never enter storage. */
export function useGuidedPractice(options: {
  enabled: boolean;
  identity: string;
  exposureIdentity: string;
  lessonPlan: LessonPlanV1 | null;
  learnerLevel: LearnerLevel;
  evaluator?: EvidenceEvaluator;
}) {
  const { enabled, identity, exposureIdentity, lessonPlan, learnerLevel, evaluator = evaluateObjectiveEvidence } = options;
  // Restarting a conversation cannot undo help already seen on this case.
  // This conservative marker lives only while this panel remains mounted.
  const exposureRef = useRef({ identity: exposureIdentity, assistance: 'none' as ObjectiveEvidenceRequest['assistance'] });
  if (exposureRef.current.identity !== exposureIdentity) exposureRef.current = { identity: exposureIdentity, assistance: 'none' };
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    identity: string; revision: number; stage: PracticeStage;
    rows: Readonly<Record<string, EvidenceRow>>; observedIds: readonly string[]; independentIds: readonly string[];
    assessing: boolean; unavailable: boolean;
  }>({ identity, revision, stage: 'attempt', rows: EMPTY_ROWS, observedIds: EMPTY_IDS, independentIds: EMPTY_IDS, assessing: false, unavailable: false });
  const ownerRef = useRef({ identity, revision, alive: true, assistance: exposureRef.current.assistance });
  if (ownerRef.current.identity !== identity || ownerRef.current.revision !== revision) {
    ownerRef.current = { identity, revision, alive: true, assistance: exposureRef.current.assistance };
  }
  const visible = enabled && state.identity === identity && state.revision === revision;
  const objectives = enabled && lessonPlan ? getLessonObjectivesForLevel(lessonPlan, learnerLevel) : [];

  useEffect(() => {
    const owner = ownerRef.current;
    owner.alive = true;
    return () => { owner.alive = false; };
  }, [identity, revision]);

  const freshState = () => ({
    identity, revision, stage: 'attempt' as PracticeStage,
    rows: EMPTY_ROWS, observedIds: EMPTY_IDS, independentIds: EMPTY_IDS, assessing: false, unavailable: false,
  });
  const update = (patch: Partial<typeof state>) => {
    setState(previous => ({
      ...(previous.identity === identity && previous.revision === revision ? previous : freshState()),
      ...patch,
    }));
  };
  const reset = () => {
    ownerRef.current.alive = false;
    ownerRef.current = { identity, revision: revision + 1, alive: true, assistance: exposureRef.current.assistance };
    setRevision(value => value + 1);
  };
  const setStage = (stage: PracticeStage) => update({ stage });
  const noteAssistance = (assistance: 'hint' | 'explanation') => {
    if (ownerRef.current.assistance !== 'explanation') {
      ownerRef.current.assistance = assistance;
      exposureRef.current.assistance = assistance;
    }
  };

  const assess = async (
    request: Omit<ObjectiveEvidenceRequest, 'assistance'>,
    turnNumber: number,
    isCurrent: () => boolean,
  ): Promise<readonly string[]> => {
    const owner = ownerRef.current;
    const assistance = owner.assistance;
    const current = () => enabled && owner.alive && ownerRef.current === owner
      && !request.signal?.aborted && isCurrent();
    if (!current()) return EMPTY_IDS;
    update({ assessing: true, unavailable: false });
    let result: ObjectiveEvidenceResult | undefined;
    try {
      result = await evaluator({ ...request, assistance });
    } catch {
      // Error bodies can contain private provider text. Only show fixed UI copy.
    }
    if (!current()) return EMPTY_IDS;
    const attributed = result
      && result.sessionId === request.sessionId && result.turnId === request.turnId
      && result.caseRef.id === request.casePackage.id
      && result.caseRef.schemaVersion === request.casePackage.schemaVersion
      && result.caseRef.sha256 === request.casePackage.manifest.sha256
      && result.lessonRef.id === request.lessonPlan.id
      && result.lessonRef.version === request.lessonPlan.version
      && result.lessonRef.sha256 === request.lessonPlan.manifest.sha256
      && result.learnerLevel === request.learnerLevel && result.assistance === assistance;
    const assessed = attributed && result?.status === 'assessed' ? result : undefined;
    const allowed = new Set(getLessonObjectivesForLevel(request.lessonPlan, request.learnerLevel).map(objective => objective.id));
    const accepted = assessed?.objectives.filter(item => allowed.has(item.objectiveId)
      && (item.quote === '' || request.learnerText.includes(item.quote))) ?? [];
    const observed = accepted.filter(item => item.status === 'observed' && item.quote.trim()).map(item => item.objectiveId);
    const independent = assistance === 'none' ? observed : [];
    setState(previous => {
      const base = previous.identity === identity && previous.revision === revision ? previous : freshState();
      const rows = { ...base.rows };
      for (const objectiveId of allowed) {
        const item = accepted.find(candidate => candidate.objectiveId === objectiveId);
        // Progress accumulates across attempts, so retain earlier observed
        // evidence unless this attempt provides new observed evidence to show.
        if (rows[objectiveId]?.status === 'observed'
          && (item?.status !== 'observed' || !item.quote.trim())) continue;
        rows[objectiveId] = {
          objectiveId, status: item?.status ?? 'not_assessed', quote: item?.quote ?? '',
          turnId: request.turnId, turnNumber, assistance,
        };
      }
      return { ...base, rows, observedIds: [...new Set([...base.observedIds, ...observed])], independentIds: [...new Set([...base.independentIds, ...independent])],
        assessing: false, unavailable: !assessed };
    });
    return observed;
  };

  return {
    objectives,
    rows: visible ? state.rows : EMPTY_ROWS,
    observedIds: visible ? state.observedIds : EMPTY_IDS,
    independentIds: visible ? state.independentIds : EMPTY_IDS,
    stage: visible ? state.stage : 'attempt' as PracticeStage,
    assessing: visible && state.assessing,
    unavailable: visible && state.unavailable,
    get assistance() { return ownerRef.current.assistance; },
    reset, setStage, noteAssistance, assess,
    cancelAssessment: () => update({ assessing: false }),
    markNotAssessed: (turnId: string, turnNumber: number) => {
      const assistance = ownerRef.current.assistance;
      setState(previous => {
        const base = previous.identity === identity && previous.revision === revision ? previous : freshState();
        const rows = { ...base.rows };
        for (const objective of objectives) {
          // Skipping a new check does not erase evidence from an earlier attempt.
          if (rows[objective.id]?.status === 'observed') continue;
          rows[objective.id] = {
            objectiveId: objective.id, status: 'not_assessed', quote: '', turnId, turnNumber, assistance,
          };
        }
        // No evaluation was attempted; the existing checks-off copy explains why.
        return { ...base, assessing: false, unavailable: false, rows };
      });
    },
  };
}
