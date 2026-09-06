import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { listBuiltinCasePackages, requireCasePackage } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import { validateIntroCacheV1 } from '../core/introCache';
import { BUILTIN_STARTERS } from '../data/builtinStarters.generated';
import { hasBuiltInStarter } from '../data/builtinStarters';
import { SAMPLE_CASE_ID } from '../data/sampleCase';
import { starterEntryFor } from '../../scripts/introCache/starterIndex';

describe('shipped starter availability', () => {
  it('advertises every and only valid approved cache for the actual current lessons', async () => {
    const cases = await listBuiltinCasePackages();
    const expected: string[] = [];
    for (const casePackage of cases) {
      const lesson = await requireLessonPlanForCase(casePackage);
      let cache: any = null;
      try { cache = JSON.parse(await readFile(`public/intro-cache/${casePackage.id}.json`, 'utf8')); }
      catch (error) { if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const eligible = validateIntroCacheV1(cache).valid && cache.caseId === casePackage.id
        && cache.review.status === 'approved' && cache.lessonPlanSha256 === lesson.manifest.sha256;
      expect(hasBuiltInStarter(casePackage), casePackage.id).toBe(eligible);
      if (eligible) expected.push(casePackage.id);
    }
    expect(Object.keys(BUILTIN_STARTERS)).toEqual(expected);
    expect(expected).toContain(SAMPLE_CASE_ID);
  });

  it('never reuses a positive entry for another ID, changed case, or changed lesson', async () => {
    const sample = await requireCasePackage(SAMPLE_CASE_ID);
    expect(hasBuiltInStarter(sample)).toBe(true);
    expect(hasBuiltInStarter({ ...sample, id: 'unknown-case' })).toBe(false);
    expect(hasBuiltInStarter({ ...sample, manifest: { ...sample.manifest, sha256: 'a'.repeat(64) } })).toBe(false);
    expect(hasBuiltInStarter({ ...sample, lessonPlanRef: { ...sample.lessonPlanRef, sha256: 'a'.repeat(64) } })).toBe(false);
  });

  it('excludes missing, invalid, incomplete, draft, wrongly identified, and stale answers without modifying them', async () => {
    const sample = await requireCasePackage(SAMPLE_CASE_ID);
    const lesson = await requireLessonPlanForCase(sample);
    const original = JSON.parse(await readFile(`public/intro-cache/${sample.id}.json`, 'utf8'));
    const missingLevel = structuredClone(original);
    delete missingLevel.levels.resident;
    const emptyAnswer = structuredClone(original);
    emptyAnswer.levels.highschool.introQuestions[0].cachedAnswer = ' ';
    const candidates = [null, {}, 'not JSON', missingLevel, emptyAnswer,
      { ...original, review: { status: 'draft' } },
      { ...original, caseId: 'other-case' },
      { ...original, lessonPlanSha256: 'a'.repeat(64) }];
    for (const candidate of candidates) {
      const before = JSON.stringify(candidate);
      expect(starterEntryFor(sample, lesson.manifest.sha256, candidate)).toBeNull();
      expect(JSON.stringify(candidate)).toBe(before);
    }
    expect(starterEntryFor(sample, 'a'.repeat(64), original)).toBeNull();
    expect(starterEntryFor(sample, lesson.manifest.sha256, original)).toEqual([sample.manifest.sha256, lesson.manifest.sha256]);
  });
});
