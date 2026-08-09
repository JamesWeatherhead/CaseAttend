import { decodePortableAssetBytes } from '../core/portableCasePackage';
import {
  validateResearchStudyBundleV1,
  type ResearchStudyBundleV1,
} from '../core/researchStudyBundle';

interface ActiveResearchAssets {
  manifestSha256: string;
  blobs: ReadonlyMap<string, Blob>;
}

let active: ActiveResearchAssets | null = null;

/**
 * Make one hash-verified frozen study's content-addressed assets available to
 * the viewer. This is transient tab memory, never authoring storage or network.
 */
export async function activateResearchStudyAssets(
  bundle: ResearchStudyBundleV1,
): Promise<() => void> {
  const validation = await validateResearchStudyBundleV1(bundle);
  if (!validation.valid) {
    throw new Error(`Cannot activate invalid research assets:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  }
  const blobs = new Map<string, Blob>();
  bundle.portableCases.forEach((portable) => {
    portable.assets.forEach((asset) => {
      const existing = blobs.get(asset.uri);
      if (!existing) {
        const decoded = decodePortableAssetBytes(asset);
        const bytes = new ArrayBuffer(decoded.byteLength);
        new Uint8Array(bytes).set(decoded);
        blobs.set(asset.uri, new Blob([bytes], { type: asset.mimeType }));
      }
    });
  });
  const activation: ActiveResearchAssets = {
    manifestSha256: bundle.researchManifest.manifest.sha256,
    blobs,
  };
  active = activation;
  return () => {
    if (active === activation) active = null;
  };
}

export function getActiveResearchAssetBlob(uri: string): Blob | null {
  return active?.blobs.get(uri) ?? null;
}

export function getActiveResearchManifestSha256(): string | null {
  return active?.manifestSha256 ?? null;
}

export function clearResearchStudyAssets(): void {
  active = null;
}
