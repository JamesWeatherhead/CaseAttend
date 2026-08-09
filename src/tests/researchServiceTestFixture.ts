import { finalizeCasePackageV1 } from '../core/casePackage';
import { composeLessonPrompt } from '../core/lessonPlan';
import { createPortableCasePackageV1 } from '../core/portableCasePackage';
import { createResearchManifestV1 } from '../core/researchManifest';
import { createResearchStudyBundleV1 } from '../core/researchStudyBundle';
import { makePortableCasePackage } from './portableCaseTestFixture';
import { makeResearchManifestInput } from './researchTestFixtures';

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** A small, hash-correct, institution-cleared fixture suitable for launch tests. */
export async function makeLaunchReadyResearchStudyBundle(options: {
  browserDeleteAfter?: string;
  exportedCopiesDeleteAfter?: string;
} = {}) {
  const initial = await makePortableCasePackage();
  const { manifest: _caseManifest, ...caseDraft } = initial.casePackage;
  const casePackage = await finalizeCasePackageV1({
    ...caseDraft,
    deidentification: {
      status: 'synthetic',
      notes: 'Generated test pixels contain no person or patient data.',
    },
  });
  const portable = await createPortableCasePackageV1(
    casePackage,
    initial.lessonPlan,
    initial.assets,
  );
  const input = makeResearchManifestInput({
    portable,
    oversight: {
      status: 'institution-determined',
      determination: 'approved',
      institutionName: 'Example University',
      protocolReference: 'IRB-TEST-001',
      determinedAt: '2026-01-02T00:00:00Z',
    },
  });
  const dataManagement = {
    ...input.dataManagement,
    browserDeleteAfter: options.browserDeleteAfter ?? input.dataManagement.browserDeleteAfter,
    exportedCopiesDeleteAfter: options.exportedCopiesDeleteAfter
      ?? input.dataManagement.exportedCopiesDeleteAfter,
  };
  const arms = await Promise.all(input.arms.map(async (arm) => ({
    ...arm,
    caseSteps: await Promise.all(arm.caseSteps.map(async (step) => {
      const composed = await composeLessonPrompt(portable.lessonPlan, {
        learnerLevel: step.learnerLevel,
        mode: step.mode,
        hasImage: true,
        caseContext: {
          id: portable.casePackage.id,
          title: portable.casePackage.title,
          vignette: portable.casePackage.vignette,
          neutralDescription: portable.casePackage.neutralDescription,
          domain: portable.casePackage.domain,
        },
      });
      return {
        ...step,
        systemPromptSha256: await sha256Text(composed.providerPrompt),
      };
    })),
  })));
  const manifest = await createResearchManifestV1({ ...input, arms, dataManagement });
  return createResearchStudyBundleV1(manifest, [portable]);
}
