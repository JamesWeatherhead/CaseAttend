import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { SAMPLE_CASE_ID } from '../data/sampleCase';
import { requireCasePackage } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import { validateIntroCacheV1 } from '../core/introCache';

it('ships approved answers bound to the current sample lesson for every learner level', async () => {
  const sample = await requireCasePackage(SAMPLE_CASE_ID);
  const lesson = await requireLessonPlanForCase(sample);
  const cache = JSON.parse(await readFile(`public/intro-cache/${SAMPLE_CASE_ID}.json`, 'utf8'));
  expect(validateIntroCacheV1(cache).valid).toBe(true);
  expect(cache.caseId).toBe(sample.id);
  expect(cache.review.status).toBe('approved');
  expect(cache.lessonPlanSha256).toBe(lesson.manifest.sha256);
  for (const level of ['highschool', 'undergrad', 'ms_preclinical', 'ms_clinical', 'resident']) {
    expect(cache.levels[level].introQuestions.length).toBeGreaterThan(0);
    expect(cache.levels[level].introQuestions.every((question: { cachedAnswer: string }) => question.cachedAnswer.trim().length > 0)).toBe(true);
  }
});
