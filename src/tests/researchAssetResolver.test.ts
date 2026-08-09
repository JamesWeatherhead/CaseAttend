// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDicomImageBlob } from '../services/dicomService';
import {
  activateResearchStudyAssets,
  clearResearchStudyAssets,
  getActiveResearchAssetBlob,
} from '../services/researchAssetResolver';
import { makeLaunchReadyResearchStudyBundle } from './researchServiceTestFixture';

describe('frozen research asset resolver', () => {
  afterEach(() => {
    clearResearchStudyAssets();
    vi.restoreAllMocks();
  });

  it('serves case:// bytes from the exact bundle without fetch or authoring storage', async () => {
    const bundle = await makeLaunchReadyResearchStudyBundle();
    const portable = bundle.portableCases[0];
    const release = await activateResearchStudyAssets(bundle);
    const uri = portable.assets[0].uri;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const direct = getActiveResearchAssetBlob(uri);
    const viewer = await fetchDicomImageBlob({ url: 'local', name: 'Research' }, uri);

    expect(direct).toBeInstanceOf(Blob);
    expect(await viewer.arrayBuffer()).toEqual(await direct!.arrayBuffer());
    expect(fetchSpy).not.toHaveBeenCalled();
    release();
    expect(getActiveResearchAssetBlob(uri)).toBeNull();
  });
});
