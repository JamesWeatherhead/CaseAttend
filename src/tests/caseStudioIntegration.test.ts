// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CaseStudioSubmission,
  StudioAsset,
} from '../components/CaseStudio/CaseStudio';
import {
  createCasePackageV1,
  type CasePackageV1,
} from '../core/casePackage';
import { getLessonPlanRef } from '../core/lessonPlan';
import {
  createPortableCaseAssetV1,
  createPortableCasePackageV1,
  type PortableCaseAssetV1,
  type PortableCasePackageV1,
} from '../core/portableCasePackage';
import { createStarterLessonPlanV1 } from '../core/starterLesson';
import {
  casePackageToSeries,
  listBuiltinCasePackages,
  listCasePackages,
} from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import {
  fetchDicomImageBlob,
  fetchDicomWebSeries,
} from '../services/dicomService';
import { CasePackageStore, casePackageStore } from '../services/casePackageStore';
import { createCaseStudioController } from '../services/caseStudioController';
import { exportPortableCaseArchive } from '../services/portableCaseArchive';

const PNG_A = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PNG_B = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlN4p8AAAAASUVORK5CYII=';

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function customPortableCase(options: {
  id: string;
  domain?: 'radiology' | 'pathology' | 'dermatology';
  assets?: readonly PortableCaseAssetV1[];
  frameOrder?: readonly number[];
  studioStarter?: boolean;
}): Promise<PortableCasePackageV1> {
  const domain = options.domain ?? 'dermatology';
  const caseTitle = `Custom ${options.id}`;
  const assets = options.assets ?? [await createPortableCaseAssetV1(bytes(PNG_A))];
  const frameOrder = options.frameOrder ?? assets.map((_, index) => index);
  const ordered = frameOrder.map((index) => assets[index]);
  const teachingNotes = ['Keep the answer in educator-controlled content.'];
  const neutralDescription = 'A browser-local teaching image with no answer in its description.';
  const lessonPlan = await createStarterLessonPlanV1({
    caseId: options.id,
    ...(options.studioStarter ? { title: `${caseTitle}: starter lesson` } : {}),
    neutralDescription,
    teachingNotes,
    sourceName: 'Synthetic integration fixture',
    sourceUrl: 'https://example.edu/synthetic-integration-fixture',
  });
  const source = (asset: PortableCaseAssetV1, index: number) => ({
    src: asset.uri,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    alt: `Neutral teaching frame ${index + 1}.`,
    width: asset.width,
    height: asset.height,
  });
  const artifact = ordered.length === 1
    ? {
        kind: 'image' as const,
        modality: domain === 'dermatology' ? 'XC' : 'OT',
        seriesId: 'teaching-image',
        seriesLabel: 'Teaching image',
        ...source(ordered[0], 0),
      }
    : {
        kind: 'image-stack' as const,
        series: [{
          id: 'ordered-stack',
          label: 'Ordered teaching stack',
          modality: 'OT',
          frames: ordered.map((asset, index) => ({
            id: `frame-${index + 1}`,
            ...source(asset, index),
          })),
        }],
      };
  const casePackage = await createCasePackageV1({
    id: options.id,
    title: caseTitle,
    vignette: 'Inspect the browser-local teaching image.',
    domain,
    difficulty: 'introductory',
    artifact,
    preview: source(ordered[0], 0),
    artifactHints: {
      showWindowLevel: false,
      showSeriesSelector: false,
      showSegmentation: domain === 'dermatology',
    },
    provenance: {
      sourceName: 'Synthetic integration fixture',
      sourceUrl: 'https://example.edu/synthetic-integration-fixture',
      license: { name: 'CC0 1.0', spdxId: 'CC0-1.0' },
      attribution: 'Generated for CaseAttend integration testing.',
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'synthetic' },
    contentWarnings: [],
    neutralDescription,
    teachingNotes,
    lessonPlanRef: getLessonPlanRef(lessonPlan),
    presentation: {
      subtitle: domain === 'dermatology' ? 'Clinical photograph' : 'Teaching stack',
      category: domain === 'dermatology' ? 'derm' : 'teaching-image',
      accentColor: 'rgba(217,70,239,1)',
      accentGlow: 'rgba(217,70,239,0.15)',
      accentBorder: 'rgba(217,70,239,0.3)',
      textClass: 'text-fuchsia-400',
    },
  });
  return createPortableCasePackageV1(casePackage, lessonPlan, assets);
}

function editSubmission(
  portable: PortableCasePackageV1,
  assets: readonly StudioAsset[],
  expectedCaseManifestSha256: string,
): CaseStudioSubmission {
  const modality = portable.casePackage.artifact.kind === 'image'
    ? portable.casePackage.artifact.modality
    : portable.casePackage.artifact.series[0].modality;
  const seriesLabel = portable.casePackage.artifact.kind === 'image'
    ? portable.casePackage.artifact.seriesLabel
    : portable.casePackage.artifact.series[0].label;
  return {
    form: {
      id: portable.casePackage.id,
      title: `${portable.casePackage.title} edited`,
      vignette: portable.casePackage.vignette,
      domain: portable.casePackage.domain,
      difficulty: portable.casePackage.difficulty,
      modality,
      seriesLabel,
      neutralDescription: 'An edited, answer-neutral description of the browser-local image.',
      accessibleDescription: 'An accessible description of the edited teaching image.',
      teachingNote: 'Ask the learner to distinguish observations from inferences.',
      contentWarnings: 'Medical image',
      sourceName: portable.casePackage.provenance.sourceName,
      sourceUrl: portable.casePackage.provenance.sourceUrl!,
      licenseName: portable.casePackage.provenance.license.name,
      licenseSpdxId: portable.casePackage.provenance.license.spdxId ?? '',
      licenseUrl: portable.casePackage.provenance.license.url ?? '',
      attribution: portable.casePackage.provenance.attribution,
      deidentificationMode: 'synthetic',
      reviewedBy: '',
    },
    assets: assets.map((asset) => ({ ...asset, alt: 'An answer-neutral teaching image.' })),
    previewAssetId: assets[0].id,
    expectedCaseManifestSha256,
    privacyResults: assets.map((asset) => ({
      assetSha256: asset.sha256,
      textStatus: 'no-warning-detected',
      faceStatus: 'no-warning-detected',
      textLikeRegionCount: 0,
      faceCount: 0,
      warnings: [],
    })),
    rightsUseReview: {
      confirmed: true,
      confirmedAt: '2026-08-09T12:00:00.000Z',
    },
    privacyReview: {
      humanReviewed: true,
      reviewedAt: '2026-08-09T12:00:00.000Z',
      explanationAcknowledged: true,
    },
  };
}

async function archiveFile(portable: PortableCasePackageV1): Promise<File> {
  const archive = await exportPortableCaseArchive(portable);
  return new File([exactBuffer(archive)], `${portable.casePackage.id}.caseattend`, {
    type: 'application/vnd.caseattend.case-package+zip',
  });
}

async function builtInCollisionPackage(): Promise<{
  builtIn: CasePackageV1;
  collision: PortableCasePackageV1;
}> {
  const builtIn = (await listBuiltinCasePackages())[0];
  const asset = await createPortableCaseAssetV1(bytes(PNG_A));
  const teachingNotes = ['This local collision must never shadow the built-in lesson.'];
  const neutralDescription = 'A local record deliberately using a reserved built-in ID.';
  const lessonPlan = await createStarterLessonPlanV1({
    caseId: builtIn.id,
    neutralDescription,
    teachingNotes,
    sourceName: 'Synthetic collision fixture',
    sourceUrl: 'https://example.edu/collision-fixture',
  });
  const imageSource = {
    src: asset.uri,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    alt: 'Synthetic collision test image.',
    width: asset.width,
    height: asset.height,
  };
  const casePackage = await createCasePackageV1({
    id: builtIn.id,
    title: 'Local collision record',
    vignette: 'This record must remain hidden behind the built-in case.',
    domain: 'dermatology',
    difficulty: 'introductory',
    artifact: {
      kind: 'image',
      modality: 'XC',
      seriesId: 'collision-image',
      seriesLabel: 'Collision image',
      ...imageSource,
    },
    preview: imageSource,
    artifactHints: {
      showWindowLevel: false,
      showSeriesSelector: false,
      showSegmentation: false,
    },
    provenance: {
      sourceName: 'Synthetic collision fixture',
      sourceUrl: 'https://example.edu/collision-fixture',
      license: { name: 'CC0 1.0', spdxId: 'CC0-1.0' },
      attribution: 'Generated for collision testing.',
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'synthetic' },
    contentWarnings: [],
    neutralDescription,
    teachingNotes,
    lessonPlanRef: getLessonPlanRef(lessonPlan),
    presentation: {
      subtitle: 'Collision fixture',
      category: 'derm',
      accentColor: 'rgba(217,70,239,1)',
      accentGlow: 'rgba(217,70,239,0.15)',
      accentBorder: 'rgba(217,70,239,0.3)',
      textClass: 'text-fuchsia-400',
    },
  });
  return {
    builtIn,
    collision: await createPortableCasePackageV1(casePackage, lessonPlan, [asset]),
  };
}

afterEach(async () => {
  for (const id of ['integration-stack-order']) {
    if (await casePackageStore.get(id)) await casePackageStore.delete(id);
  }
  vi.unstubAllGlobals();
});

describe('Case Studio catalog and viewer integration', () => {
  it('imports a single-frame dermatology case as one authoring frame, not frame plus preview', async () => {
    const portable = await customPortableCase({
      id: 'integration-single-derm',
      domain: 'dermatology',
    });
    const store = new CasePackageStore({ indexedDB: null });
    const controller = createCaseStudioController({
      store,
      createObjectUrl: (_blob) => 'blob:integration-single',
      revokeObjectUrl: () => undefined,
      validateImportedAsset: async () => undefined,
    });

    const imported = await controller.importCase(await archiveFile(portable));

    expect(imported.casePackage.artifact.kind).toBe('image');
    expect(imported.assets).toHaveLength(1);
    expect(imported.assets[0].sha256).toBe(portable.assets[0].sha256);
    expect(casePackageToSeries(imported.casePackage)).toEqual([
      expect.objectContaining({ instanceCount: 1, instances: [portable.assets[0].uri] }),
    ]);
  });

  it('restores stack frame order from artifact references even when portable assets are sorted', async () => {
    const first = await createPortableCaseAssetV1(bytes(PNG_A));
    const second = await createPortableCaseAssetV1(bytes(PNG_B));
    const portable = await customPortableCase({
      id: 'integration-import-order',
      domain: 'radiology',
      assets: [first, second],
      frameOrder: [1, 0],
    });
    const store = new CasePackageStore({ indexedDB: null });
    let url = 0;
    const controller = createCaseStudioController({
      store,
      createObjectUrl: () => `blob:integration-${++url}`,
      revokeObjectUrl: () => undefined,
      validateImportedAsset: async () => undefined,
    });

    const imported = await controller.importCase(await archiveFile(portable));

    expect(imported.assets.map((asset) => asset.sha256)).toEqual([second.sha256, first.sha256]);
    expect(casePackageToSeries(imported.casePackage)[0].instances).toEqual([
      second.uri,
      first.uri,
    ]);
  });

  it('decodes one shared Blob when a stack intentionally repeats the same digest', async () => {
    const shared = await createPortableCaseAssetV1(bytes(PNG_A));
    const portable = await customPortableCase({
      id: 'integration-repeated-frame',
      domain: 'radiology',
      assets: [shared],
      frameOrder: [0, 0],
    });
    const store = new CasePackageStore({ indexedDB: null });
    const validateImportedAsset = vi.fn(async () => undefined);
    let url = 0;
    const controller = createCaseStudioController({
      store,
      validateImportedAsset,
      createObjectUrl: () => `blob:repeated-${++url}`,
      revokeObjectUrl: () => undefined,
    });

    const imported = await controller.importCase(await archiveFile(portable));

    expect(imported.assets).toHaveLength(2);
    expect(imported.assets.map((asset) => asset.sha256)).toEqual([shared.sha256, shared.sha256]);
    expect(validateImportedAsset).toHaveBeenCalledOnce();
  });

  it('leaves no saved case when preview URL registration fails during import', async () => {
    const portable = await customPortableCase({
      id: 'integration-registration-failure',
      domain: 'dermatology',
    });
    const store = new CasePackageStore({ indexedDB: null });
    const validateImportedAsset = vi.fn(async () => undefined);
    const controller = createCaseStudioController({
      store,
      validateImportedAsset,
      createObjectUrl: () => { throw new Error('Object URLs are blocked.'); },
    });

    await expect(controller.importCase(await archiveFile(portable)))
      .rejects.toThrow('Object URLs are blocked.');
    expect(validateImportedAsset).toHaveBeenCalledOnce();
    expect(await store.get(portable.casePackage.id)).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('validates every imported raster before registering or saving it', async () => {
    const portable = await customPortableCase({
      id: 'integration-decode-failure',
      domain: 'dermatology',
    });
    const store = new CasePackageStore({ indexedDB: null });
    const createObjectUrl = vi.fn(() => 'blob:must-not-exist');
    const controller = createCaseStudioController({
      store,
      createObjectUrl,
      validateImportedAsset: async () => { throw new Error('Raster decode failed.'); },
    });

    await expect(controller.importCase(await archiveFile(portable)))
      .rejects.toThrow('Raster decode failed.');
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(await store.get(portable.casePackage.id)).toBeNull();
  });

  it('revokes all registered previews if persistence fails', async () => {
    const portable = await customPortableCase({
      id: 'integration-persistence-failure',
      domain: 'dermatology',
    });
    const store = new CasePackageStore({ indexedDB: null });
    vi.spyOn(store, 'save').mockRejectedValue(new Error('Storage failed.'));
    const revokeObjectUrl = vi.fn();
    const controller = createCaseStudioController({
      store,
      validateImportedAsset: async () => undefined,
      createObjectUrl: () => 'blob:registered-before-save',
      revokeObjectUrl,
    });

    await expect(controller.importCase(await archiveFile(portable)))
      .rejects.toThrow('Storage failed.');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:registered-before-save');
    expect(await store.get(portable.casePackage.id)).toBeNull();
  });

  it('surfaces a concurrent deletion instead of silently treating a stale lesson edit as unsaved', async () => {
    const portable = await customPortableCase({
      id: 'integration-deleted-lesson-edit',
      domain: 'dermatology',
    });
    const store = new CasePackageStore({ indexedDB: null });
    const controller = createCaseStudioController({ store });

    await expect(controller.saveUpdatedBundle(
      portable.casePackage,
      portable.lessonPlan,
      portable.casePackage.manifest.sha256,
    )).rejects.toThrow(/deleted in another view.*Reload/i);
    expect(await store.get(portable.casePackage.id)).toBeNull();
  });

  it('rejects built-in ID imports and keeps built-ins authoritative over stale local collisions', async () => {
    const { builtIn, collision } = await builtInCollisionPackage();
    const isolatedStore = new CasePackageStore({ indexedDB: null });
    const controller = createCaseStudioController({ store: isolatedStore });

    await expect(controller.saveCase({
      form: { id: `  ${builtIn.id}  ` },
    } as Parameters<typeof controller.saveCase>[0]))
      .rejects.toThrow(`A built-in case already uses ID '${builtIn.id}'. Choose a different ID.`);
    await expect(controller.importCase(await archiveFile(collision)))
      .rejects.toThrow(`A built-in case already uses ID '${builtIn.id}'.`);
    expect(await isolatedStore.get(builtIn.id)).toBeNull();

    await casePackageStore.save(collision);
    try {
      const catalogMatches = (await listCasePackages()).filter((entry) => entry.id === builtIn.id);
      expect(catalogMatches).toEqual([builtIn]);
      const resolvedLesson = await requireLessonPlanForCase(builtIn);
      expect(getLessonPlanRef(resolvedLesson)).toEqual(builtIn.lessonPlanRef);
      expect(resolvedLesson.id).not.toBe(collision.lessonPlan.id);
    } finally {
      await casePackageStore.delete(builtIn.id);
    }
  });

  it('replaces only the exact prior Studio revision and rejects a stale edit', async () => {
    const first = await createPortableCaseAssetV1(bytes(PNG_A));
    const second = await createPortableCaseAssetV1(bytes(PNG_B));
    const portable = await customPortableCase({
      id: 'integration-exact-edit',
      domain: 'radiology',
      assets: [first, second],
      studioStarter: true,
    });
    const store = new CasePackageStore({ indexedDB: null });
    const controller = createCaseStudioController({
      store,
      createObjectUrl: (_blob) => 'blob:integration-edit',
      revokeObjectUrl: () => undefined,
      validateImportedAsset: async () => undefined,
    });
    const imported = await controller.importCase(await archiveFile(portable));
    const submission = editSubmission(
      portable,
      imported.assets,
      portable.casePackage.manifest.sha256,
    );

    const edited = await controller.saveCase(submission);
    const stored = await store.get(edited.id);

    expect(edited.manifest.sha256).not.toBe(portable.casePackage.manifest.sha256);
    expect(edited.artifactHints.showSeriesSelector).toBe(true);
    expect(stored?.lessonPlan.title).toBe(`${submission.form.title}: starter lesson`);
    expect(stored?.lessonPlan.clinicalReview).toEqual({ reviewed: false });
    await expect(controller.saveCase(submission)).rejects.toThrow(
      `Browser-local case '${portable.casePackage.id}' changed in another view. Reload before saving this edit.`,
    );
    expect((await store.get(edited.id))?.casePackage.manifest.sha256).toBe(edited.manifest.sha256);
  });

  it('does not flatten a custom or reviewed imported lesson during Case Studio edits', async () => {
    const portable = await customPortableCase({
      id: 'integration-rich-lesson-edit',
      domain: 'dermatology',
    });
    const store = new CasePackageStore({ indexedDB: null });
    const controller = createCaseStudioController({
      store,
      createObjectUrl: (_blob) => 'blob:integration-rich',
      revokeObjectUrl: () => undefined,
      validateImportedAsset: async () => undefined,
    });
    const imported = await controller.importCase(await archiveFile(portable));

    await expect(controller.saveCase(editSubmission(
      portable,
      imported.assets,
      portable.casePackage.manifest.sha256,
    ))).rejects.toThrow('Case Studio will not replace it with a generic starter');
    expect((await store.get(portable.casePackage.id))?.lessonPlan).toEqual(portable.lessonPlan);
  });

  it('merges a custom stack into the catalog, resolves its exact lesson, and reads case assets without fetch', async () => {
    const first = await createPortableCaseAssetV1(bytes(PNG_A));
    const second = await createPortableCaseAssetV1(bytes(PNG_B));
    const portable = await customPortableCase({
      id: 'integration-stack-order',
      domain: 'radiology',
      assets: [first, second],
      frameOrder: [1, 0],
    });
    await casePackageStore.save(portable);
    const fetchSpy = vi.fn(() => {
      throw new Error('case:// assets must never enter fetch.');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const catalog = await listCasePackages();
    const catalogCase = catalog.find((entry) => entry.id === portable.casePackage.id);
    expect(catalogCase).toEqual(portable.casePackage);

    const lesson = await requireLessonPlanForCase(catalogCase!);
    expect(lesson).toEqual(portable.lessonPlan);
    expect(getLessonPlanRef(lesson)).toEqual(catalogCase!.lessonPlanRef);

    const series = await fetchDicomWebSeries({ url: '', name: '' }, catalogCase!.id);
    expect(series).toHaveLength(1);
    expect(series[0].instances).toEqual([second.uri, first.uri]);
    const image = await fetchDicomImageBlob({ url: '', name: '' }, second.uri);
    expect(image.type).toBe(second.mimeType);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes(PNG_B));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
