import type { CasePackageV1 } from '../../src/core/casePackage';
import { validateIntroCacheV1, type IntroCacheV1 } from '../../src/core/introCache';

/** Match the shipped-cache review and lesson gates without changing its contents. */
export function starterEntryFor(casePackage: CasePackageV1, lessonSha256: string, payload: unknown): readonly [string, string] | null {
  const result = validateIntroCacheV1(payload);
  if (!result.valid) return null;
  const cache = payload as IntroCacheV1;
  if (cache.caseId !== casePackage.id || cache.review.status !== 'approved'
    || cache.lessonPlanSha256 !== lessonSha256
    || casePackage.lessonPlanRef.sha256 !== lessonSha256) return null;
  return [casePackage.manifest.sha256, lessonSha256];
}
