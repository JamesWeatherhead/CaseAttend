/**
 * Enumerate every built-in lesson for the intro-cache batch job.
 *
 * Two sources are stitched together:
 *   1. Legacy `BUILTIN_CASE_DRAFTS` in src/data/caseRegistry.ts (MRI, pathology,
 *      the CXR/CT/derm hand-authored bundles).
 *   2. `BUILTIN_CONTENT_PACKS` in src/data/builtinContentPacks.ts (the newer
 *      open-license packs; ~85 cases across radiology, path, derm, ecg,
 *      ultrasound, ophthalmology).
 *
 * Runs under `tsx` in Node so we can reuse the exact same builders that ship
 * to the browser. No IndexedDB, no fetch: everything is pure in-memory.
 */

import { computeMediaSha } from '../../src/core/introCache';
import type { CasePackageV1 } from '../../src/core/casePackage';
import type { LessonPlanV1 } from '../../src/core/lessonPlan';
import { getLessonPlanRef } from '../../src/core/lessonPlan';
import { createCasePackageV1 } from '../../src/core/casePackage';
import { createBuiltinLessonPlan } from '../../src/data/lessonRegistry';
import { buildContentPack } from '../../src/data/contentPack';
import { BUILTIN_CONTENT_PACKS } from '../../src/data/builtinContentPacks';

/**
 * The `BUILTIN_CASE_DRAFTS` constant is not exported from caseRegistry, so we
 * import the finalized case packages via the same public path the runtime uses.
 * The runtime enumerator itself lives in caseRegistry.ts and only imports pure
 * modules (no browser storage), so it is safe to call from Node.
 */
import { listBuiltinCasePackages } from '../../src/data/caseRegistry';

export interface EnumeratedLesson {
  caseId: string;
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
  /** Image assets in this lesson, in the order they appear. */
  assets: readonly { src: string; sha256: string; mimeType: string }[];
  /** Deterministic media + neutral-description fingerprint. */
  mediaSha: string;
}

function assetsFromCasePackage(casePackage: CasePackageV1): EnumeratedLesson['assets'] {
  if (casePackage.artifact.kind === 'image') {
    return [{
      src: casePackage.artifact.src,
      sha256: casePackage.artifact.sha256,
      mimeType: casePackage.artifact.mimeType,
    }];
  }
  return casePackage.artifact.series.flatMap((series) =>
    series.frames.map((frame) => ({
      src: frame.src,
      sha256: frame.sha256,
      mimeType: frame.mimeType,
    })),
  );
}

async function enumerateLegacyCases(): Promise<EnumeratedLesson[]> {
  const casePackages = await listBuiltinCasePackages();
  const result: EnumeratedLesson[] = [];
  for (const casePackage of casePackages) {
    // Only the two legacy hand-authored cases (local-study-sub1, patho-study-breast)
    // and the singleImageDraft-derived set are covered here; the content pack
    // registry has its own enumerator below. `createBuiltinLessonPlan` is safe
    // to call twice (it caches by case id).
    if (!isLegacyCaseId(casePackage.id)) continue;
    const lessonPlan = await createBuiltinLessonPlan(casePackage);
    const assets = assetsFromCasePackage(casePackage);
    const mediaSha = await computeMediaSha({
      neutralDescription: casePackage.neutralDescription,
      assets: assets.map((asset) => ({ src: asset.src, sha256: asset.sha256 })),
    });
    result.push({
      caseId: casePackage.id,
      casePackage,
      lessonPlan,
      assets,
      mediaSha,
    });
  }
  return result;
}

// The legacy hand-authored roster. Kept in-file here (not exported from the
// runtime module) so the batch job's set of cases is auditable in one place.
const LEGACY_CASE_IDS = new Set<string>([
  'local-study-sub1',
  'patho-study-breast',
  'cxr-pneumothorax',
  'cxr-pneumonia',
  'cxr-chf',
  'cxr-effusion',
  'axr-sbo',
  'ct-epidural',
  'ct-subdural',
  'cxr-pneumoperitoneum',
  'axr-nec',
  'xr-colles',
  'derm-melanoma',
  'derm-bcc',
  'derm-sebk',
]);

function isLegacyCaseId(caseId: string): boolean {
  return LEGACY_CASE_IDS.has(caseId);
}

async function enumeratePackCases(): Promise<EnumeratedLesson[]> {
  const result: EnumeratedLesson[] = [];
  for (const pack of BUILTIN_CONTENT_PACKS) {
    const built = await buildContentPack(pack);
    for (const entry of built) {
      const assets = assetsFromCasePackage(entry.casePackage);
      const mediaSha = await computeMediaSha({
        neutralDescription: entry.casePackage.neutralDescription,
        assets: assets.map((asset) => ({ src: asset.src, sha256: asset.sha256 })),
      });
      result.push({
        caseId: entry.casePackage.id,
        casePackage: entry.casePackage,
        lessonPlan: entry.lessonPlan,
        assets,
        mediaSha,
      });
    }
  }
  return result;
}

export async function enumerateAllLessons(): Promise<EnumeratedLesson[]> {
  const [legacy, packs] = await Promise.all([enumerateLegacyCases(), enumeratePackCases()]);
  const seen = new Set<string>();
  const combined: EnumeratedLesson[] = [];
  for (const entry of [...legacy, ...packs]) {
    if (seen.has(entry.caseId)) continue;
    seen.add(entry.caseId);
    combined.push(entry);
  }
  return combined;
}

/** Convenience: also return the lesson plan sha256 that binds the artifact. */
export function lessonPlanSha256(lessonPlan: LessonPlanV1): string {
  return getLessonPlanRef(lessonPlan).sha256;
}

// Re-export from core so scripts don't reach back through relative imports.
export { createCasePackageV1, getLessonPlanRef };
