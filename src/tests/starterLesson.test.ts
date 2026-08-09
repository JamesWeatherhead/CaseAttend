import { describe, expect, it } from 'vitest';
import {
  composeLessonPrompt,
  validateLessonPlanV1,
  verifyLessonPlanManifestHash,
} from '../core/lessonPlan';
import { createStarterLessonPlanV1 } from '../core/starterLesson';

describe('generic starter lesson', () => {
  it('creates a valid answer-neutral, explicitly unreviewed lesson', async () => {
    const lesson = await createStarterLessonPlanV1({
      caseId: 'skin-lesion-demo',
      neutralDescription: 'A close image of a single skin lesion.',
      teachingNotes: ['Ask for a visible description before an interpretation.'],
      sourceName: 'Example open teaching collection',
      sourceUrl: 'https://example.edu/teaching-images/skin-lesion-demo',
    });

    expect(validateLessonPlanV1(lesson)).toEqual({ valid: true, errors: [] });
    await expect(verifyLessonPlanManifestHash(lesson)).resolves.toBe(true);
    expect(lesson.id).toBe('skin-lesion-demo-starter-lesson');
    expect(lesson.clinicalReview).toEqual({ reviewed: false });
    expect(lesson.citations).toEqual([
      {
        id: 'artifact-source',
        title: 'Example open teaching collection',
        scope: 'artifact-provenance',
        url: 'https://example.edu/teaching-images/skin-lesion-demo',
      },
    ]);
    expect(JSON.stringify(lesson)).not.toMatch(/diagnosis\s*:/i);
  });

  it('does not promote artifact provenance into clinical support in search mode', async () => {
    const lesson = await createStarterLessonPlanV1({
      caseId: 'plain-image',
      neutralDescription: 'A teaching image with no answer in its description.',
      teachingNotes: ['Keep observations separate from inferences.'],
      sourceName: 'Licensed image source',
      sourceUrl: 'https://example.org/image-source',
      learnerLevels: ['undergrad'],
    });

    const prompt = await composeLessonPrompt(lesson, {
      learnerLevel: 'undergrad',
      mode: 'search',
      hasImage: true,
      caseContext: {
        id: 'plain-image',
        title: 'Unreviewed teaching image',
        vignette: 'The learner is asked to inspect the image.',
        neutralDescription: lesson.neutralDescription,
        domain: 'dermatology',
      },
    });

    expect(prompt.providerPrompt).toContain(
      'No clinical-teaching sources are recorded. Treat clinical claims as unreviewed draft content',
    );
    expect(prompt.providerPrompt).toContain('Clinical review status: not reviewed.');
  });

  it('rejects a non-HTTPS provenance URL through Lesson Plan v1 validation', async () => {
    await expect(createStarterLessonPlanV1({
      caseId: 'unsafe-source',
      neutralDescription: 'A neutral teaching image.',
      teachingNotes: ['Describe the image.'],
      sourceName: 'Unsafe source',
      sourceUrl: 'http://example.org/image',
    })).rejects.toThrow('citations[0].url must be an HTTPS URL');
  });
});
