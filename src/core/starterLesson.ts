import type { LearnerLevel } from '../constants';
import { createLessonPlanV1, type LessonPlanV1 } from './lessonPlan';

export interface StarterLessonInput {
  caseId: string;
  neutralDescription: string;
  teachingNotes: readonly string[];
  /** Public artifact source recorded for provenance, not for clinical claims. */
  sourceName: string;
  sourceUrl: string;
  title?: string;
  learnerLevels?: readonly LearnerLevel[];
}

const DEFAULT_LEARNER_LEVELS: readonly LearnerLevel[] = [
  'highschool',
  'undergrad',
  'ms_preclinical',
  'ms_clinical',
  'resident',
];

/**
 * Produces a generic, explicitly unreviewed lesson that asks learners to
 * observe before they infer. It contains no case-specific diagnosis or answer.
 */
export async function createStarterLessonPlanV1(
  input: StarterLessonInput,
): Promise<LessonPlanV1> {
  return createLessonPlanV1({
    version: '1.0.0',
    id: `${input.caseId}-starter-lesson`,
    title: input.title?.trim() || 'Observe, describe, and explain',
    neutralDescription: input.neutralDescription,
    teachingNotes: [...input.teachingNotes],
    learner: {
      levels: [...(input.learnerLevels ?? DEFAULT_LEARNER_LEVELS)],
      prerequisites: [],
    },
    objectives: [
      {
        id: 'describe-visible-evidence',
        description: 'Describe visible evidence precisely before offering an interpretation.',
      },
      {
        id: 'explain-evidence-link',
        description: 'Explain how each interpretation connects to specific visible evidence.',
      },
      {
        id: 'state-uncertainty',
        description: 'Separate observations from inferences and state uncertainty honestly.',
      },
    ],
    socraticOpening: 'What do you notice first? Start with only what is visibly present.',
    allowedHints: [
      {
        id: 'description-framework',
        objectiveIds: ['describe-visible-evidence'],
        text: 'Describe location, shape, color or signal, borders, and nearby structures when those features are visible.',
      },
      {
        id: 'evidence-because',
        objectiveIds: ['explain-evidence-link'],
        text: 'Try: I think this could mean ___ because I can see ___.',
      },
      {
        id: 'uncertainty-check',
        objectiveIds: ['state-uncertainty'],
        text: 'Name what the image supports, what it does not show, and what additional information would help.',
      },
    ],
    escalationConditions: [
      {
        id: 'learner-needs-structure',
        when: 'the learner gives two vague or unsupported responses',
        action: 'offer one allowed hint and ask the learner to try again',
      },
    ],
    stoppingConditions: [
      {
        id: 'real-person-diagnosis',
        when: 'the learner asks for diagnosis or treatment of a real person',
        message: 'This lesson cannot diagnose or treat a real person. Please consult a qualified clinician, or local emergency services for a possible emergency.',
      },
    ],
    educatorTutorInstructions:
      'Ask one focused question at a time. Do not reveal a diagnosis or invent case facts. Require visible evidence for each inference, use only the allowed hints, and identify this lesson as an unreviewed starter until an educator replaces or reviews it.',
    rubric: {
      criteria: [
        {
          id: 'specific-description',
          objectiveIds: ['describe-visible-evidence'],
          criterion: 'The learner gives a specific, answer-neutral description.',
          observableEvidence: [
            'Names at least two visible features',
            'Avoids presenting an inference as an observation',
          ],
        },
        {
          id: 'supported-interpretation',
          objectiveIds: ['explain-evidence-link'],
          criterion: 'The learner connects each proposed interpretation to visible evidence.',
          observableEvidence: [
            'Uses an explicit evidence link',
            'Does not invent a finding that is absent from the description',
          ],
        },
        {
          id: 'calibrated-uncertainty',
          objectiveIds: ['state-uncertainty'],
          criterion: 'The learner distinguishes what is supported from what remains uncertain.',
          observableEvidence: [
            'States at least one limitation or uncertainty',
            'Names useful additional information without claiming it is available',
          ],
        },
      ],
    },
    citations: [
      {
        id: 'artifact-source',
        title: input.sourceName,
        scope: 'artifact-provenance',
        url: input.sourceUrl,
      },
    ],
    clinicalReview: { reviewed: false },
  });
}
