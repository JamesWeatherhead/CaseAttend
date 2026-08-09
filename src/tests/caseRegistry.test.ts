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

const EXPECTED_LEGACY_MANIFESTS: Readonly<Record<(typeof EXPECTED_IDS)[number], string>> = {
  'local-study-sub1': '50ee34ec4138d03ba5f08cc5030e1ba6f589b75a289708dcd27df2e3c1e2fd95',
  'patho-study-breast': 'a8a930f5e3c67dfac880cd6a7ed2650549430043062fefd96729e32feb8a07c8',
  'cxr-pneumothorax': 'eb2b2a60b8fa5dd9a7ce587f3880d2cd4abbeb82ed58f4e8604714c996051883',
  'cxr-pneumonia': '61902e876ae0d3cacb30b7f0ddd40888ce72dc1f4b678a45831e401f0e8a2479',
  'cxr-chf': '9f4cd86a125d8b7e2d18d2005b2c038654cf1e0e99f23729073fad4c97cf310a',
  'cxr-effusion': 'ef9ba141b74c9ee4bd926e130e6e3ef486be9d663bd0f69fcdcad472e4b74a14',
  'axr-sbo': '0717ca47c444f8be5a02cedbe7073cf107debcd935ba691936c884fd5c6ce175',
  'ct-epidural': 'fc75f3a48152dca9b9dd707c4f53a138fb5868884af00c67f2fb024d62aa7ec4',
  'ct-subdural': 'a865adfc0729d7a8b7974ca1e01d315896d9fce113b65d8c66d177f10f478e7b',
  'cxr-pneumoperitoneum': 'ba812c7a5fdb56bf8c4d7db97438986a189ab37bbbdece6ef8acacd190afeb46',
  'axr-nec': 'e7486fc13a4f2b18de92eec5f1892a9e27411ce6107b2f7932119ab4ee9adc62',
  'xr-colles': '0a34fc84e5d0632e29143908fe31fd0265b700cf7afbd283b55cbc07845ad7c1',
  'derm-melanoma': '41ee2f434470b13f8dc0ac82f2d0f6c831ebddf836d88549135112209cd1fc39',
  'derm-bcc': 'e6e925618bfee3ed82a75725d61d5e640177563b79b33ad51326c46d50b7d630',
  'derm-sebk': 'da77c4e173718c7f8adc755cd840f9cbcfcfa641fb40bd58ba90aa8d1c6ce7e9',
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
