import { describe, expect, it } from 'vitest';
import { composeLessonPrompt, getLessonPlanRef, verifyLessonPlanManifestHash } from '../core/lessonPlan';
import { listCasePackages } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';

const EXPECTED_LEGACY_LESSON_MANIFESTS: Readonly<Record<string, string>> = {
  'local-study-sub1-lesson': '03b563b5cadb01c4ab870c6134e057608d95e8843316712c5a4d20fbdf155eaf',
  'patho-study-breast-lesson': '467260f7c5020af8cc2d9a7385af487c867c2010ce795c6da08bb9cac1f2355a',
  'cxr-pneumothorax-lesson': '986e762cbc2edb7d6c9fdc7c877770ddd38f5b18e2933bed7b048363a40db25a',
  'cxr-pneumonia-lesson': '0c06f5d7d7aa0dc2d707592831371c5af53af5272d6d2b196f3a1c7011e9c1f5',
  'cxr-chf-lesson': '33265d36b3e633cc85634a23a1bd75f45db2f80478fb7c41864cb0a8acf974a3',
  'cxr-effusion-lesson': '4cddb1f2f6abb1def64d907a655469cf8c651775ac3c4c4cb0b675d400f8b2f7',
  'axr-sbo-lesson': '80376b161f66a1f40eadac26da393d72b4b701bc2108d97860b61fda431c72e9',
  'ct-epidural-lesson': '55a8ae270138587432ab7ba8fef0ee6c6ca1f0e47b7a25de6bac46bbc4c5a9f1',
  'ct-subdural-lesson': '60af6c9436ed79390172fe8d390cf2297cb484a8e3ee24e2a6a48e6a2748566b',
  'cxr-pneumoperitoneum-lesson': '9c19779ee420f6b04a80c94a0d6f4c6036f2895b9d4a1a44a77f5a3d7d2690e0',
  'axr-nec-lesson': '8bcf2263b4ed39d1a85e0b3c4684e13c25ad4d932b11ff81439fa5638399d3e5',
  'xr-colles-lesson': 'e7122aa6840955998971d6e25b98ece02058dc41ceff0b2e1101416e403e403f',
  'derm-melanoma-lesson': '531135b180b2a17e8e13c5788deb420a9aa9f1e8bd4c0ff8e7eeaee5bc634b18',
  'derm-bcc-lesson': 'f564b617d7f79d0b0d36a62ca06310e4414cfa2582829ba2bf45586d6172aa83',
  'derm-sebk-lesson': 'b0c27de794d32ab2f5a880929f246817c0cf1dbfff6d1c64ec82dbf78249ebef',
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
