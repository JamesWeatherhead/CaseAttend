import type {
  CaseStudioSubmission,
  StudioAsset,
  StudioImportResult,
  StudioPrivacyResult,
} from '../components/CaseStudio/CaseStudio';
import { createCasePackageV1, type CaseArtifactHints, type CasePackageV1 } from '../core/casePackage';
import type { IntroCacheV1 } from '../core/introCache';
import {
  collectCaseAssetReferences,
  createPortableCasePackageV1,
  decodePortableAssetBytes,
  type PortableCaseAssetV1,
  type PortableCasePackageV1,
} from '../core/portableCasePackage';
import { createStarterLessonPlanV1 } from '../core/starterLesson';
import { getLessonPlanRef, type LessonPlanV1 } from '../core/lessonPlan';
import { listBuiltinCasePackages } from '../data/caseRegistry';
import { getDomain } from '../lib/domains';
import type { DomainKey } from '../lib/domains/types';
import {
  authoredIntroCacheStore,
  type AuthoredIntroCacheStore,
} from './authoredIntroCacheStore';
import { getKey, getModel } from './byokStore';
import {
  prepareCaseImageAssets,
  validateCaseImageDecode,
  type PreparedCaseImageAsset,
} from './caseAssetPipeline';
import { casePackageStore, type CasePackageStore } from './casePackageStore';
import { scanCaseAssetsPrivacy, type CasePrivacyScanResult } from './casePrivacyScanner';
import {
  approveIntroCache,
  generateAuthoredIntroCache,
  isIntroCacheCurrent,
  IntroCacheAuthoringError,
  type IntroCacheGenerationInput,
} from './introCacheAuthoring';
import {
  exportPortableCaseArchive,
  importPortableCaseArchive,
  portableCaseArchiveBlob,
} from './portableCaseArchive';

interface SessionAsset {
  portable: PortableCaseAssetV1;
  blob: Blob;
  originalName?: string;
  previewUrl?: string;
}

export interface CaseStudioControllerOptions {
  store?: CasePackageStore;
  authoredIntroCacheStore?: AuthoredIntroCacheStore;
  now?: () => Date;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  download?: (blob: Blob, filename: string) => void;
  validateImportedAsset?: (blob: Blob, asset: PortableCaseAssetV1) => Promise<void>;
  /** Test seam: override the BYOK key resolver. Production uses `getKey()`. */
  resolveApiKey?: () => string | null;
  /** Test seam: override the BYOK model resolver. Production uses `getModel()`. */
  resolveModelId?: () => string;
  /** Test seam: override the generation pipeline entrypoint. */
  runIntroCacheGeneration?: (input: IntroCacheGenerationInput) => Promise<IntroCacheV1>;
}

export type IntroCacheStatus =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'ready-for-review'; draft: IntroCacheV1 }
  | { kind: 'approved'; cache: IntroCacheV1 }
  | { kind: 'stale'; cache: IntroCacheV1 }
  | { kind: 'error'; code: string; message: string; retryable: boolean };

const PRESENTATION = {
  radiology: {
    accentColor: 'rgba(59,130,246,1)',
    accentGlow: 'rgba(59,130,246,0.15)',
    accentBorder: 'rgba(59,130,246,0.3)',
    textClass: 'text-blue-400',
  },
  pathology: {
    accentColor: 'rgba(244,63,94,1)',
    accentGlow: 'rgba(244,63,94,0.15)',
    accentBorder: 'rgba(244,63,94,0.3)',
    textClass: 'text-rose-400',
  },
  dermatology: {
    accentColor: 'rgba(217,70,239,1)',
    accentGlow: 'rgba(217,70,239,0.15)',
    accentBorder: 'rgba(217,70,239,0.3)',
    textClass: 'text-fuchsia-400',
  },
  ecg: {
    accentColor: 'rgba(16,185,129,1)',
    accentGlow: 'rgba(16,185,129,0.15)',
    accentBorder: 'rgba(16,185,129,0.3)',
    textClass: 'text-emerald-400',
  },
  ultrasound: {
    accentColor: 'rgba(6,182,212,1)',
    accentGlow: 'rgba(6,182,212,0.15)',
    accentBorder: 'rgba(6,182,212,0.3)',
    textClass: 'text-cyan-400',
  },
  ophthalmology: {
    accentColor: 'rgba(245,158,11,1)',
    accentGlow: 'rgba(245,158,11,0.15)',
    accentBorder: 'rgba(245,158,11,0.3)',
    textClass: 'text-amber-400',
  },
} as const;

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function categoryFor(domain: CaseStudioSubmission['form']['domain'], modality: string): string {
  if (domain === 'pathology') return 'path';
  if (domain === 'dermatology') return 'derm';
  if (domain === 'ecg') return 'ecg';
  if (domain === 'ultrasound') return 'ultrasound';
  if (domain === 'ophthalmology') return 'ophthalmology';
  const normalized = modality.trim().toUpperCase();
  if (normalized === 'CT') return 'ct';
  if (normalized === 'MR' || normalized === 'MRI') return 'mri';
  return 'xray';
}

function artifactHintsFor(
  domain: CaseStudioSubmission['form']['domain'],
  singleImage: boolean,
): CaseArtifactHints {
  const defaults = getDomain(domain).artifactHints;
  return {
    ...defaults,
    showSeriesSelector: singleImage ? false : defaults.showSeriesSelector,
  };
}

function defaultDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeDownloadName(caseId: string): string {
  return `${caseId.replace(/[^a-z0-9-]/g, '-')}.caseattend`;
}

function flagsTotal(result: CasePrivacyScanResult): number {
  return Object.values(result.ocr.identifierFlags).reduce((total, count) => total + count, 0);
}

export class CaseStudioController {
  private readonly store: CasePackageStore;
  private readonly introCacheStore: AuthoredIntroCacheStore;
  private readonly now: () => Date;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly download: (blob: Blob, filename: string) => void;
  private readonly validateImportedAsset: (blob: Blob, asset: PortableCaseAssetV1) => Promise<void>;
  private readonly resolveApiKey: () => string | null;
  private readonly resolveModelId: () => string;
  private readonly runIntroCacheGeneration: (input: IntroCacheGenerationInput) => Promise<IntroCacheV1>;
  private readonly sessionAssets = new Map<string, SessionAsset>();
  private nextAssetId = 1;

  constructor(options: CaseStudioControllerOptions = {}) {
    this.store = options.store ?? casePackageStore;
    this.introCacheStore = options.authoredIntroCacheStore ?? authoredIntroCacheStore;
    this.now = options.now ?? (() => new Date());
    this.createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
    this.download = options.download ?? defaultDownload;
    this.validateImportedAsset = options.validateImportedAsset ?? (async (blob, asset) => {
      await validateCaseImageDecode(blob, { width: asset.width, height: asset.height });
    });
    this.resolveApiKey = options.resolveApiKey ?? (() => getKey());
    this.resolveModelId = options.resolveModelId ?? (() => getModel());
    this.runIntroCacheGeneration = options.runIntroCacheGeneration ?? generateAuthoredIntroCache;
  }

  processFiles = async (
    files: readonly File[],
    onProgress: (completed: number, total: number) => void,
  ): Promise<readonly StudioAsset[]> => {
    onProgress(0, files.length);
    const prepared = await prepareCaseImageAssets(files);
    const registered: StudioAsset[] = [];
    try {
      prepared.forEach((asset, index) => {
        registered.push(this.registerPreparedAsset(asset));
        onProgress(index + 1, prepared.length);
      });
      return registered;
    } catch (error) {
      registered.forEach(this.releaseAsset);
      throw error;
    }
  };

  scanAssets = async (
    assets: readonly StudioAsset[],
    domain: DomainKey,
    onProgress: (completed: number, total: number) => void,
  ): Promise<readonly StudioPrivacyResult[]> => {
    onProgress(0, assets.length);
    const sessionInputs = assets.map((asset) => {
      const sessionAsset = this.sessionAssets.get(asset.id);
      if (!sessionAsset) throw new Error('An image changed before privacy screening. Add it again.');
      return {
        asset,
        sessionAsset,
        input: { blob: sessionAsset.blob, domain, sourceName: sessionAsset.originalName },
      };
    });
    const scanned = await scanCaseAssetsPrivacy(
      sessionInputs.map((entry) => entry.input),
      { onAssetProgress: onProgress },
    );
    return scanned.map((result, index) => {
      const { asset, sessionAsset } = sessionInputs[index];
      const textWarnings = flagsTotal(result) > 0 || result.ocr.textDetected;
      sessionAsset.originalName = undefined;
      return {
        assetSha256: asset.sha256,
        textStatus: result.ocr.status === 'complete'
          ? (textWarnings ? 'warning' : 'no-warning-detected')
          : 'unavailable',
        faceStatus: result.face.status === 'complete'
          ? (result.face.count > 0 ? 'warning' : 'no-warning-detected')
          : 'unavailable',
        textLikeRegionCount: flagsTotal(result),
        faceCount: result.face.count,
        warnings: result.warnings.filter((warning) => (
          !warning.startsWith('Automated checks do not establish HIPAA')
        )),
      };
    });
  };

  saveCase = async (submission: CaseStudioSubmission): Promise<CasePackageV1> => {
    const caseId = submission.form.id.trim();
    if ((await listBuiltinCasePackages()).some((entry) => entry.id === caseId)) {
      throw new Error(`A built-in case already uses ID '${caseId}'. Choose a different ID.`);
    }
    const existing = await this.store.get(caseId);
    const expectedManifest = submission.expectedCaseManifestSha256;
    if (expectedManifest) {
      if (!/^[a-f0-9]{64}$/.test(expectedManifest)) {
        throw new Error('expectedCaseManifestSha256 must be a lowercase SHA-256 digest.');
      }
      if (!existing) {
        throw new Error(`Browser-local case '${caseId}' no longer exists. Reload before saving this edit.`);
      }
      if (existing.casePackage.manifest.sha256 !== expectedManifest) {
        throw new Error(`Browser-local case '${caseId}' changed in another view. Reload before saving this edit.`);
      }
      const sourceUrl = existing.casePackage.provenance.sourceUrl;
      let expectedStarter: LessonPlanV1 | null = null;
      if (sourceUrl) {
        try {
          expectedStarter = await createStarterLessonPlanV1({
            caseId,
            title: `${existing.casePackage.title}: starter lesson`,
            neutralDescription: existing.casePackage.neutralDescription,
            teachingNotes: existing.casePackage.teachingNotes,
            sourceName: existing.casePackage.provenance.sourceName,
            sourceUrl,
          });
        } catch {
          // A non-Studio lesson is deliberately not coerced into the generic starter shape.
        }
      }
      if (expectedStarter?.manifest.sha256 !== existing.lessonPlan.manifest.sha256) {
        throw new Error(
          'This saved case has a custom or reviewed Lesson Plan. Case Studio will not replace it with a generic starter. Change the case ID to create a copy, or update the lesson explicitly in Lesson Builder.',
        );
      }
    } else if (existing) {
      throw new Error(`A browser-local case already uses ID '${caseId}'. Choose a different ID.`);
    }
    if (!submission.rightsUseReview.confirmed) {
      throw new Error(
        'Confirm that the recorded terms or authorization permit storing, using, and exporting these images.',
      );
    }
    if (submission.assets.length === 0) throw new Error('Add at least one image before saving.');
    if (submission.privacyResults.length !== submission.assets.length) {
      throw new Error('Run privacy screening for every image before saving.');
    }
    const expectedScanCounts = new Map<string, number>();
    const actualScanCounts = new Map<string, number>();
    for (const asset of submission.assets) {
      expectedScanCounts.set(asset.sha256, (expectedScanCounts.get(asset.sha256) ?? 0) + 1);
    }
    for (const result of submission.privacyResults) {
      actualScanCounts.set(result.assetSha256, (actualScanCounts.get(result.assetSha256) ?? 0) + 1);
    }
    if (
      expectedScanCounts.size !== actualScanCounts.size
      || [...expectedScanCounts].some(([digest, count]) => actualScanCounts.get(digest) !== count)
    ) {
      throw new Error('Privacy screening results do not match the current images. Run screening again.');
    }
    if (!submission.privacyReview.humanReviewed || !submission.privacyReview.explanationAcknowledged) {
      throw new Error('A person must review the images and authored text before saving.');
    }
    if (submission.form.deidentificationMode === 'not-reviewed') {
      throw new Error('Choose whether the case is synthetic or has a de-identification attestation before saving.');
    }
    if (
      submission.form.deidentificationMode === 'attested'
      && !submission.privacyReview.reviewedBy?.trim()
      && !submission.form.reviewedBy.trim()
    ) {
      throw new Error('Record who completed the de-identification attestation.');
    }

    const ordered = submission.assets.map((asset) => {
      const sessionAsset = this.sessionAssets.get(asset.id);
      if (!sessionAsset || sessionAsset.portable.sha256 !== asset.sha256) {
        throw new Error('An image changed after review. Add it and run privacy screening again.');
      }
      return { ui: asset, stored: sessionAsset.portable };
    });
    const starterLesson = await createStarterLessonPlanV1({
      caseId,
      title: `${submission.form.title}: starter lesson`,
      neutralDescription: submission.form.neutralDescription,
      teachingNotes: [submission.form.teachingNote],
      sourceName: submission.form.sourceName,
      sourceUrl: submission.form.sourceUrl,
    });
    const previewId = submission.previewAssetId || submission.assets[0].id;
    const preview = ordered.find((entry) => entry.ui.id === previewId) ?? ordered[0];
    const theme = PRESENTATION[submission.form.domain];
    const artifact = ordered.length === 1
      ? {
          kind: 'image' as const,
          modality: submission.form.modality.trim(),
          seriesId: 'teaching-image',
          seriesLabel: submission.form.seriesLabel.trim(),
          src: ordered[0].stored.uri,
          mimeType: ordered[0].stored.mimeType,
          sha256: ordered[0].stored.sha256,
          alt: ordered[0].ui.alt,
          width: ordered[0].stored.width,
          height: ordered[0].stored.height,
        }
      : {
          kind: 'image-stack' as const,
          series: [{
            id: 'teaching-images',
            label: submission.form.seriesLabel.trim(),
            modality: submission.form.modality.trim(),
            frames: ordered.map((entry, index) => ({
              id: `frame-${index + 1}`,
              src: entry.stored.uri,
              mimeType: entry.stored.mimeType,
              sha256: entry.stored.sha256,
              alt: entry.ui.alt,
              width: entry.stored.width,
              height: entry.stored.height,
            })),
          }],
        };
    const license = {
      name: submission.form.licenseName.trim(),
      ...(submission.form.licenseSpdxId.trim()
        ? { spdxId: submission.form.licenseSpdxId.trim() }
        : {}),
      ...(submission.form.licenseUrl.trim()
        ? { url: submission.form.licenseUrl.trim() }
        : {}),
    };
    const deidentification = submission.form.deidentificationMode === 'synthetic'
      ? {
          status: 'synthetic' as const,
          notes: 'The author confirmed that the images and vignette are synthetic and completed human privacy review.',
        }
      : {
          status: 'attested' as const,
          attestedBy: submission.privacyReview.reviewedBy?.trim() || submission.form.reviewedBy.trim(),
          attestedAt: submission.privacyReview.reviewedAt,
          notes: 'The author attested that a person reviewed every image and authored field under the applicable workflow.',
        };
    const casePackage = await createCasePackageV1({
      id: caseId,
      title: submission.form.title.trim(),
      vignette: submission.form.vignette.trim(),
      domain: submission.form.domain,
      difficulty: submission.form.difficulty,
      artifact,
      preview: {
        src: preview.stored.uri,
        mimeType: preview.stored.mimeType,
        sha256: preview.stored.sha256,
        alt: preview.ui.alt,
        width: preview.stored.width,
        height: preview.stored.height,
      },
      artifactHints: artifactHintsFor(submission.form.domain, ordered.length === 1),
      provenance: {
        sourceName: submission.form.sourceName.trim(),
        sourceUrl: submission.form.sourceUrl.trim(),
        license,
        attribution: submission.form.attribution.trim(),
        clinicianReview: { reviewed: false },
      },
      deidentification,
      contentWarnings: lines(submission.form.contentWarnings),
      neutralDescription: submission.form.neutralDescription.trim(),
      teachingNotes: [submission.form.teachingNote.trim()],
      lessonPlanRef: getLessonPlanRef(starterLesson),
      presentation: {
        subtitle: submission.form.seriesLabel.trim(),
        category: categoryFor(submission.form.domain, submission.form.modality),
        ...theme,
      },
    });
    const portableAssets = [...new Map(ordered.map((entry) => [
      entry.stored.uri,
      entry.stored,
    ])).values()];
    const portable = await createPortableCasePackageV1(casePackage, starterLesson, portableAssets);
    await this.store.save(portable, {
      expectedCaseManifestSha256: expectedManifest ?? null,
    });
    return casePackage;
  };

  importCase = async (file: File): Promise<StudioImportResult> => {
    const portable = await importPortableCaseArchive(file);
    if ((await listBuiltinCasePackages()).some((entry) => entry.id === portable.casePackage.id)) {
      throw new Error(`A built-in case already uses ID '${portable.casePackage.id}'.`);
    }
    if (await this.store.get(portable.casePackage.id)) {
      throw new Error(`A browser-local case already uses ID '${portable.casePackage.id}'. Delete it or choose another package.`);
    }
    const byUri = new Map(portable.assets.map((asset) => [asset.uri, asset]));
    const artifactReferences = collectCaseAssetReferences(portable.casePackage).filter(
      (reference) => reference.path !== 'casePackage.preview',
    );
    const blobsByUri = new Map<string, Blob>();
    const candidates = artifactReferences.map((reference) => {
      const portableAsset = byUri.get(reference.uri);
      if (!portableAsset) throw new Error(`Portable case asset '${reference.uri}' is missing.`);
      let blob = blobsByUri.get(portableAsset.uri);
      if (!blob) {
        blob = this.portableAssetBlob(portableAsset);
        blobsByUri.set(portableAsset.uri, blob);
      }
      return {
        portableAsset,
        blob,
      };
    });
    const uniqueCandidates = [...new Map(candidates.map((candidate) => [
      candidate.portableAsset.uri,
      candidate,
    ])).values()];
    for (const candidate of uniqueCandidates) {
      await this.validateImportedAsset(candidate.blob, candidate.portableAsset);
    }

    const assets: StudioAsset[] = [];
    try {
      for (const candidate of candidates) {
        assets.push(this.registerAsset(candidate.portableAsset, candidate.blob));
      }
      // Persist only after all untrusted images decode and every preview URL
      // exists. Any failed import leaves neither a case nor partial UI assets.
      await this.store.save(portable, { expectedCaseManifestSha256: null });
      return { casePackage: portable.casePackage, assets };
    } catch (error) {
      assets.forEach(this.releaseAsset);
      throw error;
    }
  };

  exportCase = async (casePackage: CasePackageV1): Promise<void> => {
    const portable = await this.store.get(casePackage.id);
    if (!portable || portable.casePackage.manifest.sha256 !== casePackage.manifest.sha256) {
      throw new Error('The exact saved case revision could not be found in this browser.');
    }
    const bytes = await exportPortableCaseArchive(portable);
    this.download(portableCaseArchiveBlob(bytes), safeDownloadName(casePackage.id));
  };

  loadStoredLesson = async (casePackage: CasePackageV1): Promise<LessonPlanV1 | null> => {
    const portable = await this.store.get(casePackage.id);
    if (!portable || portable.casePackage.manifest.sha256 !== casePackage.manifest.sha256) return null;
    return portable.lessonPlan;
  };

  saveUpdatedBundle = async (
    casePackage: CasePackageV1,
    lessonPlan: LessonPlanV1,
    expectedCaseManifestSha256?: string,
  ): Promise<boolean> => {
    if (!expectedCaseManifestSha256) return false;
    const existing = await this.store.get(casePackage.id);
    if (!existing) {
      throw new Error(
        `Browser-local case '${casePackage.id}' was deleted in another view. Reload before saving this lesson edit.`,
      );
    }
    const portable = await createPortableCasePackageV1(casePackage, lessonPlan, existing.assets);
    await this.store.save(portable, {
      expectedCaseManifestSha256,
    });
    return true;
  };

  resolveAssetUri = (uri: string): Promise<string> => this.store.resolveAssetUri(uri);

  getStorageStatus = () => this.store.initialize();

  subscribeStorageStatus = (
    listener: Parameters<CasePackageStore['subscribeStatus']>[0],
  ) => this.store.subscribeStatus(listener);

  deleteCase = async (caseId: string): Promise<void> => {
    if (!(await this.store.delete(caseId))) {
      throw new Error(`Browser-local case '${caseId}' was not found.`);
    }
    // Cases and their intro caches are separate stores; delete both so a later
    // save of the same ID cannot accidentally resurrect a stranded artifact.
    await this.introCacheStore.delete(caseId).catch(() => undefined);
  };

  /**
   * Compute the current intro-cache status for a browser-local case. Used by
   * Case Studio to render the "Intro cache" panel after a save. Does not
   * generate anything; call `generateIntroCacheForCase` to run the pipeline.
   */
  getIntroCacheStatus = async (caseId: string): Promise<IntroCacheStatus> => {
    const portable = await this.store.get(caseId);
    if (!portable) return { kind: 'idle' };
    const stored = await this.introCacheStore.get(caseId);
    if (!stored) return { kind: 'idle' };
    const current = await isIntroCacheCurrent(stored, {
      lessonPlan: portable.lessonPlan,
      assets: portable.assets,
      neutralDescription: portable.casePackage.neutralDescription,
    });
    if (!current) return { kind: 'stale', cache: stored };
    if (stored.review.status === 'approved') return { kind: 'approved', cache: stored };
    return { kind: 'ready-for-review', draft: stored };
  };

  /**
   * Run the auto-generation pipeline for a saved browser-local case using the
   * author's BYOK key and pinned model. Returns the freshly generated draft
   * artifact; also persists it via the authored intro-cache store so a reload
   * lands on the review step.
   */
  generateIntroCacheForCase = async (
    caseId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<IntroCacheV1> => {
    const portable = await this.store.get(caseId);
    if (!portable) {
      throw new IntroCacheAuthoringError({
        code: 'missing_lesson_plan',
        message: `Browser-local case '${caseId}' was not found. Save the case first.`,
        retryable: false,
      });
    }
    const apiKey = this.resolveApiKey() ?? '';
    if (!apiKey.trim()) {
      throw new IntroCacheAuthoringError({
        code: 'missing_key',
        message: 'Connect an OpenRouter key to auto-generate the intro cache.',
        retryable: false,
      });
    }
    const modelId = this.resolveModelId();
    const draft = await this.runIntroCacheGeneration({
      casePackage: portable.casePackage,
      lessonPlan: portable.lessonPlan,
      assets: portable.assets,
      apiKey,
      modelId,
      ...(options.signal ? { signal: options.signal } : {}),
      now: this.now,
    });
    await this.introCacheStore.save(draft);
    return draft;
  };

  /**
   * Persist an author's hand-edits to the current draft. Fails closed if the
   * edited artifact does not validate: the store never accepts a broken draft.
   */
  saveIntroCacheDraftForCase = async (
    caseId: string,
    draft: IntroCacheV1,
  ): Promise<void> => {
    if (draft.caseId !== caseId) {
      throw new Error(`Draft caseId '${draft.caseId}' does not match '${caseId}'.`);
    }
    if (draft.review.status !== 'draft') {
      throw new Error('Only draft-status artifacts can be saved as drafts. Use approve for approved status.');
    }
    await this.introCacheStore.save(draft);
  };

  /**
   * Approve the current draft with a reviewer identity. Byte-compatible with
   * `scripts/introCache/review.mts`: the artifact ends up with
   * `review = { status: 'approved', reviewer, credentials, reviewedAt }`, which
   * is what the runtime loader requires.
   */
  approveIntroCacheForCase = async (
    caseId: string,
    reviewer: { name: string; credentials: string },
  ): Promise<IntroCacheV1> => {
    const stored = await this.introCacheStore.get(caseId);
    if (!stored) {
      throw new Error(`No intro-cache draft exists for '${caseId}'.`);
    }
    const approved = approveIntroCache(stored, reviewer, this.now);
    await this.introCacheStore.save(approved);
    return approved;
  };

  /** Drop the browser-local intro cache for a case without deleting the case. */
  clearIntroCacheForCase = async (caseId: string): Promise<void> => {
    await this.introCacheStore.delete(caseId);
  };

  subscribeIntroCacheChanges = (
    listener: Parameters<AuthoredIntroCacheStore['subscribe']>[0],
  ) => this.introCacheStore.subscribe(listener);

  releaseAsset = (asset: StudioAsset): void => {
    const sessionAsset = this.sessionAssets.get(asset.id);
    if (sessionAsset?.previewUrl) this.revokeObjectUrl(sessionAsset.previewUrl);
    this.sessionAssets.delete(asset.id);
  };

  private registerPreparedAsset(asset: PreparedCaseImageAsset): StudioAsset {
    const { blob, originalName, ...portable } = asset;
    return this.registerAsset(portable, blob, originalName);
  }

  private portableAssetBlob(asset: PortableCaseAssetV1): Blob {
    const bytes = decodePortableAssetBytes(asset.bytesBase64);
    return new Blob([bytes.slice().buffer], { type: asset.mimeType });
  }

  private registerAsset(
    portable: PortableCaseAssetV1,
    blob: Blob,
    originalName?: string,
  ): StudioAsset {
    const id = `studio-asset-${this.nextAssetId++}`;
    const previewUrl = this.createObjectUrl(blob);
    this.sessionAssets.set(id, { portable, blob, originalName, previewUrl });
    return {
      id,
      src: portable.uri as StudioAsset['src'],
      mimeType: portable.mimeType,
      sha256: portable.sha256,
      width: portable.width,
      height: portable.height,
      previewUrl,
    };
  }
}

export function createCaseStudioController(
  options: CaseStudioControllerOptions = {},
): CaseStudioController {
  return new CaseStudioController(options);
}
