import { describe, expect, it } from 'vitest';
import { composeLessonPrompt, getLessonPlanRef, verifyLessonPlanManifestHash } from '../core/lessonPlan';
import { listCasePackages } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';

describe('built-in Lesson Plan registry', () => {
  it('binds every Case Package to one exact, verified Lesson Plan manifest', async () => {
    const casePackages = await listCasePackages();
    const plans = await Promise.all(casePackages.map(requireLessonPlanForCase));

    expect(plans).toHaveLength(15);
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(15);
    for (const [index, plan] of plans.entries()) {
      expect(getLessonPlanRef(plan)).toEqual(casePackages[index].lessonPlanRef);
      await expect(verifyLessonPlanManifestHash(plan)).resolves.toBe(true);
      expect(plan.neutralDescription).toBe(casePackages[index].neutralDescription);
      expect(plan.teachingNotes).toEqual(casePackages[index].teachingNotes);
      expect(plan.clinicalReview).toEqual({ reviewed: false });
      expect(plan.citations.every((citation) => citation.scope === 'artifact-provenance')).toBe(true);
      expect(plan.learner.levels).toEqual([
        'highschool',
        'undergrad',
        'ms_preclinical',
        'ms_clinical',
        'resident',
      ]);
      expect(plan.learnerOpenings?.map((opening) => opening.learnerLevel)).toEqual(
        plan.learner.levels,
      );
      expect(plan.objectives.length).toBeGreaterThanOrEqual(3);
      expect(plan.rubric.criteria.length).toBe(plan.objectives.length);
    }
  });

  it('keeps review wording honest and binds dermatology to its exact answer note', async () => {
    const casePackages = await listCasePackages();
    const melanomaCase = casePackages.find((entry) => entry.id === 'derm-melanoma');
    const bccCase = casePackages.find((entry) => entry.id === 'derm-bcc');
    if (!melanomaCase || !bccCase) throw new Error('Expected dermatology fixtures.');

    const melanoma = await requireLessonPlanForCase(melanomaCase);
    const bcc = await requireLessonPlanForCase(bccCase);
    const combined = `${melanoma.educatorTutorInstructions}\n${bcc.educatorTutorInstructions}`;

    expect(combined).not.toMatch(/pre-verified|reviewed by|verified by|board-alignment/i);
    expect(melanoma.educatorTutorInstructions).toContain(melanomaCase.teachingNotes[0]);
    expect(melanoma.educatorTutorInstructions).not.toContain(bccCase.teachingNotes[0]);
    expect(bcc.educatorTutorInstructions).toContain(bccCase.teachingNotes[0]);
  });

  it('teaches send-time capture without referring to the removed camera workflow', async () => {
    const casePackages = await listCasePackages();
    const plans = await Promise.all(casePackages.map(requireLessonPlanForCase));
    const learnerOpenings = plans.flatMap((plan) => (
      plan.learnerOpenings?.map((opening) => opening.content) ?? []
    ));

    expect(learnerOpenings.join('\n')).not.toMatch(
      /capture it with the camera|capture what you see|then capture/i,
    );
    const mriPlan = plans.find((plan) => plan.id === 'local-study-sub1-lesson');
    const pathologyPlan = plans.find((plan) => plan.id === 'patho-study-breast-lesson');
    expect(mriPlan?.learnerOpenings?.every((opening) => (
      opening.content.includes('press Send') || !opening.content.toLowerCase().includes('capture')
    ))).toBe(true);
    expect(pathologyPlan?.learnerOpenings?.find(
      (opening) => opening.learnerLevel === 'ms_preclinical',
    )?.content).toContain('press Send');
  });

  it('composes one case-specific prompt with the exact ref and no wrong-case fallback', async () => {
    const casePackages = await listCasePackages();
    const epiduralCase = casePackages.find((entry) => entry.id === 'ct-epidural');
    if (!epiduralCase) throw new Error('Expected epidural fixture.');
    const lessonPlan = await requireLessonPlanForCase(epiduralCase);

    const prompt = await composeLessonPrompt(lessonPlan, {
      learnerLevel: 'ms_preclinical',
      mode: 'chat',
      hasImage: true,
      caseContext: {
        id: epiduralCase.id,
        title: epiduralCase.title,
        vignette: epiduralCase.vignette,
        neutralDescription: epiduralCase.neutralDescription,
        domain: epiduralCase.domain,
      },
    });
    const providerPrompt = prompt.providerPrompt;

    expect(providerPrompt).toContain('EPIDURAL HEMATOMA');
    expect(providerPrompt).not.toContain('CHRONIC SUBDURAL HEMATOMA');
    expect(providerPrompt).not.toContain('brain MRI with 4 sequences');
    expect(providerPrompt).toContain(epiduralCase.lessonPlanRef.sha256);
    expect(providerPrompt).toContain('No clinical-teaching sources are recorded.');
    expect(providerPrompt).toContain('[scope: artifact-provenance]');
  });
});
