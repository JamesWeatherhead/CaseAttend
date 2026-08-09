import {
  canonicalizeJson,
  finalizeCasePackageV1,
  verifyCasePackageManifestHash,
  type CaseImageArtifact,
  type CaseImageFrame,
  type CasePackageV1,
  type CasePreview,
} from '../core/casePackage';
import {
  collectCaseAssetReferences,
  createPortableCasePackageV1,
  sha256Hex,
  type CaseAssetReference,
  type PortableCaseAssetV1,
  type PortableCasePackageV1,
  type PortableImageMimeType,
} from '../core/portableCasePackage';
import {
  getLessonPlanRef,
  verifyLessonPlanManifestHash,
  type LessonPlanV1,
} from '../core/lessonPlan';
import { prepareCaseImageAsset } from './caseAssetPipeline';
import { casePackageStore, type CasePackageStore } from './casePackageStore';

export interface ResearchMaterialSnapshotOptions {
  store?: Pick<CasePackageStore, 'get'>;
  loadBytes?: (src: string, signal?: AbortSignal) => Promise<Uint8Array>;
  prepareAsset?: (
    bytes: Uint8Array,
    reference: CaseAssetReference,
  ) => Promise<PortableCaseAssetV1>;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

function referenceKey(reference: Pick<CaseAssetReference, 'uri' | 'sha256' | 'mimeType'>): string {
  return `${reference.uri}\0${reference.sha256}\0${reference.mimeType}`;
}

function assertExactLesson(casePackage: CasePackageV1, lessonPlan: LessonPlanV1): void {
  const actual = getLessonPlanRef(lessonPlan);
  const expected = casePackage.lessonPlanRef;
  if (
    actual.id !== expected.id
    || actual.version !== expected.version
    || actual.sha256 !== expected.sha256
  ) {
    throw new Error(`Case Package '${casePackage.id}' is not bound to the supplied Lesson Plan.`);
  }
}

async function defaultLoadBytes(src: string, signal?: AbortSignal): Promise<Uint8Array> {
  if (!src.startsWith('/images/') || src.includes('..') || src.includes('\\')) {
    throw new Error('Built-in research snapshots may load only allowlisted /images/ assets.');
  }
  const response = await fetch(src, { signal, credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Could not load built-in teaching asset '${src}' (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function defaultPrepareAsset(
  bytes: Uint8Array,
  reference: CaseAssetReference,
): Promise<PortableCaseAssetV1> {
  const digest = await sha256Hex(bytes);
  if (digest !== reference.sha256) {
    throw new Error(`Built-in teaching asset '${reference.uri}' failed its recorded SHA-256 check.`);
  }
  const source = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(source).set(bytes);
  const mimeType = reference.mimeType as PortableImageMimeType;
  const fileName = reference.uri.split('/').at(-1) ?? 'teaching-image';
  const prepared = await prepareCaseImageAsset(
    new File([source], fileName, { type: mimeType }),
    { outputMimeType: mimeType },
  );
  const { blob: _blob, originalName: _originalName, ...portable } = prepared;
  return portable;
}

function rewrittenImage(
  value: CaseImageArtifact,
  replacements: ReadonlyMap<string, PortableCaseAssetV1>,
): CaseImageArtifact {
  const replacement = replacements.get(referenceKey({
    uri: value.src,
    sha256: value.sha256,
    mimeType: value.mimeType,
  }));
  if (!replacement) throw new Error(`No portable asset was prepared for '${value.src}'.`);
  return {
    ...value,
    src: replacement.uri,
    sha256: replacement.sha256,
    mimeType: replacement.mimeType,
    width: replacement.width,
    height: replacement.height,
  };
}

function rewrittenFrame(
  value: CaseImageFrame,
  replacements: ReadonlyMap<string, PortableCaseAssetV1>,
): CaseImageFrame {
  const replacement = replacements.get(referenceKey({
    uri: value.src,
    sha256: value.sha256,
    mimeType: value.mimeType,
  }));
  if (!replacement) throw new Error(`No portable asset was prepared for '${value.src}'.`);
  return {
    ...value,
    src: replacement.uri,
    sha256: replacement.sha256,
    mimeType: replacement.mimeType,
    width: replacement.width,
    height: replacement.height,
  };
}

function rewrittenPreview(
  value: CasePreview,
  replacements: ReadonlyMap<string, PortableCaseAssetV1>,
): CasePreview {
  const replacement = replacements.get(referenceKey({
    uri: value.src,
    sha256: value.sha256,
    mimeType: value.mimeType,
  }));
  if (!replacement) throw new Error(`No portable asset was prepared for preview '${value.src}'.`);
  return {
    ...value,
    src: replacement.uri,
    sha256: replacement.sha256,
    mimeType: replacement.mimeType,
    width: replacement.width,
    height: replacement.height,
  };
}

/**
 * Freeze an exact Case Package and Lesson Plan into a self-contained portable
 * snapshot. Browser-local cases are reused byte-for-byte. Built-in public
 * images are digest-checked, canvas re-encoded to remove metadata, and rebound
 * to content-addressed case:// URIs before a new Case Package hash is issued.
 */
export async function snapshotResearchMaterial(
  casePackage: CasePackageV1,
  lessonPlan: LessonPlanV1,
  options: ResearchMaterialSnapshotOptions = {},
): Promise<PortableCasePackageV1> {
  if (!await verifyCasePackageManifestHash(casePackage)) {
    throw new Error(`Case Package '${casePackage.id}' failed manifest verification.`);
  }
  if (!await verifyLessonPlanManifestHash(lessonPlan)) {
    throw new Error(`Lesson Plan '${lessonPlan.id}' failed manifest verification.`);
  }
  assertExactLesson(casePackage, lessonPlan);

  if (casePackage.preview.src.startsWith('case://assets/')) {
    const stored = await (options.store ?? casePackageStore).get(casePackage.id);
    if (!stored
      || canonicalizeJson(stored.casePackage) !== canonicalizeJson(casePackage)
      || canonicalizeJson(stored.lessonPlan) !== canonicalizeJson(lessonPlan)) {
      throw new Error(`The exact browser-local material '${casePackage.id}' is unavailable. Reopen it from Case Studio before freezing the study.`);
    }
    return stored;
  }

  const allReferences = collectCaseAssetReferences(casePackage);
  if (allReferences.some((reference) => !reference.uri.startsWith('/images/'))) {
    throw new Error('Research snapshots require a stored portable case or registered built-in /images/ assets.');
  }
  const uniqueReferences = [...new Map(
    allReferences.map((reference) => [referenceKey(reference), reference]),
  ).values()];
  const replacements = new Map<string, PortableCaseAssetV1>();
  const portableAssets = new Map<string, PortableCaseAssetV1>();
  const loadBytes = options.loadBytes ?? defaultLoadBytes;
  const prepareAsset = options.prepareAsset ?? defaultPrepareAsset;
  options.onProgress?.(0, uniqueReferences.length);

  for (let index = 0; index < uniqueReferences.length; index += 1) {
    if (options.signal?.aborted) throw new DOMException('Research material snapshot cancelled.', 'AbortError');
    const reference = uniqueReferences[index];
    const bytes = await loadBytes(reference.uri, options.signal);
    if (await sha256Hex(bytes) !== reference.sha256) {
      throw new Error(`Built-in teaching asset '${reference.uri}' failed its recorded SHA-256 check.`);
    }
    const prepared = await prepareAsset(bytes, reference);
    replacements.set(referenceKey(reference), prepared);
    const existing = portableAssets.get(prepared.uri);
    if (existing && canonicalizeJson(existing) !== canonicalizeJson(prepared)) {
      throw new Error(`Prepared research asset '${prepared.uri}' has conflicting content.`);
    }
    portableAssets.set(prepared.uri, prepared);
    options.onProgress?.(index + 1, uniqueReferences.length);
  }

  const { manifest: _manifest, ...draft } = casePackage;
  const artifact = casePackage.artifact.kind === 'image'
    ? rewrittenImage(casePackage.artifact, replacements)
    : {
        ...casePackage.artifact,
        series: casePackage.artifact.series.map((series) => ({
          ...series,
          frames: series.frames.map((frame) => rewrittenFrame(frame, replacements)),
        })),
      };
  const portableCasePackage = await finalizeCasePackageV1({
    ...draft,
    artifact,
    preview: rewrittenPreview(casePackage.preview, replacements),
  });
  return createPortableCasePackageV1(
    portableCasePackage,
    lessonPlan,
    [...portableAssets.values()],
  );
}
