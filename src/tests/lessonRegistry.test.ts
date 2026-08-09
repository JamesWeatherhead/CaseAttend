import { describe, expect, it } from 'vitest';
import { composeLessonPrompt, getLessonPlanRef, verifyLessonPlanManifestHash } from '../core/lessonPlan';
import { listCasePackages } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';

const EXPECTED_LEGACY_LESSON_MANIFESTS: Readonly<Record<string, string>> = {
  'local-study-sub1-lesson': 'a9357179ee6acd109bd99484dc6dea5ebc06c8a195e1163e97f84d197e987190',
  'patho-study-breast-lesson': 'eead8942a616d31bdd6018040f0dd8211cce9bdceb5334722fb07d31f7476e55',
  'cxr-pneumothorax-lesson': '1028f0859be97e1526c9169af4c171f3228a793ad1f332bfd604b718c546108c',
  'cxr-pneumonia-lesson': '19a49f2cbb56799e61340960222bcfb1dd07fdd89322a4c3055427daa9b88637',
  'cxr-chf-lesson': 'a9964f9f9ee82d5535a3a22e5bd613366437093dd16373cefdf14afeddeabe19',
  'cxr-effusion-lesson': '9e7083e34bd2d292cdd5b516a63cafd057a508afaf962c9fbc14573d239f3fca',
  'axr-sbo-lesson': '859ff33d9a301da552305d212fe940bdf22f95605448dd2328cb4ae95fc17881',
  'ct-epidural-lesson': '8315a05adf2adcad76ef40f2dab12a028ffbc405e97b7b2e4fa5dfd30824403b',
  'ct-subdural-lesson': 'ffc00d38c30dd9e8343f95e1c74831bdc4a731619d7f1c0cdd896d59f10e6983',
  'cxr-pneumoperitoneum-lesson': 'b018a6338a866bc1033aaf5764686c677c948cccf4ac8b38d4ffdb2c0561e929',
  'axr-nec-lesson': 'cfcdc5395b30d89ec016319217ea4a97ff911d7bec921817ca7bb8123fd3095b',
  'xr-colles-lesson': '3ba3d3775b172219aef34bad1023008410617c5f9a1d9cf63ca0bea081b22de8',
  'derm-melanoma-lesson': 'af38ef8f7737e62d09c153b85ef40d8dca40d40d2211c600b62caa0a90390939',
  'derm-bcc-lesson': '7d7c8ba45a4b84abf64bd7e7d224862347b57a46153d422a5236faaa170840ad',
  'derm-sebk-lesson': '2fd44d4d2a9de60b327f3520683666708079ddc0e818c3f3cb748d9e7047ad3f',
};

describe('built-in Lesson Plan registry', () => {
  it('binds every Case Package to one exact, verified Lesson Plan manifest', async () => {
    const casePackages = await listCasePackages();
    const plans = await Promise.all(casePackages.map(requireLessonPlanForCase));

    expect(plans).toHaveLength(casePackages.length);
    expect(plans.length).toBeGreaterThanOrEqual(15);
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(plans.length);
    for (const [index, plan] of plans.entries()) {
      expect(getLessonPlanRef(plan)).toEqual(casePackages[index].lessonPlanRef);
      await expect(verifyLessonPlanManifestHash(plan)).resolves.toBe(true);
      expect(plan.neutralDescription).toBe(casePackages[index].neutralDescription);
      expect(plan.teachingNotes).toEqual(casePackages[index].teachingNotes);
      expect(plan.clinicalReview).toEqual({ reviewed: false });
      expect(plan.citations.some((citation) => citation.scope === 'artifact-provenance')).toBe(true);
      expect(plan.objectives.length).toBeGreaterThanOrEqual(3);
      expect(plan.rubric.criteria.length).toBe(plan.objectives.length);
    }
    for (const plan of plans.slice(0, 15)) {
      expect(plan.manifest.sha256).toBe(EXPECTED_LEGACY_LESSON_MANIFESTS[plan.id]);
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
