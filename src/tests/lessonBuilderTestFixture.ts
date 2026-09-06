import { finalizeCasePackageV1 } from '../core/casePackage';
import { getLessonPlanRef } from '../core/lessonPlan';
import { createPortableCaseAssetV1, createPortableCasePackageV1 } from '../core/portableCasePackage';
import { createStarterLessonPlanV1 } from '../core/starterLesson';
import { makePortableCasePackage } from './portableCaseTestFixture';

/** Nonclinical material for exercising a complete local editing workflow. */
export async function makeEditableLessonCase(id = 'lesson-refinement-check') {
  const base = await makePortableCasePackage();
  const asset = await createPortableCaseAssetV1(Uint8Array.from(atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  ), c => c.charCodeAt(0)));
  const neutralDescription = 'A plain synthetic test image.';
  const teachingNotes = ['This is a software workflow check, not medical content.'];
  const lessonPlan = await createStarterLessonPlanV1({
    caseId: id, title: 'Lesson refinement check', neutralDescription, teachingNotes,
    sourceName: 'Synthetic software test', sourceUrl: 'https://example.org/synthetic-test',
    learnerLevels: ['undergrad'],
  });
  const { manifest: _manifest, ...draft } = base.casePackage;
  const source = { src: asset.uri, mimeType: asset.mimeType, sha256: asset.sha256,
    width: asset.width, height: asset.height, alt: neutralDescription };
  const casePackage = await finalizeCasePackageV1({
    ...draft, id, title: 'Lesson refinement check', vignette: 'A synthetic editing exercise.',
    neutralDescription, teachingNotes, lessonPlanRef: getLessonPlanRef(lessonPlan),
    artifact: { kind: 'image', modality: 'OT', seriesId: 'test-image', seriesLabel: 'Test image', ...source },
    preview: source, deidentification: { status: 'synthetic' }, contentWarnings: [],
    provenance: { sourceName: 'Synthetic software test', sourceUrl: 'https://example.org/synthetic-test',
      license: { name: 'CC0' }, attribution: 'Synthetic test fixture', clinicianReview: { reviewed: false } },
  });
  return createPortableCasePackageV1(casePackage, lessonPlan, [asset]);
}
