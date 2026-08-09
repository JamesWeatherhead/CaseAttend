import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileImage,
  FolderOpen,
  GraduationCap,
  ImagePlus,
  LockKeyhole,
  Save,
  ScanSearch,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CaseDifficulty, CasePackageV1 } from '../../core/casePackage';
import type { DomainKey } from '../../lib/domains/types';
import './CaseStudio.css';

export const CASE_STUDIO_STEPS = [
  { short: 'Images', title: 'Add and order images' },
  { short: 'Describe', title: 'Describe the teaching case' },
  { short: 'Rights and privacy', title: 'Review rights and privacy' },
  { short: 'Preview and save', title: 'Preview, save, and export' },
] as const;

export type StudioScanStatus = 'no-warning-detected' | 'warning' | 'unavailable';

export interface StudioAsset {
  /** Stable, non-identifying UI key. Source filenames must not be persisted here. */
  id: string;
  src: `case://assets/${string}`;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sha256: string;
  width: number;
  height: number;
  /** Local object URL or data URL used only for browser-local preview. */
  previewUrl?: string;
  warnings?: readonly string[];
}

export interface StudioPrivacyResult {
  assetSha256: string;
  textStatus: StudioScanStatus;
  faceStatus: StudioScanStatus;
  textLikeRegionCount?: number;
  faceCount?: number;
  warnings: readonly string[];
}

export interface StudioFormData {
  id: string;
  title: string;
  vignette: string;
  domain: DomainKey;
  difficulty: CaseDifficulty;
  modality: string;
  seriesLabel: string;
  neutralDescription: string;
  accessibleDescription: string;
  teachingNote: string;
  contentWarnings: string;
  sourceName: string;
  sourceUrl: string;
  licenseName: string;
  licenseSpdxId: string;
  licenseUrl: string;
  attribution: string;
  deidentificationMode: 'synthetic' | 'attested' | 'not-reviewed';
  reviewedBy: string;
}

export interface CaseStudioSubmission {
  form: StudioFormData;
  assets: readonly (StudioAsset & { alt: string })[];
  previewAssetId: string;
  /** Exact local revision being edited. Omitted when creating a new ID. */
  expectedCaseManifestSha256?: string;
  privacyResults: readonly StudioPrivacyResult[];
  rightsUseReview: {
    confirmed: true;
    confirmedAt: string;
  };
  privacyReview: {
    humanReviewed: true;
    reviewedBy?: string;
    reviewedAt: string;
    explanationAcknowledged: true;
  };
}

export interface StudioImportResult {
  casePackage: CasePackageV1;
  assets: readonly StudioAsset[];
  privacyResults?: readonly StudioPrivacyResult[];
}

export interface CaseStudioProps {
  onExit: () => void;
  processFiles: (
    files: readonly File[],
    onProgress: (completed: number, total: number) => void,
  ) => Promise<readonly StudioAsset[]>;
  scanAssets: (
    assets: readonly StudioAsset[],
    domain: DomainKey,
    onProgress: (completed: number, total: number) => void,
  ) => Promise<readonly StudioPrivacyResult[]>;
  saveCase: (submission: CaseStudioSubmission) => Promise<CasePackageV1>;
  importCase: (file: File) => Promise<StudioImportResult>;
  exportCase: (casePackage: CasePackageV1) => Promise<void>;
  onPreview: (casePackage: CasePackageV1) => void;
  onOpenLessonBuilder: (caseId: string) => void;
  releaseAsset?: (asset: StudioAsset) => void;
  getStorageStatus?: () => Promise<{ persistent: boolean; message: string }>;
  subscribeStorageStatus?: (
    listener: (status: { persistent: boolean; message: string }) => void,
  ) => () => void;
  now?: () => Date;
}

const INITIAL_FORM: StudioFormData = {
  id: '',
  title: '',
  vignette: '',
  domain: 'radiology',
  difficulty: 'intermediate',
  modality: 'OT',
  seriesLabel: 'Teaching images',
  neutralDescription: '',
  accessibleDescription: '',
  teachingNote: '',
  contentWarnings: 'Medical image',
  sourceName: '',
  sourceUrl: '',
  licenseName: '',
  licenseSpdxId: '',
  licenseUrl: '',
  attribution: '',
  deidentificationMode: 'synthetic',
  reviewedBy: '',
};

const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INPUT_CLASS = 'case-studio-input';
const RIGHTS_REVIEW_FIELDS = new Set<keyof StudioFormData>([
  'sourceName',
  'sourceUrl',
  'licenseName',
  'licenseSpdxId',
  'licenseUrl',
  'attribution',
]);

function normalizeId(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function lines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function isHttpsUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

async function hasDicomPreamble(file: File): Promise<boolean> {
  if (/\.d(?:cm|icom)$/i.test(file.name) || /dicom/i.test(file.type)) return true;
  if (file.size < 132) return false;
  try {
    const blob = file.slice(128, 132);
    const buffer = typeof blob.arrayBuffer === 'function'
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error ?? new Error('Could not inspect the selected file.'));
          reader.readAsArrayBuffer(blob);
        });
    const bytes = new Uint8Array(buffer);
    return bytes.length === 4
      && bytes[0] === 0x44
      && bytes[1] === 0x49
      && bytes[2] === 0x43
      && bytes[3] === 0x4d;
  } catch {
    return false;
  }
}

function caseToForm(casePackage: CasePackageV1): StudioFormData {
  const modality = casePackage.artifact.kind === 'image'
    ? casePackage.artifact.modality
    : casePackage.artifact.series[0]?.modality ?? 'OT';
  const seriesLabel = casePackage.artifact.kind === 'image'
    ? casePackage.artifact.seriesLabel
    : casePackage.artifact.series[0]?.label ?? 'Teaching images';
  const accessibleDescription = casePackage.artifact.kind === 'image'
    ? casePackage.artifact.alt
    : casePackage.artifact.series[0]?.frames[0]?.alt.replace(/, frame \d+ of \d+\.?$/i, '')
      ?? casePackage.neutralDescription;
  return {
    id: casePackage.id,
    title: casePackage.title,
    vignette: casePackage.vignette,
    domain: casePackage.domain,
    difficulty: casePackage.difficulty,
    modality,
    seriesLabel,
    neutralDescription: casePackage.neutralDescription,
    accessibleDescription,
    teachingNote: casePackage.teachingNotes.join('\n'),
    contentWarnings: casePackage.contentWarnings.join('\n'),
    sourceName: casePackage.provenance.sourceName,
    sourceUrl: casePackage.provenance.sourceUrl ?? '',
    licenseName: casePackage.provenance.license.name,
    licenseSpdxId: casePackage.provenance.license.spdxId ?? '',
    licenseUrl: casePackage.provenance.license.url ?? '',
    attribution: casePackage.provenance.attribution,
    deidentificationMode: casePackage.deidentification.status,
    reviewedBy: casePackage.deidentification.status === 'attested'
      ? casePackage.deidentification.attestedBy
      : '',
  };
}

function validateStep(
  step: number,
  form: StudioFormData,
  assets: readonly StudioAsset[],
  privacyResults: readonly StudioPrivacyResult[],
  rightsUseConfirmed: boolean,
  humanReviewConfirmed: boolean,
): string[] {
  const errors: string[] = [];
  if (step === 0 && assets.length === 0) {
    errors.push('Add at least one JPEG, PNG, or WebP image.');
  }
  if (step === 1) {
    if (!form.id.trim()) errors.push('Enter a stable case ID.');
    else if (!KEBAB_ID.test(form.id.trim())) errors.push('Case ID must use lowercase kebab-case.');
    if (!form.title.trim()) errors.push('Enter a case title.');
    if (!form.vignette.trim()) errors.push('Enter a learner-facing vignette.');
    if (!form.modality.trim()) errors.push('Enter an image modality.');
    if (!form.seriesLabel.trim()) errors.push('Enter a series label.');
    if (!form.neutralDescription.trim()) errors.push('Add a neutral description that does not reveal the answer.');
    if (!form.accessibleDescription.trim()) errors.push('Add an accessible image description that does not reveal the answer.');
    if (!form.teachingNote.trim()) errors.push('Add at least one educator-only teaching note.');
  }
  if (step === 2) {
    if (!form.sourceName.trim()) errors.push('Record where the images came from.');
    if (!form.licenseName.trim()) errors.push('Record the image license or usage terms.');
    if (!form.attribution.trim()) errors.push('Add the required attribution.');
    if (!form.sourceUrl.trim()) errors.push('Add the HTTPS URL for the image source. A license deed is not artifact provenance.');
    else if (!isHttpsUrl(form.sourceUrl)) errors.push('Source URL must be an HTTPS URL without embedded credentials.');
    if (!form.licenseUrl.trim()) errors.push('Add the HTTPS URL for the license or usage terms.');
    else if (!isHttpsUrl(form.licenseUrl)) errors.push('License URL must be an HTTPS URL without embedded credentials.');
    if (!rightsUseConfirmed) {
      errors.push('Confirm that the recorded terms or authorization permit storing, using, and exporting these images.');
    }
    if (privacyResults.length !== assets.length) {
      errors.push('Run the browser-local privacy screening for every image.');
    }
    if (form.deidentificationMode === 'not-reviewed') {
      errors.push('Choose Synthetic case or De-identification attested before saving an imported case that was not reviewed.');
    }
    if (form.deidentificationMode === 'attested' && !form.reviewedBy.trim()) {
      errors.push('Enter the name of the person making the de-identification attestation.');
    }
    if (!humanReviewConfirmed) {
      errors.push('Confirm that a person reviewed every image and the authored text for identifiers.');
    }
  }
  return errors;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, required, children }) => (
  <div className="case-studio-field">
    <label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {hint && <p className="case-studio-hint" id={`${htmlFor}-hint`}>{hint}</p>}
    {children}
  </div>
);

const CaseStudio: React.FC<CaseStudioProps> = ({
  onExit,
  processFiles,
  scanAssets,
  saveCase,
  importCase,
  exportCase,
  onPreview,
  onOpenLessonBuilder,
  releaseAsset,
  getStorageStatus,
  subscribeStorageStatus,
  now = () => new Date(),
}) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<StudioFormData>(INITIAL_FORM);
  const [assets, setAssets] = useState<readonly StudioAsset[]>([]);
  const [previewAssetId, setPreviewAssetId] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [privacyResults, setPrivacyResults] = useState<readonly StudioPrivacyResult[]>([]);
  const [rightsUseConfirmed, setRightsUseConfirmed] = useState(false);
  const [humanReviewConfirmed, setHumanReviewConfirmed] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [busyLabel, setBusyLabel] = useState('');
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [storageStatus, setStorageStatus] = useState<{ persistent: boolean; message: string } | null>(null);
  const [savedCase, setSavedCase] = useState<CasePackageV1 | null>(null);
  const [revisionBase, setRevisionBase] = useState<{
    id: string;
    manifestSha256: string;
  } | null>(null);
  const [importedPackageMetadata, setImportedPackageMetadata] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const assetsRef = useRef<readonly StudioAsset[]>(assets);
  const releaseAssetRef = useRef(releaseAsset);
  const mountedRef = useRef(true);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    releaseAssetRef.current = releaseAsset;
  }, [releaseAsset]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const release = releaseAssetRef.current;
      if (release) assetsRef.current.forEach((asset) => release(asset));
    };
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeStorageStatus?.((status) => {
      if (active) setStorageStatus(status);
    });
    if (getStorageStatus) {
      void getStorageStatus().then((status) => {
        if (active) setStorageStatus(status);
      }).catch(() => {
        if (active) {
          setStorageStatus({
            persistent: false,
            message: 'Storage status could not be verified. Export a portable copy before closing this page.',
          });
        }
      });
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [getStorageStatus, subscribeStorageStatus]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (errors.length > 0) errorRef.current?.focus();
  }, [errors]);

  const busy = Boolean(busyLabel);
  const selectedPreview = assets.find((asset) => asset.id === previewAssetId) ?? assets[0];
  const visiblePreview = assets[previewIndex] ?? selectedPreview;
  const scanByDigest = useMemo(
    () => new Map(privacyResults.map((result) => [result.assetSha256, result])),
    [privacyResults],
  );
  const hasAuthoredWork = assets.length > 0
    || JSON.stringify(form) !== JSON.stringify(INITIAL_FORM)
    || privacyResults.length > 0
    || rightsUseConfirmed
    || humanReviewConfirmed;
  const savedOnlyInMemory = Boolean(savedCase && storageStatus?.persistent !== true);
  const shouldWarnBeforeExit = busy
    || (!savedCase && hasAuthoredWork)
    || savedOnlyInMemory;

  useEffect(() => {
    if (!shouldWarnBeforeExit) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [shouldWarnBeforeExit]);

  const requestExit = () => {
    if (busy) return;
    if (shouldWarnBeforeExit) {
      const message = savedOnlyInMemory
        ? 'Leave Case Studio? This case is in memory-only storage and will be lost when this page closes. Export a portable copy first.'
        : 'Leave Case Studio? Unsaved images and authored text will be lost. Stay to save or export your work.';
      if (!window.confirm(message)) return;
    }
    onExit();
  };

  const updateForm = <K extends keyof StudioFormData>(key: K, value: StudioFormData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === 'domain') setPrivacyResults([]);
    if (RIGHTS_REVIEW_FIELDS.has(key)) setRightsUseConfirmed(false);
    setHumanReviewConfirmed(false);
    setSavedCase(null);
    setImportedPackageMetadata(false);
    setErrors([]);
    setStatusMessage(key === 'domain' && privacyResults.length > 0
      ? 'Domain changed. Run browser-local privacy screening again before continuing.'
      : '');
  };

  const replaceAssets = (nextAssets: readonly StudioAsset[]) => {
    assetsRef.current = nextAssets;
    setAssets(nextAssets);
    setPreviewAssetId((current) => nextAssets.some((asset) => asset.id === current)
      ? current
      : nextAssets[0]?.id ?? '');
    setPreviewIndex((current) => Math.min(current, Math.max(0, nextAssets.length - 1)));
    setPrivacyResults([]);
    setRightsUseConfirmed(false);
    setHumanReviewConfirmed(false);
    setSavedCase(null);
    setImportedPackageMetadata(false);
    setErrors([]);
  };

  const handleImages = async (files: readonly File[]) => {
    if (files.length === 0) return;
    setErrors([]);
    setStatusMessage('');
    const containsDicom = (await Promise.all(files.map(hasDicomPreamble))).some(Boolean);
    if (!mountedRef.current) return;
    if (containsDicom) {
      setErrors([
        'Raw DICOM is not accepted in Case Studio. DICOM files can contain identifying metadata and burned-in identifiers. Use an institution-managed clinical-data workflow to de-identify and export approved JPEG, PNG, or WebP teaching images first.',
      ]);
      return;
    }
    setBusyLabel('Preparing images');
    setProgress({ completed: 0, total: files.length });
    let prepared: readonly StudioAsset[] = [];
    let accepted = false;
    try {
      prepared = await processFiles(files, (completed, total) => {
        if (mountedRef.current) setProgress({ completed, total });
      });
      if (!mountedRef.current) {
        if (releaseAsset) prepared.forEach((asset) => releaseAsset(asset));
        return;
      }
      if (prepared.length !== files.length) throw new Error('Not every selected image could be prepared.');
      const ids = new Set(assets.map((asset) => asset.id));
      const digests = new Set(assets.map((asset) => asset.sha256));
      for (const asset of prepared) {
        if (ids.has(asset.id)) throw new Error('Prepared images must have unique browser-local IDs.');
        ids.add(asset.id);
        if (digests.has(asset.sha256)) throw new Error('The same image was added more than once. Remove the duplicate and try again.');
        digests.add(asset.sha256);
      }
      const nextAssets = [...assets, ...prepared];
      replaceAssets(nextAssets);
      accepted = true;
      setStatusMessage(`${prepared.length} image${prepared.length === 1 ? '' : 's'} prepared locally. Review the order before continuing.`);
    } catch (error: unknown) {
      if (!accepted && releaseAsset) prepared.forEach((asset) => releaseAsset(asset));
      if (mountedRef.current) {
        setErrors([error instanceof Error ? error.message : 'The selected images could not be prepared.']);
      }
    } finally {
      if (mountedRef.current) {
        setBusyLabel('');
        setProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const moveAsset = (id: string, direction: -1 | 1) => {
    const index = assets.findIndex((asset) => asset.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= assets.length) return;
    const next = [...assets];
    [next[index], next[destination]] = [next[destination], next[index]];
    replaceAssets(next);
    setStatusMessage(`Frame moved to position ${destination + 1}. Privacy screening must be run again after image changes.`);
  };

  const removeAsset = (id: string) => {
    const removed = assets.find((asset) => asset.id === id);
    if (removed && releaseAsset) releaseAsset(removed);
    replaceAssets(assets.filter((asset) => asset.id !== id));
    setStatusMessage('Image removed. Privacy screening must be run again.');
  };

  const runPrivacyScan = async () => {
    setErrors([]);
    setStatusMessage('');
    setBusyLabel('Running browser-local privacy screening');
    setProgress({ completed: 0, total: assets.length });
    setHumanReviewConfirmed(false);
    try {
      const results = await scanAssets(
        assets,
        form.domain,
        (completed, total) => {
          if (mountedRef.current) setProgress({ completed, total });
        },
      );
      if (!mountedRef.current) return;
      const resultDigests = new Set(results.map((result) => result.assetSha256));
      if (results.length !== assets.length || assets.some((asset) => !resultDigests.has(asset.sha256))) {
        throw new Error('Privacy screening did not return a result for every image.');
      }
      setPrivacyResults(results);
      setStatusMessage('Automated screening finished. A person must still review every image and the authored text.');
    } catch (error: unknown) {
      if (mountedRef.current) {
        setPrivacyResults([]);
        setErrors([error instanceof Error ? error.message : 'Privacy screening could not be completed.']);
      }
    } finally {
      if (mountedRef.current) {
        setBusyLabel('');
        setProgress(null);
      }
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    setErrors([]);
    setStatusMessage('');
    setBusyLabel('Validating portable case');
    try {
      const imported = await importCase(file);
      if (!mountedRef.current) {
        if (releaseAsset) imported.assets.forEach((asset) => releaseAsset(asset));
        return;
      }
      if (releaseAsset) assets.forEach((asset) => releaseAsset(asset));
      const nextForm = caseToForm(imported.casePackage);
      setForm(nextForm);
      assetsRef.current = imported.assets;
      setAssets(imported.assets);
      setPreviewAssetId(imported.casePackage.preview.src.startsWith('case://assets/')
        ? imported.assets.find((asset) => asset.src === imported.casePackage.preview.src)?.id ?? imported.assets[0]?.id ?? ''
        : imported.assets[0]?.id ?? '');
      setPreviewIndex(0);
      // Archive attestations are package metadata. They are not evidence that
      // this browser ran the current warning-only privacy screen.
      setPrivacyResults([]);
      setRightsUseConfirmed(false);
      setHumanReviewConfirmed(false);
      setSavedCase(imported.casePackage);
      setRevisionBase({
        id: imported.casePackage.id,
        manifestSha256: imported.casePackage.manifest.sha256,
      });
      setImportedPackageMetadata(true);
      setStep(3);
      setStatusMessage('Portable case imported and saved in this browser. Rights and de-identification fields are imported package metadata; browser-local screening has not run here.');
    } catch (error: unknown) {
      if (mountedRef.current) {
        setErrors([error instanceof Error ? error.message : 'The portable case could not be imported.']);
      }
    } finally {
      if (mountedRef.current) {
        setBusyLabel('');
        if (importInputRef.current) importInputRef.current.value = '';
      }
    }
  };

  const goToStep = (nextStep: number) => {
    if (busy) return;
    if (nextStep <= step) {
      setErrors([]);
      setStep(nextStep);
      return;
    }
    const stepErrors = validateStep(
      step,
      form,
      assets,
      privacyResults,
      rightsUseConfirmed,
      humanReviewConfirmed,
    );
    if (stepErrors.length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors([]);
    setStep(Math.min(CASE_STUDIO_STEPS.length - 1, nextStep));
  };

  const save = async () => {
    const privacyErrors = validateStep(2, form, assets, privacyResults, rightsUseConfirmed, humanReviewConfirmed);
    const imageErrors = validateStep(0, form, assets, privacyResults, rightsUseConfirmed, humanReviewConfirmed);
    const descriptionErrors = validateStep(1, form, assets, privacyResults, rightsUseConfirmed, humanReviewConfirmed);
    const allErrors = [...imageErrors, ...descriptionErrors, ...privacyErrors];
    if (allErrors.length > 0) {
      setErrors(allErrors);
      return;
    }
    setBusyLabel('Saving case in this browser');
    setErrors([]);
    try {
      const count = assets.length;
      const casePackage = await saveCase({
        form: {
          ...form,
          id: form.id.trim(),
          title: form.title.trim(),
          vignette: form.vignette.trim(),
          modality: form.modality.trim(),
          seriesLabel: form.seriesLabel.trim(),
          neutralDescription: form.neutralDescription.trim(),
          accessibleDescription: form.accessibleDescription.trim(),
          teachingNote: form.teachingNote.trim(),
          contentWarnings: lines(form.contentWarnings).join('\n'),
          sourceName: form.sourceName.trim(),
          sourceUrl: form.sourceUrl.trim(),
          licenseName: form.licenseName.trim(),
          licenseSpdxId: form.licenseSpdxId.trim(),
          licenseUrl: form.licenseUrl.trim(),
          attribution: form.attribution.trim(),
          reviewedBy: form.reviewedBy.trim(),
        },
        assets: assets.map((asset, index) => ({
          ...asset,
          alt: count === 1
            ? form.accessibleDescription.trim()
            : `${form.accessibleDescription.trim()}, frame ${index + 1} of ${count}.`,
        })),
        previewAssetId: selectedPreview?.id ?? assets[0].id,
        ...(revisionBase?.id === form.id.trim()
          ? { expectedCaseManifestSha256: revisionBase.manifestSha256 }
          : {}),
        privacyResults,
        rightsUseReview: {
          confirmed: true,
          confirmedAt: now().toISOString(),
        },
        privacyReview: {
          humanReviewed: true,
          ...(form.deidentificationMode === 'attested'
            ? { reviewedBy: form.reviewedBy.trim() }
            : {}),
          reviewedAt: now().toISOString(),
          explanationAcknowledged: true,
        },
      });
      if (!mountedRef.current) return;
      setSavedCase(casePackage);
      setRevisionBase({ id: casePackage.id, manifestSha256: casePackage.manifest.sha256 });
      setImportedPackageMetadata(false);
      setStatusMessage('Case saved in this browser. You can preview it, build its lesson, or export a portable copy.');
    } catch (error: unknown) {
      if (mountedRef.current) {
        setErrors([error instanceof Error ? error.message : 'The case could not be saved. Your entered work is still here.']);
      }
    } finally {
      if (mountedRef.current) setBusyLabel('');
    }
  };

  const doExport = async () => {
    if (!savedCase) return;
    setBusyLabel('Preparing portable case');
    setErrors([]);
    try {
      await exportCase(savedCase);
      if (mountedRef.current) {
        setStatusMessage('Portable case exported. It contains only this case, its exact linked lesson, and its referenced re-encoded images.');
      }
    } catch (error: unknown) {
      if (mountedRef.current) {
        setErrors([error instanceof Error ? error.message : 'The portable case could not be exported.']);
      }
    } finally {
      if (mountedRef.current) setBusyLabel('');
    }
  };

  return (
    <main className="case-studio-shell" aria-busy={busy}>
      <header className="case-studio-topbar">
        <button type="button" className="case-studio-back" disabled={busy} onClick={requestExit}>
          <ArrowLeft aria-hidden="true" />
          <span>Back to cases</span>
        </button>
        <div className="case-studio-brand" aria-label="CaseAttend Case Studio">
          <img src="/logo.svg" alt="" />
          <span>CaseAttend</span>
          <span className="case-studio-product">Case Studio</span>
        </div>
        <span className="case-studio-local"><LockKeyhole aria-hidden="true" /> Browser-only authoring</span>
      </header>

      <div className="case-studio-layout">
        <aside className="case-studio-sidebar" aria-label="Case Studio progress">
          <div className="case-studio-intro">
            <p className="case-studio-eyebrow">Local case authoring</p>
            <h1>Create a reusable visual teaching case</h1>
            <p>
              A vision-language model, or VLM, is an AI model that can interpret images and words together.
              Many current frontier models are VLMs, but the terms are not synonyms. Case Studio prepares the case locally before any learner chooses to contact a model provider.
            </p>
          </div>
          <ol className="case-studio-steps">
            {CASE_STUDIO_STEPS.map((entry, index) => (
              <li key={entry.short}>
                <button
                  type="button"
                  aria-current={step === index ? 'step' : undefined}
                  disabled={busy || index > step}
                  className={step === index ? 'active' : index < step ? 'complete' : ''}
                  onClick={() => goToStep(index)}
                >
                  <span className="case-studio-step-number" aria-hidden="true">
                    {index < step ? <Check /> : index + 1}
                  </span>
                  <span><strong>{entry.short}</strong><small>{entry.title}</small></span>
                </button>
              </li>
            ))}
          </ol>
          <div className="case-studio-local-note" role="status" aria-live="polite">
            <ShieldCheck aria-hidden="true" />
            <p>
              <strong>Source images stay in this browser.</strong>{' '}
              {storageStatus?.message ?? 'CaseAttend re-encodes supported raster images and stores saved work in browser storage.'}
              {storageStatus && !storageStatus.persistent && !/export/i.test(storageStatus.message)
                ? ' Export a portable copy before closing this page.'
                : ''}
            </p>
          </div>
        </aside>

        <section className="case-studio-workspace" aria-labelledby="case-studio-step-title">
          <div className="case-studio-workspace-header">
            <p className="case-studio-eyebrow">Step {step + 1} of {CASE_STUDIO_STEPS.length}</p>
            <h2 id="case-studio-step-title" ref={headingRef} tabIndex={-1}>{CASE_STUDIO_STEPS[step].title}</h2>
          </div>

          {errors.length > 0 && (
            <div className="case-studio-error-summary" role="alert" tabIndex={-1} ref={errorRef}>
              <AlertCircle aria-hidden="true" />
              <div>
                <h3>Review these items</h3>
                <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            </div>
          )}

          <form onSubmit={(event) => event.preventDefault()}>
            <fieldset className="case-studio-authoring-fields" disabled={busy}>
            {step === 0 && (
              <div className="case-studio-section-stack">
                <div className="case-studio-info-card">
                  <FileImage aria-hidden="true" />
                  <p>
                    Add JPEG, PNG, or WebP images. For a stack, select every frame and then confirm the order below.
                    Raw DICOM is intentionally deferred because metadata and burned-in pixels need a dedicated clinical-data workflow.
                  </p>
                </div>

                <div className="case-studio-upload-grid">
                  <div className="case-studio-upload-card">
                    <ImagePlus aria-hidden="true" />
                    <h3>Add teaching images</h3>
                    <p>Files are validated and re-encoded locally. Ordinary EXIF metadata is not carried into the prepared copy.</p>
                    <input
                      ref={fileInputRef}
                      id="case-studio-images"
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      multiple
                      disabled={busy}
                      onChange={(event) => void handleImages(Array.from(event.target.files ?? []))}
                    />
                    <label className="case-studio-button primary" htmlFor="case-studio-images">
                      <Upload aria-hidden="true" /> Select images
                    </label>
                  </div>
                  <div className="case-studio-upload-card secondary">
                    <FolderOpen aria-hidden="true" />
                    <h3>Import a portable case</h3>
                    <p>A failed import will not replace the images or text already entered here.</p>
                    <input
                      ref={importInputRef}
                      id="case-studio-import"
                      className="sr-only"
                      type="file"
                      accept=".caseattend,application/zip,application/vnd.caseattend.case+zip"
                      disabled={busy}
                      onChange={(event) => void handleImport(event.target.files?.[0])}
                    />
                    <label className="case-studio-button secondary" htmlFor="case-studio-import">
                      <FolderOpen aria-hidden="true" /> Import case
                    </label>
                  </div>
                </div>

                {assets.length > 0 && (
                  <section aria-labelledby="case-studio-order-heading">
                    <div className="case-studio-subsection-heading">
                      <div>
                        <h3 id="case-studio-order-heading">Frame order</h3>
                        <p>Frame 1 appears first. Choose one included image as the case-card preview.</p>
                      </div>
                      <span>{assets.length} frame{assets.length === 1 ? '' : 's'}</span>
                    </div>
                    <ol className="case-studio-asset-list">
                      {assets.map((asset, index) => (
                        <li key={asset.id}>
                          <div className="case-studio-asset-preview">
                            {asset.previewUrl
                              ? <img src={asset.previewUrl} alt="" />
                              : <FileImage aria-hidden="true" />}
                          </div>
                          <div className="case-studio-asset-copy">
                            <strong>Frame {index + 1}</strong>
                            <span>{asset.width} by {asset.height} pixels, {asset.mimeType.replace('image/', '').toUpperCase()}</span>
                            {asset.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
                          </div>
                          <label className="case-studio-preview-choice">
                            <input
                              type="radio"
                              name="case-preview"
                              checked={(previewAssetId || assets[0]?.id) === asset.id}
                              onChange={() => {
                                setPreviewAssetId(asset.id);
                                setSavedCase(null);
                                setImportedPackageMetadata(false);
                                setStatusMessage('Case-card preview changed. Save the case again to keep this choice.');
                              }}
                            />
                            Card preview
                          </label>
                          <div className="case-studio-asset-actions">
                            <button type="button" disabled={index === 0} onClick={() => moveAsset(asset.id, -1)} aria-label={`Move frame ${index + 1} up`}><ArrowUp aria-hidden="true" /></button>
                            <button type="button" disabled={index === assets.length - 1} onClick={() => moveAsset(asset.id, 1)} aria-label={`Move frame ${index + 1} down`}><ArrowDown aria-hidden="true" /></button>
                            <button type="button" onClick={() => removeAsset(asset.id)} aria-label={`Remove frame ${index + 1}`}><Trash2 aria-hidden="true" /></button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="case-studio-section-stack">
                <div className="case-studio-info-card">
                  <GraduationCap aria-hidden="true" />
                  <p>Keep learner-facing descriptions neutral. Put answer-revealing material only in the educator teaching note.</p>
                </div>
                <div className="case-studio-field-grid">
                  <Field label="Case ID" htmlFor="case-id" hint="Stable lowercase kebab-case, for example chest-pattern-01." required>
                    <div className="case-studio-input-action">
                      <input id="case-id" className={INPUT_CLASS} value={form.id} onChange={(event) => updateForm('id', event.target.value)} aria-describedby="case-id-hint" required />
                      <button type="button" onClick={() => updateForm('id', normalizeId(form.title))}>Use title</button>
                    </div>
                  </Field>
                  <Field label="Case title" htmlFor="case-title" required>
                    <input id="case-title" className={INPUT_CLASS} value={form.title} onChange={(event) => updateForm('title', event.target.value)} required />
                  </Field>
                  <Field label="Domain" htmlFor="case-domain" required>
                    <select id="case-domain" className={INPUT_CLASS} value={form.domain} onChange={(event) => updateForm('domain', event.target.value as DomainKey)}>
                      <option value="radiology">Radiology</option>
                      <option value="pathology">Pathology</option>
                      <option value="dermatology">Dermatology</option>
                      <option value="ecg">ECG</option>
                      <option value="ultrasound">Ultrasound</option>
                      <option value="ophthalmology">Ophthalmology</option>
                    </select>
                  </Field>
                  <Field label="Difficulty" htmlFor="case-difficulty" required>
                    <select id="case-difficulty" className={INPUT_CLASS} value={form.difficulty} onChange={(event) => updateForm('difficulty', event.target.value as CaseDifficulty)}>
                      <option value="introductory">Introductory</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </Field>
                  <Field label="Modality" htmlFor="case-modality" hint="Examples: CR, CT, MR, PATH, XC, or OT." required>
                    <input id="case-modality" className={INPUT_CLASS} value={form.modality} onChange={(event) => updateForm('modality', event.target.value)} aria-describedby="case-modality-hint" required />
                  </Field>
                  <Field label="Series label" htmlFor="case-series-label" required>
                    <input id="case-series-label" className={INPUT_CLASS} value={form.seriesLabel} onChange={(event) => updateForm('seriesLabel', event.target.value)} required />
                  </Field>
                </div>
                <Field label="Learner-facing vignette" htmlFor="case-vignette" hint="Do not include names, dates of birth, record numbers, contact details, or other direct identifiers." required>
                  <textarea id="case-vignette" className={INPUT_CLASS} rows={4} value={form.vignette} onChange={(event) => updateForm('vignette', event.target.value)} aria-describedby="case-vignette-hint" required />
                </Field>
                <Field label="Neutral case description" htmlFor="case-neutral" hint="Describe the artifact without revealing the finding or diagnosis." required>
                  <textarea id="case-neutral" className={INPUT_CLASS} rows={3} value={form.neutralDescription} onChange={(event) => updateForm('neutralDescription', event.target.value)} aria-describedby="case-neutral-hint" required />
                </Field>
                <Field label="Accessible image description" htmlFor="case-alt" hint="This becomes alt text. For a stack, Case Studio adds the frame number automatically." required>
                  <textarea id="case-alt" className={INPUT_CLASS} rows={3} value={form.accessibleDescription} onChange={(event) => updateForm('accessibleDescription', event.target.value)} aria-describedby="case-alt-hint" required />
                </Field>
                <Field label="Educator-only teaching note" htmlFor="case-teaching-note" hint="This may reveal the teaching answer. It becomes educator-controlled content, not fixed CaseAttend policy." required>
                  <textarea id="case-teaching-note" className={INPUT_CLASS} rows={4} value={form.teachingNote} onChange={(event) => updateForm('teachingNote', event.target.value)} aria-describedby="case-teaching-note-hint" required />
                </Field>
                <Field label="Content warnings" htmlFor="case-content-warnings" hint="One warning per line. These help learners choose whether to open the case.">
                  <textarea id="case-content-warnings" className={INPUT_CLASS} rows={2} value={form.contentWarnings} onChange={(event) => updateForm('contentWarnings', event.target.value)} aria-describedby="case-content-warnings-hint" />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="case-studio-section-stack">
                {importedPackageMetadata && (
                  <div className="case-studio-info-card" role="note">
                    <ShieldCheck aria-hidden="true" />
                    <p>
                      The source, license, and de-identification values shown here came from the imported package. They are metadata to review, not proof that this browser completed privacy screening.
                    </p>
                  </div>
                )}
                <div className="case-studio-warning-card">
                  <ShieldCheck aria-hidden="true" />
                  <div>
                    <h3>Automated screening is only a warning tool</h3>
                    <p>
                      It does not establish HIPAA de-identification, IRB approval, consent, or permission to publish.
                      Your institution decides whether a workflow and dataset are appropriate. A person must review every image and all authored text.
                    </p>
                  </div>
                </div>

                <section aria-labelledby="provenance-heading">
                  <div className="case-studio-subsection-heading"><div><h3 id="provenance-heading">Provenance and license</h3><p>Record enough information for another educator to verify the source and usage terms.</p></div></div>
                  <div className="case-studio-field-grid">
                    <Field label="Source name" htmlFor="source-name" required><input id="source-name" className={INPUT_CLASS} value={form.sourceName} onChange={(event) => updateForm('sourceName', event.target.value)} required /></Field>
                    <Field label="Source URL" htmlFor="source-url" hint="Required HTTPS artifact provenance. A license deed is not an image source." required><input id="source-url" className={INPUT_CLASS} type="url" inputMode="url" placeholder="https://" value={form.sourceUrl} onChange={(event) => updateForm('sourceUrl', event.target.value)} aria-describedby="source-url-hint" required /></Field>
                    <Field label="License or usage terms" htmlFor="license-name" required><input id="license-name" className={INPUT_CLASS} value={form.licenseName} onChange={(event) => updateForm('licenseName', event.target.value)} required /></Field>
                    <Field label="SPDX license ID" htmlFor="license-spdx" hint="Optional, for example CC-BY-4.0."><input id="license-spdx" className={INPUT_CLASS} value={form.licenseSpdxId} onChange={(event) => updateForm('licenseSpdxId', event.target.value)} aria-describedby="license-spdx-hint" /></Field>
                    <Field label="License URL" htmlFor="license-url" hint="Required HTTPS link to the license or usage terms." required><input id="license-url" className={INPUT_CLASS} type="url" inputMode="url" placeholder="https://" value={form.licenseUrl} onChange={(event) => updateForm('licenseUrl', event.target.value)} aria-describedby="license-url-hint" required /></Field>
                    <Field label="Attribution" htmlFor="case-attribution" required><input id="case-attribution" className={INPUT_CLASS} value={form.attribution} onChange={(event) => updateForm('attribution', event.target.value)} required /></Field>
                  </div>
                </section>

                <fieldset className="case-studio-review-card">
                  <legend>Rights to use and export</legend>
                  <label className="case-studio-confirmation">
                    <input
                      type="checkbox"
                      checked={rightsUseConfirmed}
                      onChange={(event) => {
                        setRightsUseConfirmed(event.target.checked);
                        setSavedCase(null);
                        setImportedPackageMetadata(false);
                        setErrors([]);
                      }}
                    />
                    <span>
                      <strong>I verified that the recorded terms or separate authorization permit this use.</strong>
                      <small>I am permitted to store, use, and export these images for this project. This records my review; CaseAttend does not grant permission.</small>
                    </span>
                  </label>
                </fieldset>

                <section aria-labelledby="privacy-screening-heading">
                  <div className="case-studio-subsection-heading">
                    <div><h3 id="privacy-screening-heading">Browser-local privacy screening</h3><p>Possible text and face warnings are shown without saving recognized text.</p></div>
                    <button type="button" className="case-studio-button secondary" onClick={() => void runPrivacyScan()} disabled={busy || assets.length === 0}><ScanSearch aria-hidden="true" /> {privacyResults.length ? 'Run again' : 'Run screening'}</button>
                  </div>
                  {privacyResults.length > 0 && (
                    <ol className="case-studio-scan-list">
                      {assets.map((asset, index) => {
                        const result = scanByDigest.get(asset.sha256);
                        if (!result) return null;
                        const hasConcern = result.textStatus !== 'no-warning-detected'
                          || result.faceStatus !== 'no-warning-detected'
                          || result.warnings.length > 0;
                        return (
                          <li key={asset.id} className={hasConcern ? 'warning' : ''}>
                            {hasConcern ? <AlertCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
                            <div>
                              <strong>Frame {index + 1}</strong>
                              <span>Text screening: {result.textStatus.replaceAll('-', ' ')}</span>
                              <span>Face screening: {result.faceStatus.replaceAll('-', ' ')}</span>
                              {result.warnings.map((warning) => <small key={warning}>{warning}</small>)}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>

                <fieldset className="case-studio-review-card">
                  <legend>Human review and attestation</legend>
                  <div className="case-studio-radio-grid">
                    <label><input type="radio" name="deidentification" checked={form.deidentificationMode === 'synthetic'} onChange={() => { setForm((current) => ({ ...current, deidentificationMode: 'synthetic', reviewedBy: '' })); setHumanReviewConfirmed(false); setSavedCase(null); setImportedPackageMetadata(false); setErrors([]); }} /><span><strong>Synthetic case</strong><small>The images and vignette do not represent an identifiable real person.</small></span></label>
                    <label><input type="radio" name="deidentification" checked={form.deidentificationMode === 'attested'} onChange={() => updateForm('deidentificationMode', 'attested')} /><span><strong>De-identification attested</strong><small>A qualified person reviewed the source under the applicable institutional workflow.</small></span></label>
                  </div>
                  {form.deidentificationMode === 'attested' && (
                    <Field label="Attester name" htmlFor="privacy-reviewer" hint="Recorded only for a de-identification attestation." required><input id="privacy-reviewer" className={INPUT_CLASS} value={form.reviewedBy} onChange={(event) => updateForm('reviewedBy', event.target.value)} aria-describedby="privacy-reviewer-hint" required /></Field>
                  )}
                  <label className="case-studio-confirmation">
                    <input type="checkbox" checked={humanReviewConfirmed} onChange={(event) => { setHumanReviewConfirmed(event.target.checked); setSavedCase(null); setImportedPackageMetadata(false); setErrors([]); }} />
                    <span>
                      <strong>I reviewed every image and all authored text.</strong>
                      <small>I found no direct identifiers, or I resolved every warning under an appropriate institutional workflow. I understand that this confirmation is not IRB approval or a legal determination of de-identification.</small>
                    </span>
                  </label>
                </fieldset>
              </div>
            )}

            {step === 3 && (
              <div className="case-studio-section-stack">
                {importedPackageMetadata && (
                  <div className="case-studio-warning-card" role="note">
                    <ShieldCheck aria-hidden="true" />
                    <div>
                      <h3>Imported package metadata</h3>
                      <p>
                        Rights and de-identification fields below came from the validated archive. They are not an automated privacy determination, and this browser has not re-run screening. Review the package and your institutional requirements before use.
                      </p>
                    </div>
                  </div>
                )}
                <div className="case-studio-review-hero">
                  <div className="case-studio-review-icon"><Eye aria-hidden="true" /></div>
                  <div>
                    <p className="case-studio-eyebrow">Local viewer preview</p>
                    <h3>{savedCase ? 'Saved case ready to use' : 'Review the exact frame order and neutral copy'}</h3>
                    <p>No model is contacted while this preview is open.</p>
                  </div>
                  {savedCase && <span><Check aria-hidden="true" /> Saved</span>}
                </div>

                <section className="case-studio-viewer-preview" aria-labelledby="studio-preview-heading">
                  <div className="case-studio-preview-stage">
                    {visiblePreview?.previewUrl
                      ? <img src={visiblePreview.previewUrl} alt={assets.length === 1 ? form.accessibleDescription : `${form.accessibleDescription}, frame ${previewIndex + 1} of ${assets.length}.`} />
                      : <div className="case-studio-preview-placeholder"><FileImage aria-hidden="true" /><span>Local image preview unavailable</span></div>}
                  </div>
                  <div className="case-studio-preview-controls">
                    <button type="button" aria-label="Previous frame" disabled={previewIndex === 0} onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}><ChevronLeft aria-hidden="true" /></button>
                    <div><h3 id="studio-preview-heading">{form.title || 'Untitled case'}</h3><p>{form.neutralDescription || 'Add a neutral description.'}</p><span>Frame {Math.min(previewIndex + 1, assets.length)} of {assets.length}</span></div>
                    <button type="button" aria-label="Next frame" disabled={previewIndex >= assets.length - 1} onClick={() => setPreviewIndex((index) => Math.min(assets.length - 1, index + 1))}><ChevronRight aria-hidden="true" /></button>
                  </div>
                </section>

                <dl className="case-studio-summary-grid">
                  <div><dt>Case ID</dt><dd>{form.id}</dd></div>
                  <div><dt>Domain</dt><dd>{form.domain}</dd></div>
                  <div><dt>Frames</dt><dd>{assets.length}</dd></div>
                  <div>
                    <dt>Privacy state</dt>
                    <dd>
                      {importedPackageMetadata
                        ? savedCase?.deidentification.status === 'not-reviewed'
                          ? 'Not reviewed (imported package metadata)'
                          : savedCase?.deidentification.status === 'synthetic'
                            ? 'Synthetic (imported package metadata)'
                            : 'De-identification attested (imported package metadata)'
                        : form.deidentificationMode === 'synthetic'
                          ? 'Synthetic, human reviewed'
                          : form.deidentificationMode === 'attested'
                            ? 'De-identification attested'
                            : 'Selection required'}
                    </dd>
                  </div>
                  <div><dt>License</dt><dd>{form.licenseName}</dd></div>
                  <div>
                    <dt>Clinical review</dt>
                    <dd>
                      {savedCase?.provenance.clinicianReview.reviewed
                        ? 'Clinician reviewed'
                        : 'Not clinician reviewed'}
                      {importedPackageMetadata ? ' (imported package metadata)' : ''}
                    </dd>
                  </div>
                  {savedCase && <div className="wide"><dt>Case SHA-256</dt><dd>{savedCase.manifest.sha256}</dd></div>}
                </dl>

                {!savedCase ? (
                  <div className="case-studio-save-card">
                    <div>
                      <Save aria-hidden="true" />
                      <div>
                        <h3>Save in this browser</h3>
                        <p>
                          {revisionBase?.id === form.id.trim()
                            ? 'This replaces only the exact case revision you opened. A custom or reviewed linked lesson is never reset here; use Lesson Builder or choose a new case ID.'
                            : 'This creates an exact Case Package and unreviewed starter Lesson Plan. You can refine the lesson next.'}
                        </p>
                      </div>
                    </div>
                    <button type="button" className="case-studio-button primary" disabled={busy} onClick={() => void save()}><Save aria-hidden="true" /> Save case</button>
                  </div>
                ) : (
                  <div className="case-studio-complete-actions">
                    <button type="button" className="case-studio-button primary" onClick={() => onOpenLessonBuilder(savedCase.id)}><GraduationCap aria-hidden="true" /> Build the lesson</button>
                    <button type="button" className="case-studio-button secondary" onClick={() => onPreview(savedCase)}><Eye aria-hidden="true" /> Open in viewer</button>
                    <button type="button" className="case-studio-button secondary" disabled={busy} onClick={() => void doExport()}><Download aria-hidden="true" /> Export portable case</button>
                  </div>
                )}
              </div>
            )}

            </fieldset>

            <p className="case-studio-status" role="status" aria-live="polite">
              {busyLabel
                ? `${busyLabel}${progress ? `: ${progress.completed} of ${progress.total}` : ''}`
                : statusMessage}
            </p>

            <div className="case-studio-actions">
              <button type="button" className="case-studio-button secondary" disabled={step === 0 || busy} onClick={() => goToStep(step - 1)}><ChevronLeft aria-hidden="true" /> Back</button>
              {step < CASE_STUDIO_STEPS.length - 1 ? (
                <button type="button" className="case-studio-button primary" disabled={busy} onClick={() => goToStep(step + 1)}>
                  Next: {CASE_STUDIO_STEPS[step + 1].short.toLocaleLowerCase('en-US')} <ChevronRight aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="case-studio-button secondary" disabled={busy} onClick={requestExit}>Done</button>
              )}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
};

export default CaseStudio;
