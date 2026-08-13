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
  'local-study-sub1': 'd23460bfc31dcd712cfa82e9e0cf705dfce5f0018c0171b1c973646c16f5827e',
  'patho-study-breast': '7f22892be3200445666683bbabbbf67629de8e8093d34633175eb2b80f1642ca',
  'cxr-pneumothorax': 'a0a9551f56cac23b536c6ca90eb1d5c0c6d38942a50520ba58bd9a5fd2986906',
  'cxr-pneumonia': 'abba3e4815e9d0ac3e40f75c4968cfd24567b358a84db9628803225d37417df4',
  'cxr-chf': 'e01eb18b8d3a99f43c4ea265244773a40f143d9cb04ee8965a57bf1c1396a5f4',
  'cxr-effusion': '1fc3c6c31fffaef65d9251f44f5b88d6638b77b7ad6bd8cc4e1e5c2b3f0fbe4d',
  'axr-sbo': 'cea24120bda6fac59ab6f5624fde4da55dc4fca9e161fd2771382e7a926fd000',
  'ct-epidural': '3a1fb7bcd660b380f2185901b1231e38c98e93db7ea54859ea6c4ab496693ac7',
  'ct-subdural': '8b28f106c1d569ecadc022bd3871b29db96d11a45a3d280061be53e18e63dc9e',
  'cxr-pneumoperitoneum': '585d1c70064f07b016b3a851d3c46830d26f0b10ab2661a5c6a319bd0038be73',
  'axr-nec': '1c40230e691cefc49dd593cfd450eef87b087b0931e75be948a5073a650af0e3',
  'xr-colles': '509d13ad30b27f58cc9b5d8a755af26eb17dfab976fdaea0a06139ed35a02cb4',
  'derm-melanoma': 'a8f44b2719818477bd1afdab6f785bc7d09597ca1f272c472c7bde774135b243',
  'derm-bcc': '0a9a65d3433c40da07e5da8d9e5067141ec5c7e529482dc099f6a96142b2cee9',
  'derm-sebk': 'ec8267ffabcef3afe3cac01e2cea715b4596b483c356039b2be7ca003dccbbdf',
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
