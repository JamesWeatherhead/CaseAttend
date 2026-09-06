import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEARNER_LEVELS, type LearnerLevel } from '../constants';
import {
  composeLessonPrompt,
  finalizeLessonPlanV1,
  getLessonObjectivesForLevel,
  validateLessonPlanDraftV1,
  validateLessonPlanV1,
  verifyLessonPlanManifestHash,
  type LessonObjective,
  type LessonPlanV1Draft,
  type LessonPromptRuntimeContext,
} from '../core/lessonPlan';
import { makeEditableLessonCase } from './lessonBuilderTestFixture';

let fixture: Awaited<ReturnType<typeof makeEditableLessonCase>>;
const levels = LEARNER_LEVELS.map(level => level.id);

beforeAll(async () => {
  fixture = await makeEditableLessonCase();
});

function runtimeFor(learnerLevel: LearnerLevel): LessonPromptRuntimeContext {
  const { casePackage } = fixture;
  return {
    learnerLevel,
    mode: 'chat',
    hasImage: true,
    caseContext: {
      id: casePackage.id,
      title: casePackage.title,
      vignette: casePackage.vignette,
      neutralDescription: casePackage.neutralDescription,
      domain: casePackage.domain,
    },
  };
}

function curriculumDraft(includeShared = false): LessonPlanV1Draft {
  const { manifest: _manifest, ...base } = fixture.lessonPlan;
  const objectives: LessonObjective[] = levels.map((level, index) => ({
    id: `goal-${level.replaceAll('_', '-')}`,
    description: `Synthetic objective for ${level}.`,
    learnerLevels: [level],
    sourceSlides: [index + 1],
  }));
  if (includeShared) {
    objectives.splice(1, 0, {
      id: 'shared-observation',
      description: 'Shared synthetic observation objective.',
    });
  }
  return {
    ...base,
    learner: { ...base.learner, levels },
    practiceMode: 'guided',
    objectives,
    allowedHints: objectives.map(objective => ({
      id: `hint-${objective.id}`,
      objectiveIds: [objective.id],
      text: `Synthetic hint for ${objective.id}.`,
    })),
    rubric: {
      criteria: objectives.map(objective => ({
        id: `criterion-${objective.id}`,
        objectiveIds: [objective.id],
        criterion: `Synthetic criterion for ${objective.id}.`,
        observableEvidence: [`Synthetic learner evidence for ${objective.id}.`],
      })),
    },
  };
}

describe('authored lesson curriculum', () => {
  it('finalizes a guided lesson covering all six supported levels, including distinct Step 2', async () => {
    expect(levels).toEqual([
      'highschool', 'undergrad', 'ms_preclinical', 'ms_clinical', 'ms_step2', 'resident',
    ]);
    const draft = curriculumDraft();
    const plan = await finalizeLessonPlanV1(draft);

    expect(validateLessonPlanV1(plan)).toEqual({ valid: true, errors: [] });
    await expect(verifyLessonPlanManifestHash(plan)).resolves.toBe(true);
    expect(plan.practiceMode).toBe('guided');
    expect(plan.objectives).toEqual(draft.objectives);
    for (const [index, level] of levels.entries()) {
      const selected = getLessonObjectivesForLevel(plan, level);
      expect(selected).toHaveLength(1);
      expect(selected[0]).toBe(plan.objectives[index]);
      expect(selected[0]?.sourceSlides).toEqual([index + 1]);
    }
  });

  it.each(['ms_preclinical', 'ms_clinical', 'ms_step2'] as const)(
    'composes only matching and shared objectives, hints, and rubric evidence for %s',
    async level => {
      const plan = await finalizeLessonPlanV1(curriculumDraft(true));
      const selected = getLessonObjectivesForLevel(plan, level);
      const expected = plan.objectives.filter(objective => (
        objective.id === 'shared-observation' || objective.learnerLevels?.includes(level)
      ));
      expect(selected).toEqual(expected);
      selected.forEach((objective, index) => expect(objective).toBe(expected[index]));

      const prompt = await composeLessonPrompt(plan, runtimeFor(level));
      for (const objective of plan.objectives) {
        const matching = expected.includes(objective);
        const strings = [
          objective.description,
          `Synthetic hint for ${objective.id}.`,
          `Synthetic criterion for ${objective.id}.`,
          `Synthetic learner evidence for ${objective.id}.`,
        ];
        for (const text of strings) {
          if (matching) expect(prompt.providerPrompt).toContain(text);
          else expect(prompt.providerPrompt).not.toContain(text);
        }
      }
    },
  );

  it('applies legacy shared objectives to every declared audience without adding metadata', async () => {
    const { manifest: _manifest, ...legacyDraft } = fixture.lessonPlan;
    const plan = await finalizeLessonPlanV1({
      ...legacyDraft,
      learner: { ...legacyDraft.learner, levels },
    });

    for (const level of levels) {
      const selected = getLessonObjectivesForLevel(plan, level);
      expect(selected).toEqual(plan.objectives);
      selected.forEach((objective, index) => expect(objective).toBe(plan.objectives[index]));
      const prompt = await composeLessonPrompt(plan, runtimeFor(level));
      for (const objective of plan.objectives) expect(prompt.providerPrompt).toContain(objective.description);
    }
    expect(plan).not.toHaveProperty('practiceMode');
    for (const objective of plan.objectives) {
      expect(objective).not.toHaveProperty('learnerLevels');
      expect(objective).not.toHaveProperty('sourceSlides');
    }
  });

  it('preserves the canonical legacy lesson and full provider prompt when optional fields are omitted', async () => {
    // Golden values produced with lessonPlan.ts from a38b93e and this same synthetic fixture/runtime.
    const plan = fixture.lessonPlan;
    const prompt = await composeLessonPrompt(plan, runtimeFor('undergrad'));
    expect(plan.manifest.sha256).toBe('4402dba57dec5db4981fb5f79bfac0f074d3eb3f736476b8b5812816801d5a87');
    expect(createHash('sha256').update(prompt.providerPrompt).digest('hex'))
      .toBe('6c30f49f3b79af3666511e299da025e603955fd46560fae6e299372af9ceb831');
  });

  it('rejects an objective audience outside the lesson audience before finalization', async () => {
    const draft = curriculumDraft();
    const invalid = {
      ...draft,
      learner: { ...draft.learner, levels: levels.filter(level => level !== 'ms_step2') },
    };
    expect(validateLessonPlanDraftV1(invalid).errors).toContain(
      'objectives[4].learnerLevels must be included in learner.levels.',
    );
    await expect(finalizeLessonPlanV1(invalid)).rejects.toThrow('must be included in learner.levels');
  });

  it('rejects an audience with no applicable objective even when every objective has rubric coverage', async () => {
    const draft = curriculumDraft();
    const invalid = {
      ...draft,
      objectives: draft.objectives.map(objective => objective.learnerLevels?.includes('resident')
        ? { ...objective, learnerLevels: ['undergrad' as const] }
        : objective),
    };
    expect(validateLessonPlanDraftV1(invalid).errors).toEqual([
      "No learning objectives apply to learner level 'resident'.",
    ]);
    await expect(finalizeLessonPlanV1(invalid)).rejects.toThrow('No learning objectives apply');
  });

  it.each([[1, 1], [], [0], [81], [1.5]].map(sourceSlides => ({ sourceSlides })))(
    'rejects invalid source slide references $sourceSlides', async ({ sourceSlides }) => {
      const draft = curriculumDraft();
      const invalid = {
        ...draft,
        objectives: draft.objectives.map((objective, index) => index === 0
          ? { ...objective, sourceSlides }
          : objective),
      };
      expect(validateLessonPlanDraftV1(invalid).errors).toContain(
        'objectives[0].sourceSlides must contain unique slide numbers from 1 to 80.',
      );
      await expect(finalizeLessonPlanV1(invalid)).rejects.toThrow('sourceSlides must contain unique slide numbers');
    },
  );

  it('binds the audience, slide provenance, and guided mode to the canonical lesson hash', async () => {
    const draft = curriculumDraft(true);
    const plan = await finalizeLessonPlanV1(draft);
    const audienceChange = {
      ...plan,
      objectives: plan.objectives.map((objective, index) => index === 0
        ? { ...objective, learnerLevels: ['undergrad' as const] }
        : objective),
    };
    const slideChange = {
      ...plan,
      objectives: plan.objectives.map((objective, index) => index === 0
        ? { ...objective, sourceSlides: [80] }
        : objective),
    };
    const { practiceMode: _practiceMode, ...modeChange } = plan;
    for (const changed of [audienceChange, slideChange, modeChange]) {
      expect(validateLessonPlanV1(changed)).toEqual({ valid: true, errors: [] });
      await expect(verifyLessonPlanManifestHash(changed)).resolves.toBe(false);
      await expect(composeLessonPrompt(changed, runtimeFor('undergrad'))).rejects.toThrow('manifest does not match');
    }
  });

  it('rejects unrecognized practice modes', () => {
    expect(validateLessonPlanDraftV1({ ...curriculumDraft(), practiceMode: 'reveal' }).errors)
      .toContain("practiceMode must be 'guided' when provided.");
  });
});
