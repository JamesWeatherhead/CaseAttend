import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_MEDICAL_SAFETY_POLICY,
  composeLessonPrompt,
  getLessonPlanRef,
  verifyLessonPlanManifestHash,
} from '../core/lessonPlan';
import { verifyCasePackageManifestHash } from '../core/casePackage';
import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  buildContentPack,
  defineContentPack,
  type ContentPackCaseDefinition,
} from '../data/contentPack';

const FIXTURE_ASSET = '/images/cxr-pneumonia/1.jpg' as const;
const FIXTURE_SHA256 = 'cae983ca0ed90b161ff55a49915f563939cdee792efcc98788e5749ae75e6f76';

function fixtureCase(index: number): ContentPackCaseDefinition {
  return {
    id: `content-pack-fixture-${index}`,
    title: `Fixture image case ${index}`,
    vignette: 'A fictional learner reviews a deidentified public teaching image.',
    domain: 'radiology',
    difficulty: 'introductory',
    image: {
      src: FIXTURE_ASSET,
      mimeType: 'image/jpeg',
      sha256: FIXTURE_SHA256,
      alt: 'Frontal grayscale chest radiograph showing the thorax.',
      modality: 'CR',
      seriesLabel: 'Frontal chest radiograph',
    },
    provenance: {
      sourceName: 'Public teaching image fixture',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pneumonia_x-ray.jpg',
      licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Pneumonia_x-ray.jpg#Licensing',
      attribution: 'Public teaching image contributor',
      license: {
        name: 'CC0 1.0 Universal',
        spdxId: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
    },
    contentWarnings: ['Medical imaging'],
    neutralDescription: 'Frontal grayscale chest radiograph showing the thorax.',
    teachingNotes: ['Draft teaching note for a fictional image case.'],
    deidentificationNotes: 'Public teaching asset. Deidentification has not been independently attested.',
    presentation: {
      subtitle: 'Chest radiograph',
      category: 'xray',
      accentColor: 'rgba(34,197,94,1)',
      accentGlow: 'rgba(34,197,94,0.15)',
      accentBorder: 'rgba(34,197,94,0.3)',
      textClass: 'text-green-400',
    },
    lesson: {
      objectives: [
        'Describe the image using neutral visual language.',
        {
          id: 'compare-regions',
          description: 'Compare corresponding regions before interpreting a finding.',
          hint: 'Compare the same anatomic region on both sides.',
        },
        'Connect one visible feature with one detail from the fictional vignette.',
      ],
      clinicalCitations: [
        {
          id: 'clinical-source',
          title: 'Clinical teaching source',
          url: 'https://www.ncbi.nlm.nih.gov/books/NBK000000/',
        },
      ],
    },
  };
}

function fixturePack(cases: readonly ContentPackCaseDefinition[]) {
  return defineContentPack({
    schema: CONTENT_PACK_SCHEMA,
    schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
    id: 'fixture-pack',
    title: 'Content pack test fixture',
    contentVersion: '1.0.0',
    cases,
  });
}

describe('typed Content Pack builder', () => {
  it('builds one exact, accessibility-complete case and matching unreviewed lesson', async () => {
    const bytes = await readFile(join(process.cwd(), 'public', FIXTURE_ASSET));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(FIXTURE_SHA256);

    const [entry] = await buildContentPack(fixturePack([fixtureCase(1)]));

    expect(entry.casePackage.artifact).toEqual(expect.objectContaining({
      kind: 'image',
      src: FIXTURE_ASSET,
      sha256: FIXTURE_SHA256,
      alt: 'Frontal grayscale chest radiograph showing the thorax.',
    }));
    expect(entry.casePackage.preview).toEqual(expect.objectContaining({
      src: FIXTURE_ASSET,
      sha256: FIXTURE_SHA256,
    }));
    expect(entry.casePackage.lessonPlanRef).toEqual(getLessonPlanRef(entry.lessonPlan));
    expect(entry.casePackage.provenance.clinicianReview).toEqual({ reviewed: false });
    expect(entry.casePackage.provenance.licenseEvidenceUrl).toContain('#Licensing');
    expect(entry.casePackage.deidentification).toEqual({
      status: 'not-reviewed',
      notes: 'Public teaching asset. Deidentification has not been independently attested.',
    });
    expect(entry.lessonPlan.clinicalReview).toEqual({ reviewed: false });
    expect(entry.lessonPlan.objectives.map((objective) => objective.id)).toEqual([
      'objective-1',
      'compare-regions',
      'objective-3',
    ]);
    expect(entry.lessonPlan.allowedHints).toHaveLength(3);
    expect(entry.lessonPlan.rubric.criteria).toHaveLength(3);
    expect(entry.lessonPlan.citations.map((citation) => citation.scope)).toEqual([
      'artifact-provenance',
      'clinical-teaching',
    ]);
    expect(Object.isFrozen(entry)).toBe(true);
    await expect(verifyCasePackageManifestHash(entry.casePackage)).resolves.toBe(true);
    await expect(verifyLessonPlanManifestHash(entry.lessonPlan)).resolves.toBe(true);
  });

  it('keeps the fixed public safety policy above content-pack teaching instructions', async () => {
    const [entry] = await buildContentPack(fixturePack([fixtureCase(1)]));
    const prompt = await composeLessonPrompt(entry.lessonPlan, {
      learnerLevel: 'ms_preclinical',
      mode: 'chat',
      hasImage: true,
      caseContext: {
        id: entry.casePackage.id,
        title: entry.casePackage.title,
        vignette: entry.casePackage.vignette,
        neutralDescription: entry.casePackage.neutralDescription,
        domain: entry.casePackage.domain,
      },
    });

    expect(prompt.fixedSafetyPolicy.content).toBe(PUBLIC_MEDICAL_SAFETY_POLICY);
    expect(prompt.providerPrompt.indexOf('FIXED PUBLIC SAFETY POLICY')).toBeLessThan(
      prompt.providerPrompt.indexOf('EDUCATOR-CONTROLLED LESSON CONTENT'),
    );
    expect(prompt.providerPrompt).toContain('Clinical review status: not reviewed.');
    expect(prompt.providerPrompt).toContain('[scope: artifact-provenance]');
    expect(prompt.providerPrompt).toContain('[scope: clinical-teaching]');
  });

  it('builds 100 paired records from one typed array without a case-ID objective map', async () => {
    const cases = Array.from({ length: 100 }, (_, index) => fixtureCase(index + 1));
    const entries = await buildContentPack(fixturePack(cases));

    expect(entries).toHaveLength(100);
    expect(new Set(entries.map((entry) => entry.casePackage.id)).size).toBe(100);
    expect(new Set(entries.map((entry) => entry.lessonPlan.id)).size).toBe(100);
    for (const entry of entries) {
      expect(entry.casePackage.lessonPlanRef).toEqual(getLessonPlanRef(entry.lessonPlan));
      expect(entry.casePackage.provenance.clinicianReview).toEqual({ reviewed: false });
      expect(entry.lessonPlan.clinicalReview).toEqual({ reviewed: false });
      expect(entry.casePackage.artifact).toEqual(expect.objectContaining({ sha256: FIXTURE_SHA256 }));
    }
  });

  it.each([
    ['ecg', 'ecg'],
    ['ultrasound', 'ultrasound'],
    ['ophthalmology', 'ophthalmology'],
  ] as const)('builds a paired %s case with a filterable presentation category', async (domain, category) => {
    const definition = fixtureCase(1);
    definition.domain = domain;
    definition.presentation = {
      ...definition.presentation,
      subtitle: `Step 2 | Clerkship | ${category}`,
      category,
    };
    const [entry] = await buildContentPack(fixturePack([definition]));

    expect(entry.casePackage.domain).toBe(domain);
    expect(entry.casePackage.presentation.category).toBe(category);
    expect(entry.casePackage.artifactHints.showWindowLevel).toBe(false);
  });

  it('fails closed on duplicate IDs, too few objectives, and malformed digests', async () => {
    const duplicate = fixtureCase(1);
    await expect(buildContentPack(fixturePack([duplicate, duplicate]))).rejects.toThrow(
      "contains duplicate case id 'content-pack-fixture-1'",
    );

    const tooFewObjectives = fixtureCase(2);
    tooFewObjectives.lesson = {
      ...tooFewObjectives.lesson,
      objectives: ['Observe the image.', 'Describe the image.'],
    };
    await expect(buildContentPack(fixturePack([tooFewObjectives]))).rejects.toThrow(
      'must define at least three learning objectives',
    );

    const malformedDigest = fixtureCase(3);
    malformedDigest.image = { ...malformedDigest.image, sha256: 'not-a-digest' };
    await expect(buildContentPack(fixturePack([malformedDigest]))).rejects.toThrow(
      'must be a lowercase 64-character SHA-256 digest',
    );

    const missingClinicalCitation = fixtureCase(4);
    missingClinicalCitation.lesson = {
      ...missingClinicalCitation.lesson,
      clinicalCitations: [],
    } as unknown as ContentPackCaseDefinition['lesson'];
    await expect(buildContentPack(fixturePack([missingClinicalCitation]))).rejects.toThrow(
      'must include at least one clinical-teaching citation',
    );

    const missingRightsEvidence = fixtureCase(5);
    missingRightsEvidence.provenance = {
      ...missingRightsEvidence.provenance,
      licenseEvidenceUrl: '',
    };
    await expect(buildContentPack(fixturePack([missingRightsEvidence]))).rejects.toThrow(
      'provenance.licenseEvidenceUrl must be a non-empty string',
    );
  });
});
