import type { CasePackageV1 } from '../core/casePackage';
import { BUILTIN_STARTERS } from './builtinStarters.generated';

/** Positive shipped availability only; the tutor still validates the actual cache. */
export function hasBuiltInStarter(casePackage: CasePackageV1): boolean {
  const entry = BUILTIN_STARTERS[casePackage.id];
  return Boolean(entry && entry[0] === casePackage.manifest.sha256
    && entry[1] === casePackage.lessonPlanRef.sha256);
}
