import { CXR_CASE_CONTEXTS } from '../../lib/prompts/cxr-cases';
import { DERMATOLOGY_SYSTEM_PROMPT } from '../../lib/prompts/dermatology';
import { PATHOLOGY_SYSTEM_PROMPT } from '../../lib/prompts/pathology';
import { RADIOLOGY_SYSTEM_PROMPT } from '../../lib/prompts/radiology';
import {
  POINTER_INSTRUCTION,
  STUCK_STUDENT_GUIDANCE,
  SUGGESTIONS_INSTRUCTION,
} from '../../lib/prompts/shared';
import type { CasePackageV1, CasePackageV1Draft } from '../core/casePackage';
import type { LearnerLevel } from '../constants';
import {
  createLessonPlanV1,
  getLessonPlanRef,
  type LessonObjective,
  type LessonPlanRef,
  type LessonPlanV1,
} from '../core/lessonPlan';
import { getDomain } from '../lib/domains';

export type LessonCaseSource = Pick<
  CasePackageV1Draft,
  | 'id'
  | 'title'
  | 'vignette'
  | 'domain'
  | 'neutralDescription'
  | 'teachingNotes'
  | 'provenance'
> & Partial<Pick<CasePackageV1, 'lessonPlanRef'>>;

const CONTENT_VERSION = '1.0.0';
const BUILTIN_LEARNER_LEVELS: readonly LearnerLevel[] = [
  'highschool',
  'undergrad',
  'ms_preclinical',
  'ms_clinical',
  'resident',
];

const OBJECTIVES_BY_CASE: Readonly<Record<string, readonly [string, string][]>> = {
  'local-study-sub1': [
    ['observe-sequences', 'Describe the visible finding and compare it across the available MRI sequences.'],
    ['reason-about-chronicity', 'Use DWI and ADC evidence to reason about whether a finding is acute or chronic.'],
    ['integrate-vascular-context', 'Connect the imaging pattern to the vignette without overstating certainty.'],
  ],
  'patho-study-breast': [
    ['scan-low-to-high-power', 'Move from architecture at low power to cellular detail at high power.'],
    ['identify-invasion', 'Describe evidence of invasion and stromal response.'],
    ['apply-nottingham', 'Identify the observable components used in Nottingham grading.'],
  ],
  'cxr-pneumothorax': [
    ['identify-pleural-air', 'Identify and localize signs of pleural air on the radiograph.'],
    ['explain-tension-physiology', 'Connect mediastinal displacement to tension physiology.'],
    ['separate-emergency-from-image', 'Explain why a clinically unstable patient must not wait for imaging.'],
  ],
  'cxr-pneumonia': [
    ['localize-opacity', 'Describe and localize the visible airspace opacity.'],
    ['use-silhouette-sign', 'Use the silhouette sign to support lobar localization.'],
    ['connect-consolidation', 'Connect the radiographic pattern to the mechanism of consolidation.'],
  ],
  'cxr-chf': [
    ['identify-edema-pattern', 'Identify the visible pattern of pulmonary edema and cardiac enlargement.'],
    ['explain-pressure-path', 'Connect elevated left-sided filling pressure to the radiographic findings.'],
    ['integrate-severity', 'Use the image and vignette together to discuss severity without patient-specific advice.'],
  ],
  'cxr-effusion': [
    ['identify-pleural-fluid', 'Identify and estimate the distribution of visible pleural fluid.'],
    ['distinguish-volume-effects', 'Distinguish fluid-related opacity from other causes of hemithorax opacity.'],
    ['build-next-questions', 'Identify the clinical questions that would guide further educational workup.'],
  ],
  'axr-sbo': [
    ['identify-obstruction-pattern', 'Identify the radiographic pattern of small bowel obstruction.'],
    ['connect-mechanism-risk', 'Connect bowel dilation and air-fluid levels to obstruction physiology.'],
    ['recognize-escalation-signs', 'Recognize vignette or image features that imply urgent escalation.'],
  ],
  'ct-epidural': [
    ['identify-extra-axial-blood', 'Describe the shape and location of the extra-axial collection.'],
    ['connect-anatomy-pressure', 'Connect skull and meningeal anatomy to the collection shape and mass effect.'],
    ['recognize-emergency', 'Recognize findings that make the teaching scenario an emergency.'],
  ],
  'ct-subdural': [
    ['identify-subdural-pattern', 'Describe the distribution and density of the subdural collection.'],
    ['connect-risk-anatomy', 'Connect age, anticoagulation, and bridging-vein anatomy to the pattern.'],
    ['reason-about-mass-effect', 'Describe visible mass effect and the questions it raises.'],
  ],
  'cxr-pneumoperitoneum': [
    ['identify-free-air', 'Identify and localize free intraperitoneal air on the upright radiograph.'],
    ['connect-perforation', 'Connect free air to the mechanism and differential of perforation.'],
    ['recognize-urgent-context', 'Recognize why the vignette represents an urgent teaching scenario.'],
  ],
  'axr-nec': [
    ['identify-pneumatosis', 'Identify the visible bowel pattern and signs of pneumatosis.'],
    ['connect-neonatal-risk', 'Connect prematurity and feeding intolerance to the teaching differential.'],
    ['recognize-progression', 'Recognize image or vignette findings that suggest progression.'],
  ],
  'xr-colles': [
    ['identify-distal-radius-fracture', 'Describe the distal radius fracture and displacement.'],
    ['connect-mechanism-anatomy', 'Connect the fall mechanism to the fracture pattern and nearby anatomy.'],
    ['identify-complications', 'Identify complications and follow-up questions relevant to the pattern.'],
  ],
  'derm-melanoma': [
    ['describe-abcde', 'Describe the lesion using the ABCDE framework without jumping to a diagnosis.'],
    ['build-pigmented-differential', 'Build a differential from the visible features and evolution.'],
    ['explain-biopsy-staging', 'Explain the educational rationale for biopsy and the features used in staging.'],
  ],
  'derm-bcc': [
    ['describe-nodular-lesion', 'Describe the lesion morphology, border, surface, and visible vessels.'],
    ['connect-uv-differential', 'Connect chronic sun exposure and visible features to a focused differential.'],
    ['compare-biopsy-options', 'Compare educational indications for biopsy and tissue-sparing treatment.'],
  ],
  'derm-sebk': [
    ['describe-stuck-on-pattern', 'Describe the lesion morphology and the visible features of a stuck-on pattern.'],
    ['distinguish-look-alikes', 'Distinguish reassuring features from changes that would merit reassessment.'],
    ['practice-counseling', 'Explain a clear monitoring and counseling approach for a benign teaching case.'],
  ],
};

function objectivesFor(caseId: string): LessonObjective[] {
  const definitions = OBJECTIVES_BY_CASE[caseId];
  if (!definitions) throw new Error(`No built-in lesson objectives are registered for Case Package '${caseId}'.`);
  return definitions.map(([id, description]) => ({ id, description }));
}

function openingFor(caseSource: LessonCaseSource): string {
  const question = caseSource.domain === 'pathology'
    ? 'Start at the lowest magnification. What do you notice about the tissue architecture before naming a diagnosis?'
    : caseSource.domain === 'dermatology'
      ? 'Describe the lesion morphology, color, border, and surface before naming a diagnosis. What stands out first?'
      : 'Begin with observation, not diagnosis. What visible finding stands out first, and where is it?';
  return `**${caseSource.title}**\n\n${caseSource.vignette}\n\n${question}`;
}

function tutorInstructionsFor(caseSource: LessonCaseSource): string {
  if (caseSource.id === 'local-study-sub1') return RADIOLOGY_SYSTEM_PROMPT;
  if (caseSource.domain === 'pathology') return PATHOLOGY_SYSTEM_PROMPT;
  if (caseSource.domain === 'dermatology') {
    return `${DERMATOLOGY_SYSTEM_PROMPT}\n\nCASE-SPECIFIC ANSWER NOTES\n${caseSource.teachingNotes.join('\n')}`;
  }
  const caseContext = CXR_CASE_CONTEXTS[caseSource.id];
  if (!caseContext) {
    throw new Error(`No built-in radiology teaching context is registered for Case Package '${caseSource.id}'.`);
  }
  return [
    caseContext,
    STUCK_STUDENT_GUIDANCE,
    POINTER_INSTRUCTION,
    SUGGESTIONS_INSTRUCTION,
  ].join('\n\n');
}

function citationFor(caseSource: LessonCaseSource) {
  const usesRecordedSource = Boolean(caseSource.provenance.sourceUrl);
  const url = caseSource.provenance.sourceUrl ?? caseSource.provenance.license.url;
  if (!url) {
    throw new Error(`Case Package '${caseSource.id}' needs an HTTPS provenance or license URL before its lesson can be finalized.`);
  }
  return {
    id: 'artifact-provenance',
    title: usesRecordedSource
      ? `Case artifact provenance: ${caseSource.provenance.sourceName}`
      : `Artifact license record: ${caseSource.provenance.license.name}`,
    scope: 'artifact-provenance' as const,
    url,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const lessonPromises = new Map<string, Promise<LessonPlanV1>>();

export function expectedBuiltinLessonPlanIdentity(caseId: string): Pick<LessonPlanRef, 'id' | 'version'> {
  return { id: `${caseId}-lesson`, version: CONTENT_VERSION };
}

export function createBuiltinLessonPlan(caseSource: LessonCaseSource): Promise<LessonPlanV1> {
  const cached = lessonPromises.get(caseSource.id);
  if (cached) return cached;

  const promise = (async () => {
    const objectives = objectivesFor(caseSource.id);
    const plan = await createLessonPlanV1({
      ...expectedBuiltinLessonPlanIdentity(caseSource.id),
      title: `${caseSource.title} teaching lesson`,
      neutralDescription: caseSource.neutralDescription,
      teachingNotes: caseSource.teachingNotes,
      learner: {
        levels: BUILTIN_LEARNER_LEVELS,
        prerequisites: ['Use descriptive observations before forming an interpretation.'],
      },
      objectives,
      socraticOpening: openingFor(caseSource),
      learnerOpenings: BUILTIN_LEARNER_LEVELS.map((learnerLevel) => ({
        learnerLevel,
        content: getDomain(caseSource.domain).welcomeMessage(learnerLevel, caseSource.id),
      })),
      allowedHints: objectives.map((objective, index) => ({
        id: `hint-${index + 1}`,
        objectiveIds: [objective.id],
        text: index === 0
          ? 'Name the location, shape, relative brightness or color, and surrounding structures.'
          : index === 1
            ? 'Compare the finding with another region, frame, sequence, or expected normal appearance.'
            : 'Use one detail from the vignette and one visible detail to explain your reasoning.',
      })),
      escalationConditions: [
        {
          id: 'two-vague-attempts',
          when: 'the learner gives two vague or unsupported attempts',
          action: 'offer the next allowed hint and ask one narrower question',
        },
      ],
      stoppingConditions: [
        {
          id: 'real-person-request',
          when: 'the learner asks for diagnosis or treatment of a real person',
          message: 'Explain the educational limit and direct the learner to a qualified clinician.',
        },
        {
          id: 'objectives-met',
          when: 'the learner demonstrates the observable evidence for every objective',
          message: 'Summarize the transferable teaching point and invite reflection.',
        },
      ],
      educatorTutorInstructions: tutorInstructionsFor(caseSource),
      rubric: {
        criteria: objectives.map((objective, index) => ({
          id: `criterion-${index + 1}`,
          objectiveIds: [objective.id],
          criterion: objective.description,
          observableEvidence: [
            'Uses specific descriptive language.',
            'Links the conclusion to visible evidence.',
            'States uncertainty or limitations when appropriate.',
          ],
        })),
      },
      citations: [citationFor(caseSource)],
      clinicalReview: { reviewed: false },
    });
    return deepFreeze(plan);
  })();

  lessonPromises.set(caseSource.id, promise);
  return promise;
}

function sameNotes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export async function requireLessonPlanForCase(casePackage: CasePackageV1): Promise<LessonPlanV1> {
  const plan = await createBuiltinLessonPlan(casePackage);
  const ref = getLessonPlanRef(plan);
  if (
    casePackage.lessonPlanRef.id !== ref.id
    || casePackage.lessonPlanRef.version !== ref.version
    || casePackage.lessonPlanRef.sha256 !== ref.sha256
  ) {
    throw new Error(`Case Package '${casePackage.id}' does not bind to the exact Lesson Plan manifest.`);
  }
  if (plan.neutralDescription !== casePackage.neutralDescription) {
    throw new Error(`Case Package '${casePackage.id}' and its Lesson Plan have different neutral descriptions.`);
  }
  if (!sameNotes(plan.teachingNotes, casePackage.teachingNotes)) {
    throw new Error(`Case Package '${casePackage.id}' and its Lesson Plan have different teaching notes.`);
  }
  return plan;
}

export async function assertLessonPlanRef(
  caseSource: LessonCaseSource,
  ref: LessonPlanRef,
): Promise<void> {
  const expected = getLessonPlanRef(await createBuiltinLessonPlan(caseSource));
  if (ref.id !== expected.id || ref.version !== expected.version || ref.sha256 !== expected.sha256) {
    throw new Error(`Lesson Plan reference for Case Package '${caseSource.id}' does not match its manifest.`);
  }
}
