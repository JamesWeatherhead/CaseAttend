import { describe, expect, it } from 'vitest';
import {
  createCaseLessonBundleV1,
  validateCaseLessonBundleV1,
} from '../core/caseLessonBundle';
import { listCasePackages } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';

describe('Case Lesson Bundle v1', () => {
  it('exports only the exact verified Case Package and Lesson Plan pair', async () => {
    const casePackage = (await listCasePackages())[0];
    const lessonPlan = await requireLessonPlanForCase(casePackage);
    const bundle = await createCaseLessonBundleV1(casePackage, lessonPlan);

    await expect(validateCaseLessonBundleV1(bundle)).resolves.toEqual({ valid: true, errors: [] });
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toMatch(/authorization|apiKey|openrouter.*key|chatMessage|thumbnail|screenshot/i);
  });

  it('rejects a mismatched plan, changed educational content, and unknown export fields', async () => {
    const casePackages = await listCasePackages();
    const firstPlan = await requireLessonPlanForCase(casePackages[0]);
    const secondPlan = await requireLessonPlanForCase(casePackages[1]);

    const mismatched = await validateCaseLessonBundleV1({
      schema: 'caseattend.case-lesson-bundle',
      schemaVersion: '1.0',
      casePackage: casePackages[0],
      lessonPlan: secondPlan,
      apiKey: 'must-not-export',
    });
    expect(mismatched.valid).toBe(false);
    expect(mismatched.errors).toContain('bundle.apiKey is not valid in Case Lesson Bundle v1.');
    expect(mismatched.errors).toContain(
      'bundle.casePackage.lessonPlanRef must match the exact bundled Lesson Plan manifest.',
    );

    const tampered = await validateCaseLessonBundleV1({
      schema: 'caseattend.case-lesson-bundle',
      schemaVersion: '1.0',
      casePackage: casePackages[0],
      lessonPlan: { ...firstPlan, neutralDescription: 'Changed after review.' },
    });
    expect(tampered.errors).toContain('bundle.lessonPlan manifest does not match its content.');
  });
});
