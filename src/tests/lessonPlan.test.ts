import { describe, expect, it } from 'vitest';
import {
  composeLessonPrompt,
  computeLessonPlanManifestHash,
  createLessonPlanV1,
  LESSON_PLAN_VERSION,
  lessonPlanRef,
  validateLessonPlanDraftV1,
  validateLessonPlanV1,
  verifyLessonPlanManifestHash,
  type LessonPlanV1Draft,
} from '../core/lessonPlan';

function validDraft(): LessonPlanV1Draft {
  return {
    schemaVersion: LESSON_PLAN_VERSION,
    id: 'ecg-atrial-fibrillation',
    version: '1.0.0',
    title: 'Irregular narrow-complex rhythm',
    contentLicense: {
      name: 'CC0 1.0 Universal',
      spdxId: 'CC0-1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    audience: {
      levels: ['ms_preclinical', 'ms_clinical'],
      roles: ['medical-student'],
      specialties: ['cardiology'],
      rotations: ['internal-medicine'],
      boardExams: ['usmle-step-1', 'usmle-step-2-ck'],
      prerequisites: ['Identify P waves and calculate ventricular rate.'],
    },
    objectives: [
      { id: 'rhythm-description', text: 'Describe rhythm regularity and atrial activity before naming a diagnosis.' },
      { id: 'mechanism', text: 'Relate the observed rhythm to disorganized atrial activation.' },
    ],
    tutor: {
      openingPrompt: 'Describe the rhythm using rate, regularity, and atrial activity.',
      educatorInstructions: ['Ask for observations before accepting a diagnostic label.'],
      hints: [
        { id: 'regularity', order: 1, prompt: 'Compare several consecutive R-R intervals.' },
        { id: 'atrial-activity', order: 2, prompt: 'Look for consistent P waves before each QRS.' },
      ],
      escalationPolicy: ['Give one hint at a time.', 'Name the rhythm only after the learner describes both key findings.'],
      stoppingConditions: ['The learner identifies an irregularly irregular rhythm and absent organized P waves.'],
    },
    rubric: [
      {
        id: 'observations',
        objectiveIds: ['rhythm-description'],
        description: 'Uses a structured rhythm description.',
        observableEvidence: ['States that R-R intervals vary.', 'States that organized P waves are not visible.'],
        weight: 60,
      },
      {
        id: 'explanation',
        objectiveIds: ['mechanism'],
        description: 'Connects the tracing to atrial activation.',
        observableEvidence: ['Explains that atrial activation is disorganized.'],
        weight: 40,
      },
    ],
    neutralArtifactDescription: 'A single-lead rhythm strip with narrow QRS complexes and varying R-R intervals.',
    teachingNotes: ['Target interpretation: atrial fibrillation.'],
    citations: [
      {
        id: 'clinical-source',
        title: 'Atrial fibrillation overview',
        url: 'https://www.nhlbi.nih.gov/health/atrial-fibrillation',
        kind: 'clinical',
      },
    ],
    clinicalReview: { reviewed: false },
    contentWarnings: [],
  };
}

describe('Lesson Plan v1', () => {
  it('finalizes and verifies a valid lesson plan', async () => {
    const { schemaVersion: _schemaVersion, ...input } = validDraft();
    const plan = await createLessonPlanV1(input);
    expect(plan.schemaVersion).toBe('1.0');
    expect(plan.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(validateLessonPlanV1(plan)).toEqual({ valid: true, errors: [] });
    await expect(verifyLessonPlanManifestHash(plan)).resolves.toBe(true);
    expect(lessonPlanRef(plan)).toBe('lesson-plan:ecg-atrial-fibrillation@1.0.0');
  });

  it('hashes deterministically regardless of object insertion order', async () => {
    const draft = validDraft();
    const reordered = Object.fromEntries(Object.entries(draft).reverse()) as unknown as LessonPlanV1Draft;
    await expect(computeLessonPlanManifestHash(reordered)).resolves.toBe(
      await computeLessonPlanManifestHash(draft),
    );
  });

  it('changes the hash when objectives or scoring change', async () => {
    const draft = validDraft();
    const original = await computeLessonPlanManifestHash(draft);
    const changedObjective = {
      ...draft,
      objectives: [{ ...draft.objectives[0], text: `${draft.objectives[0].text} Explain why.` }, draft.objectives[1]],
    };
    const changedRubric = {
      ...draft,
      rubric: [
        { ...draft.rubric[0], weight: 50 },
        { ...draft.rubric[1], weight: 50 },
      ],
    };
    await expect(computeLessonPlanManifestHash(changedObjective)).resolves.not.toBe(original);
    await expect(computeLessonPlanManifestHash(changedRubric)).resolves.not.toBe(original);
  });

  it('rejects duplicate objectives, broken references, and incomplete coverage', () => {
    const draft = validDraft();
    const result = validateLessonPlanDraftV1({
      ...draft,
      objectives: [draft.objectives[0], draft.objectives[0]],
      rubric: [{ ...draft.rubric[0], objectiveIds: ['missing-objective'], weight: 100 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('objectives[1].id must be unique.');
    expect(result.errors).toContain("rubric[0].objectiveIds references unknown objective 'missing-objective'.");
    expect(result.errors).toContain("objective 'rhythm-description' must be assessed by at least one rubric criterion.");
  });

  it('requires contiguous hint order and rubric weights totaling 100', () => {
    const draft = validDraft();
    const result = validateLessonPlanDraftV1({
      ...draft,
      tutor: {
        ...draft.tutor,
        hints: [draft.tutor.hints[0], { ...draft.tutor.hints[1], order: 3 }],
      },
      rubric: [{ ...draft.rubric[0], weight: 40 }, { ...draft.rubric[1], weight: 40 }],
    });
    expect(result.errors).toContain('tutor.hints orders must form a contiguous sequence beginning at 1.');
    expect(result.errors).toContain('rubric weights must total 100.');
  });

  it('requires complete metadata before claiming clinical review', () => {
    const result = validateLessonPlanDraftV1({
      ...validDraft(),
      clinicalReview: { reviewed: true },
    });
    expect(result.errors).toContain('clinicalReview.reviewer is required and must be a non-empty string.');
    expect(result.errors).toContain('clinicalReview.credentials is required and must be a non-empty string.');
    expect(result.errors).toContain('clinicalReview.reviewedAt is required and must be a non-empty string.');
  });

  it('rejects unknown fields and insecure citation URLs', () => {
    const draft = validDraft();
    const result = validateLessonPlanDraftV1({
      ...draft,
      patientId: '123',
      citations: [{ ...draft.citations[0], url: 'http://example.com/source' }],
    });
    expect(result.errors).toContain('lessonPlan.patientId is not valid in Lesson Plan v1.');
    expect(result.errors).toContain('citations[0].url must be an HTTPS URL without embedded credentials.');
  });

  it('keeps fixed policy first and educator content in a separate preview section', async () => {
    const { schemaVersion: _schemaVersion, ...input } = validDraft();
    const plan = await createLessonPlanV1(input);
    const sections = composeLessonPrompt(plan, {
      fixedPolicy: 'Do not provide patient-specific medical advice.',
      learnerLevel: 'ms_clinical',
    });
    expect(sections.prompt.indexOf('# Fixed CaseAttend policy')).toBe(0);
    expect(sections.fixedPolicy).toContain('cannot override this policy');
    expect(sections.lessonInstructions).toContain('## Learning objectives');
    expect(sections.lessonInstructions).toContain('Target interpretation: atrial fibrillation.');
  });

  it('can withhold answer-revealing teaching notes from a preview', async () => {
    const { schemaVersion: _schemaVersion, ...input } = validDraft();
    const plan = await createLessonPlanV1(input);
    const sections = composeLessonPrompt(plan, {
      fixedPolicy: 'Teach only within the educational scope.',
      learnerLevel: 'ms_preclinical',
      includeTeachingNotes: false,
    });
    expect(sections.lessonInstructions).toContain('Withheld from this prompt.');
    expect(sections.lessonInstructions).not.toContain('Target interpretation');
  });

  it('refuses a learner level outside the versioned audience', async () => {
    const { schemaVersion: _schemaVersion, ...input } = validDraft();
    const plan = await createLessonPlanV1(input);
    expect(() => composeLessonPrompt(plan, {
      fixedPolicy: 'Teach only within the educational scope.',
      learnerLevel: 'resident',
    })).toThrow("Learner level 'resident' is not allowed by this lesson plan.");
  });
});
