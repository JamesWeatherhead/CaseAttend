import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  casePackageToSeries,
  countCaseFrames,
  getCasePackage,
  listBuiltinCasePackages,
  listCasePackages,
  requireCasePackage,
  UnknownCasePackageError,
} from '../data/caseRegistry';
import { fetchDicomWebSeries } from '../services/dicomService';
import { verifyCasePackageManifestHash } from '../core/casePackage';
import { casePackageStore, type CasePackageSummary } from '../services/casePackageStore';
import { listBuiltinContentPackEntries } from '../data/contentPackRegistry';

const EXPECTED_IDS = [
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
] as const;

// Manifest hashes reflect the pipe-delimited Step/Clerkship subtitle tokens
// added to wire each legacy case into the study filter tabs. Regenerate these
// whenever a legacy case's presentation metadata changes on purpose.
const EXPECTED_LEGACY_MANIFESTS: Readonly<Record<(typeof EXPECTED_IDS)[number], string>> = {
  'local-study-sub1': 'a8652924062af72584c725eb8d0a30e37176196967c6fe84185170fb98e8ae4d',
  'patho-study-breast': '12049b5f73c3d8c71b1709783e82e086ab3fe6a47ff11645c7f45b7deac83423',
  'cxr-pneumothorax': '690ed193d3f01c8a70443e50bb2b506c52078b468d5e95a11f7e003adffa3892',
  'cxr-pneumonia': '8cf3c7601337a9dc0cf74fac72291a6bd11c63a167e64908d1ac3d99ad2e9581',
  'cxr-chf': 'c65e4e01a7b2ea60dfb4b541eecb23ce6f38ad4ddf200a466b5bad85104dc382',
  'cxr-effusion': '79a115ba9b7e4e43a6649c41157d1f4fd7a91b6014d2aadab7efb89ca8251a38',
  'axr-sbo': '469c28b5041264b27842df830160135185f58482032508abeef9c5f6ba46e4ca',
  'ct-epidural': 'befde8a4c017924676d02c0de6d20c79eb100c429c96ae956da467f5b2b65542',
  'ct-subdural': 'ccd4d68b347043e71216ab9fba07085407aae38d9ac0f33d0f6829441646f0c9',
  'cxr-pneumoperitoneum': '9f834d43879f007f5d166708a9bbf93f9a1acc17da670146cb170a68f2abf2dd',
  'axr-nec': '32e63683b953c4cac73ee008312ee36a66a8c2eeeb4016fc944a6ead89660650',
  'xr-colles': '1c119a279a5d1c19e098d2a64f4d36217b78ff7fd1fd1910a1c1cf65eac78fbb',
  'derm-melanoma': 'd84ae263e56780847c84a927f0a9ebab78897158ca4f990cac03b34d364f5dc8',
  'derm-bcc': 'c6e11f8d18b7d03c723d1d56f1607a584dc626b26ec66a08b9c8561610bfc428',
  'derm-sebk': '3c0a0a96e9ef137974f6ee7a80d89aa5e1d16401e8d605d7fcb8132d93754f6f',
};

describe('built-in Case Package registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the exact legacy inventory, then appends data-driven Content Packs', async () => {
    const packages = await listCasePackages();
    const packedEntries = await listBuiltinContentPackEntries();

    expect(packages.map((casePackage) => casePackage.id)).toEqual([
      ...EXPECTED_IDS,
      ...packedEntries.map((entry) => entry.casePackage.id),
    ]);
    expect(packages.reduce((total, casePackage) => total + countCaseFrames(casePackage), 0)).toBe(
      128 + packedEntries.length,
    );
    expect(new Set(packages.map((casePackage) => casePackage.id)).size).toBe(packages.length);
    for (const casePackage of packages.slice(0, EXPECTED_IDS.length)) {
      expect(casePackage.manifest.sha256).toBe(
        EXPECTED_LEGACY_MANIFESTS[casePackage.id as (typeof EXPECTED_IDS)[number]],
      );
    }
  });

  it('fails closed for unknown case IDs instead of returning another case', async () => {
    await expect(getCasePackage('ct-epidura')).resolves.toBeUndefined();
    await expect(requireCasePackage('derm-unknown')).rejects.toBeInstanceOf(UnknownCasePackageError);
    await expect(fetchDicomWebSeries({ url: 'local', name: 'test' }, 'unknown')).rejects.toBeInstanceOf(
      UnknownCasePackageError,
    );
  });

  it('models single images natively and derives namespaced viewer series', async () => {
    const melanoma = await requireCasePackage('derm-melanoma');
    const chest = await requireCasePackage('cxr-pneumothorax');

    expect(melanoma.artifact.kind).toBe('image');
    expect(chest.artifact.kind).toBe('image');
    expect(melanoma.artifactHints.showSeriesSelector).toBe(false);
    expect(casePackageToSeries(melanoma)).toEqual([
      expect.objectContaining({
        id: 'derm-melanoma:ser-derm-melanoma',
        studyId: 'derm-melanoma',
        modality: 'XC',
        instanceCount: 1,
        instances: ['/images/derm-melanoma/1.jpg'],
      }),
    ]);
  });

  it('preserves stack shape, frame order, and corrected CT modalities', async () => {
    const mri = await requireCasePackage('local-study-sub1');
    const pathology = await requireCasePackage('patho-study-breast');
    const epidural = casePackageToSeries(await requireCasePackage('ct-epidural'));
    const subdural = casePackageToSeries(await requireCasePackage('ct-subdural'));

    expect(casePackageToSeries(mri).map((series) => series.instanceCount)).toEqual([28, 26, 26, 26]);
    expect(casePackageToSeries(mri)[0].instances[13]).toBe('/images/sub-1/FLAIR/14.png');
    expect(casePackageToSeries(pathology).map((series) => series.instanceCount)).toEqual([1, 4, 4]);
    expect(epidural[0].modality).toBe('CT');
    expect(subdural[0].modality).toBe('CT');
  });

  it('keeps previews inside each package and records honest review states', async () => {
    const packages = await listCasePackages();

    for (const casePackage of packages) {
      const artifactPaths = casePackage.artifact.kind === 'image'
        ? [casePackage.artifact.src]
        : casePackage.artifact.series.flatMap((series) => series.frames.map((frame) => frame.src));

      expect(artifactPaths).toContain(casePackage.preview.src);
      expect(casePackage.provenance.clinicianReview).toEqual({ reviewed: false });
      expect(casePackage.deidentification.status).toBe('not-reviewed');
      await expect(verifyCasePackageManifestHash(casePackage)).resolves.toBe(true);
    }
  });

  it('contains no legacy patient or accession fields', async () => {
    const packages = await listCasePackages();
    const forbiddenKeys = new Set(['patientName', 'patientId', 'accessionNumber', 'studyDate']);

    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        expect(forbiddenKeys.has(key)).toBe(false);
        visit(child);
      }
    };

    packages.forEach(visit);
  });

  it('keeps built-ins and valid locals visible when one local package is corrupt', async () => {
    const corruptSummary: CasePackageSummary = {
      id: 'corrupt-local-case',
      title: 'Corrupt local case',
      domain: 'dermatology',
      difficulty: 'introductory',
      caseManifestSha256: 'a'.repeat(64),
      lessonPlanId: 'corrupt-local-lesson',
      lessonPlanVersion: '1.0.0',
      assetCount: 1,
      totalAssetBytes: 1,
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    };
    vi.spyOn(casePackageStore, 'list').mockResolvedValue([corruptSummary]);
    vi.spyOn(casePackageStore, 'get').mockRejectedValue(
      new Error('sensitive local persistence detail must not escape'),
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const expectedBuiltIns = await listBuiltinCasePackages();
    const packages = await listCasePackages();

    expect(packages.map((casePackage) => casePackage.id)).toEqual(
      expectedBuiltIns.map((casePackage) => casePackage.id),
    );
    expect(warning).toHaveBeenCalledWith(
      '1 browser-local case could not be verified and was skipped. Export or delete the affected local data from this browser before retrying.',
    );
    expect(warning.mock.calls.flat().join(' ')).not.toContain('sensitive local persistence detail');
  });
});
