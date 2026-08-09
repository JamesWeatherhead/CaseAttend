import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  casePackageToSeries,
  countCaseFrames,
  getCasePackage,
  listCasePackages,
  requireCasePackage,
  UnknownCasePackageError,
} from '../data/caseRegistry';
import { fetchDicomWebSeries } from '../services/dicomService';
import { verifyCasePackageManifestHash } from '../core/casePackage';
import { casePackageStore, type CasePackageSummary } from '../services/casePackageStore';

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

describe('built-in Case Package registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contains the exact 15-case inventory and 128 frames in deliberate order', async () => {
    const packages = await listCasePackages();

    expect(packages.map((casePackage) => casePackage.id)).toEqual(EXPECTED_IDS);
    expect(packages.reduce((total, casePackage) => total + countCaseFrames(casePackage), 0)).toBe(128);
    expect(new Set(packages.map((casePackage) => casePackage.id)).size).toBe(packages.length);
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

    const packages = await listCasePackages();

    expect(packages.map((casePackage) => casePackage.id)).toEqual(EXPECTED_IDS);
    expect(warning).toHaveBeenCalledWith(
      '1 browser-local case could not be verified and was skipped. Export or delete the affected local data from this browser before retrying.',
    );
    expect(warning.mock.calls.flat().join(' ')).not.toContain('sensitive local persistence detail');
  });
});
