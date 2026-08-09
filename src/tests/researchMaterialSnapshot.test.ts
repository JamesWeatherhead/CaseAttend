// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { finalizeCasePackageV1 } from '../core/casePackage';
import { decodePortableAssetBytes } from '../core/portableCasePackage';
import { snapshotResearchMaterial } from '../services/researchMaterialSnapshot';
import { makePortableCasePackage } from './portableCaseTestFixture';

describe('research material snapshot', () => {
  it('reuses only an exact browser-local portable case and lesson', async () => {
    const portable = await makePortableCasePackage();
    const store = { get: vi.fn(async () => portable) };
    const result = await snapshotResearchMaterial(
      portable.casePackage,
      portable.lessonPlan,
      { store },
    );
    expect(result).toEqual(portable);
    expect(store.get).toHaveBeenCalledWith(portable.casePackage.id);
  });

  it('digest-checks and rebinds built-in assets to a newly hashed portable case', async () => {
    const portable = await makePortableCasePackage();
    const asset = portable.assets[0];
    const { manifest: _manifest, ...draft } = portable.casePackage;
    if (draft.artifact.kind !== 'image') throw new Error('Fixture must use one image.');
    const builtInPath = '/images/example/teaching-image.png';
    const builtIn = await finalizeCasePackageV1({
      ...draft,
      artifact: { ...draft.artifact, src: builtInPath },
      preview: { ...draft.preview, src: builtInPath },
    });
    const progress = vi.fn();
    const bytes = decodePortableAssetBytes(asset);

    const result = await snapshotResearchMaterial(builtIn, portable.lessonPlan, {
      loadBytes: vi.fn(async () => bytes),
      prepareAsset: vi.fn(async () => asset),
      onProgress: progress,
    });

    expect(result.casePackage.artifact.kind).toBe('image');
    if (result.casePackage.artifact.kind !== 'image') throw new Error('Expected one image.');
    expect(result.casePackage.artifact.src).toBe(asset.uri);
    expect(result.casePackage.preview.src).toBe(asset.uri);
    expect(result.casePackage.manifest.sha256).not.toBe(builtIn.manifest.sha256);
    expect(result.assets).toEqual([asset]);
    expect(progress).toHaveBeenLastCalledWith(1, 1);
  });

  it('fails before preparation when a registered built-in digest changes', async () => {
    const portable = await makePortableCasePackage();
    const { manifest: _manifest, ...draft } = portable.casePackage;
    if (draft.artifact.kind !== 'image') throw new Error('Fixture must use one image.');
    const builtIn = await finalizeCasePackageV1({
      ...draft,
      artifact: { ...draft.artifact, src: '/images/example/teaching-image.png' },
      preview: { ...draft.preview, src: '/images/example/teaching-image.png' },
    });
    const prepareAsset = vi.fn();

    await expect(snapshotResearchMaterial(builtIn, portable.lessonPlan, {
      loadBytes: async () => Uint8Array.from([1, 2, 3]),
      prepareAsset,
    })).rejects.toThrow(/SHA-256/);
    expect(prepareAsset).not.toHaveBeenCalled();
  });
});
