import { describe, expect, it } from 'vitest';
import {
  computeCasePackageManifestHash,
  createCasePackageV1,
  validateCasePackageDraftV1,
  validateCasePackageV1,
  verifyCasePackageManifestHash,
  type CasePackageV1Draft,
} from '../core/casePackage';

const IMAGE_HASH = '1'.repeat(64);
const LESSON_HASH = '2'.repeat(64);

function singleImageDraft(): CasePackageV1Draft {
  return {
    schemaVersion: '1.0',
    id: 'derm-example',
    title: 'Adult with an evolving pigmented lesion',
    vignette: 'The lesion has changed in size and color over twelve months.',
    domain: 'dermatology',
    difficulty: 'intermediate',
    artifact: {
      kind: 'image',
      modality: 'XC',
      seriesId: 'clinical-photo',
      seriesLabel: 'Clinical photograph',
      src: '/images/derm-example/1.jpg',
      mimeType: 'image/jpeg',
      sha256: IMAGE_HASH,
      alt: 'Close clinical photograph of a pigmented skin lesion.',
      width: 1200,
      height: 900,
    },
    preview: {
      src: '/images/derm-example/1.jpg',
      mimeType: 'image/jpeg',
      sha256: IMAGE_HASH,
      alt: 'Preview of a pigmented skin lesion teaching case.',
    },
    artifactHints: {
      showWindowLevel: false,
      showSeriesSelector: false,
      showSegmentation: true,
    },
    provenance: {
      sourceName: 'Open teaching image collection',
      sourceUrl: 'https://example.edu/open-images',
      license: {
        name: 'Creative Commons Attribution 4.0 International',
        spdxId: 'CC-BY-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
      attribution: 'Example University teaching collection',
      clinicianReview: { reviewed: false },
    },
    deidentification: {
      status: 'attested',
      attestedBy: 'Case contributor',
      attestedAt: '2026-08-09T00:00:00.000Z',
    },
    contentWarnings: ['Clinical image'],
    neutralDescription: 'A close clinical photograph of a single pigmented lesion on skin.',
    teachingNotes: ['Ask the learner to describe morphology before forming a differential.'],
    lessonPlanRef: {
      id: 'dermatology-description',
      version: '1.0.0',
      sha256: LESSON_HASH,
    },
    presentation: {
      subtitle: 'Dermatology',
      category: 'clinical-photograph',
      accentColor: 'rgba(34,197,94,1)',
      accentGlow: 'rgba(34,197,94,0.15)',
      accentBorder: 'rgba(34,197,94,0.3)',
      textClass: 'text-green-400',
    },
  };
}

describe('Case Package v1', () => {
  it('returns plain, actionable validation errors', () => {
    const draft = singleImageDraft();
    const invalid = {
      ...draft,
      title: ' ',
      artifact: { ...draft.artifact, sha256: 'not-a-digest' },
      provenance: {
        ...draft.provenance,
        clinicianReview: { reviewed: true },
      },
    };

    const result = validateCasePackageDraftV1(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title is required and must be a non-empty string.');
    expect(result.errors).toContain('artifact.sha256 must be a lowercase 64-character SHA-256 digest.');
    expect(result.errors).toContain(
      'provenance.clinicianReview.reviewer is required and must be a non-empty string.',
    );
    expect(result.errors).toContain(
      'provenance.clinicianReview.credentials is required and must be a non-empty string.',
    );
    expect(result.errors).toContain(
      'provenance.clinicianReview.reviewedAt is required and must be a non-empty string.',
    );
  });

  it('rejects legacy identifiers and unknown fields instead of preserving PHI-shaped data', () => {
    const invalid = {
      ...singleImageDraft(),
      patientId: 'PATIENT-123',
      artifact: {
        ...singleImageDraft().artifact,
        accessionNumber: 'ACC-456',
      },
    };

    const result = validateCasePackageDraftV1(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('casePackage.patientId is not valid in Case Package v1.');
    expect(result.errors).toContain('artifact.accessionNumber is not valid in Case Package v1.');
  });

  it('rejects unsafe image references, unsupported MIME types, and external previews', () => {
    const draft = singleImageDraft();
    const result = validateCasePackageDraftV1({
      ...draft,
      artifact: {
        ...draft.artifact,
        src: '../../private/patient.jpg',
        mimeType: 'image/svg+xml',
      },
      preview: {
        ...draft.preview,
        src: '/images/another-case/1.jpg',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'artifact.src must be a safe /images/, case://assets/, or HTTPS image reference.',
    );
    expect(result.errors).toContain('artifact.mimeType must be image/jpeg, image/png, or image/webp.');
    expect(result.errors).toContain('preview.src must reference an image included in artifact.');
  });

  it('requires native image artifacts for single-frame cases', () => {
    const draft = singleImageDraft();
    const result = validateCasePackageDraftV1({
      ...draft,
      artifact: {
        kind: 'image-stack',
        series: [{
          id: 'clinical-photo',
          label: 'Clinical photograph',
          modality: 'XC',
          frames: [{
            id: 'frame-1',
            src: draft.artifact.kind === 'image' ? draft.artifact.src : '',
            mimeType: 'image/jpeg',
            sha256: IMAGE_HASH,
            alt: 'Close clinical photograph of a pigmented skin lesion.',
          }],
        }],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("artifact.kind must be 'image' when the package contains exactly one frame.");
  });

  it('produces a deterministic hash regardless of object key insertion order', async () => {
    const draft = singleImageDraft();
    const reordered = Object.fromEntries(Object.entries(draft).reverse()) as unknown as CasePackageV1Draft;
    reordered.presentation = Object.fromEntries(
      Object.entries(draft.presentation).reverse(),
    ) as unknown as CasePackageV1Draft['presentation'];

    await expect(computeCasePackageManifestHash(reordered)).resolves.toBe(
      await computeCasePackageManifestHash(draft),
    );
  });

  it('changes the hash when educational content or artifact integrity changes', async () => {
    const draft = singleImageDraft();
    const originalHash = await computeCasePackageManifestHash(draft);
    const changedTeaching = {
      ...draft,
      teachingNotes: ['First ask the learner to identify asymmetry.'],
    };
    const changedArtifact = {
      ...draft,
      artifact: { ...draft.artifact, sha256: '3'.repeat(64) },
    };

    await expect(computeCasePackageManifestHash(changedTeaching)).resolves.not.toBe(originalHash);
    await expect(computeCasePackageManifestHash(changedArtifact)).resolves.not.toBe(originalHash);
  });

  it('finalizes and verifies a valid single-image case', async () => {
    const { schemaVersion: _schemaVersion, ...input } = singleImageDraft();
    const packageV1 = await createCasePackageV1(input);

    expect(packageV1.schemaVersion).toBe('1.0');
    expect(packageV1.artifact.kind).toBe('image');
    expect(packageV1.manifest.algorithm).toBe('SHA-256');
    expect(packageV1.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(validateCasePackageV1(packageV1)).toEqual({ valid: true, errors: [] });
    await expect(verifyCasePackageManifestHash(packageV1)).resolves.toBe(true);

    const tampered = { ...packageV1, vignette: `${packageV1.vignette} New symptom.` };
    await expect(verifyCasePackageManifestHash(tampered)).resolves.toBe(false);
  });
});
