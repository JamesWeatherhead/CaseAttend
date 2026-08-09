import type { DomainKey } from '../lib/domains/types';
import type { LessonPlanRef } from './lessonPlan';

export const CASE_PACKAGE_VERSION = '1.0' as const;

export type CaseDifficulty = 'introductory' | 'intermediate' | 'advanced';

interface CaseImageSource {
  src: string;
  mimeType: string;
  /** Lowercase SHA-256 digest of the source bytes. */
  sha256: string;
  /** Neutral text that describes the image without revealing the answer. */
  alt: string;
  width?: number;
  height?: number;
}

export interface CaseImageArtifact extends CaseImageSource {
  kind: 'image';
  modality: string;
  seriesId: string;
  seriesLabel: string;
}

export interface CaseImageFrame extends CaseImageSource {
  id: string;
}

export interface CaseImageSeries {
  id: string;
  label: string;
  modality: string;
  frames: readonly CaseImageFrame[];
}

export interface CaseImageStackArtifact {
  kind: 'image-stack';
  series: readonly CaseImageSeries[];
}

export type CaseArtifact = CaseImageArtifact | CaseImageStackArtifact;

export interface CasePreview extends CaseImageSource {}

export interface CaseArtifactHints {
  showWindowLevel: boolean;
  showSeriesSelector: boolean;
  showSegmentation: boolean;
}

export interface CaseLicense {
  name: string;
  spdxId?: string;
  url?: string;
}

export type ClinicianReview =
  | { reviewed: false }
  | {
      reviewed: true;
      reviewer: string;
      credentials: string;
      reviewedAt: string;
    };

export interface CaseProvenance {
  sourceName: string;
  sourceUrl?: string;
  /** Item-level page or record that explicitly supports the declared license. */
  licenseEvidenceUrl?: string;
  license: CaseLicense;
  attribution: string;
  clinicianReview: ClinicianReview;
}

export type DeidentificationAttestation =
  | { status: 'not-reviewed'; notes?: string }
  | { status: 'synthetic'; notes?: string }
  | {
      status: 'attested';
      attestedBy: string;
      attestedAt: string;
      notes?: string;
    };

/** Display-only metadata. It must never contain real patient identifiers. */
export interface CasePresentationMetadata {
  subtitle: string;
  category: string;
  accentColor: string;
  accentGlow: string;
  accentBorder: string;
  textClass: string;
}

export interface CasePackageV1Draft {
  schemaVersion: typeof CASE_PACKAGE_VERSION;
  id: string;
  title: string;
  vignette: string;
  domain: DomainKey;
  difficulty: CaseDifficulty;
  artifact: CaseArtifact;
  preview: CasePreview;
  artifactHints: CaseArtifactHints;
  provenance: CaseProvenance;
  deidentification: DeidentificationAttestation;
  contentWarnings: readonly string[];
  neutralDescription: string;
  teachingNotes: readonly string[];
  lessonPlanRef: LessonPlanRef;
  presentation: CasePresentationMetadata;
}

export interface CaseManifest {
  algorithm: 'SHA-256';
  sha256: string;
}

export interface CasePackageV1 extends CasePackageV1Draft {
  manifest: CaseManifest;
}

export interface CasePackageValidationResult {
  valid: boolean;
  errors: string[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOMAIN_KEYS = new Set<DomainKey>([
  'radiology',
  'pathology',
  'dermatology',
  'ecg',
  'ultrasound',
  'ophthalmology',
]);
const DIFFICULTIES = new Set<CaseDifficulty>(['introductory', 'intermediate', 'advanced']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    errors.push(`${path} is required and must be an object.`);
    return null;
  }
  return value;
}

function requireString(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} is required and must be a non-empty string.`);
    return false;
  }
  return true;
}

function optionalString(value: unknown, path: string, errors: string[]): void {
  if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
    errors.push(`${path} must be a non-empty string when provided.`);
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${path}.${key} is not valid in Case Package v1.`);
    }
  }
}

function validateKebabId(value: unknown, path: string, errors: string[]): void {
  if (requireString(value, path, errors) && !KEBAB_ID_PATTERN.test(value)) {
    errors.push(`${path} must use lowercase kebab-case characters.`);
  }
}

function validateHttpsUrl(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (!requireString(value, path, errors)) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) {
      errors.push(`${path} must be an HTTPS URL without embedded credentials.`);
    }
  } catch {
    errors.push(`${path} must be a valid HTTPS URL.`);
  }
}

function validateIsoDate(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be an ISO 8601 UTC timestamp.`);
  }
}

function requireBoolean(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'boolean') {
    errors.push(`${path} is required and must be true or false.`);
  }
}

function requireSha256(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    errors.push(`${path} must be a lowercase 64-character SHA-256 digest.`);
  }
}

function validateDimensions(value: Record<string, unknown>, path: string, errors: string[]): void {
  for (const key of ['width', 'height'] as const) {
    const dimension = value[key];
    if (dimension !== undefined && (!Number.isInteger(dimension) || (dimension as number) <= 0)) {
      errors.push(`${path}.${key} must be a positive integer when provided.`);
    }
  }
}

function validateImageSource(value: Record<string, unknown>, path: string, errors: string[]): void {
  if (requireString(value.src, `${path}.src`, errors)) {
    const isSafeLocalPath = value.src.startsWith('/images/')
      && !value.src.includes('..')
      && !value.src.includes('\\')
      && !value.src.includes('?')
      && !value.src.includes('#');
    const isPortableAssetPath = value.src.startsWith('case://assets/')
      && !value.src.includes('..')
      && !value.src.includes('\\');
    let isSafeHttpsUrl = false;
    try {
      const url = new URL(value.src);
      isSafeHttpsUrl = url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      // Local and portable package paths are checked above.
    }
    if (!isSafeLocalPath && !isPortableAssetPath && !isSafeHttpsUrl) {
      errors.push(`${path}.src must be a safe /images/, case://assets/, or HTTPS image reference.`);
    }
  }
  if (requireString(value.mimeType, `${path}.mimeType`, errors) && !IMAGE_MIME_TYPES.has(value.mimeType)) {
    errors.push(`${path}.mimeType must be image/jpeg, image/png, or image/webp.`);
  }
  requireSha256(value.sha256, `${path}.sha256`, errors);
  requireString(value.alt, `${path}.alt`, errors);
  validateDimensions(value, path, errors);
}

function validateArtifact(value: unknown, errors: string[]): void {
  const artifact = requireRecord(value, 'artifact', errors);
  if (!artifact) return;

  if (artifact.kind === 'image') {
    rejectUnknownKeys(
      artifact,
      ['kind', 'modality', 'seriesId', 'seriesLabel', 'src', 'mimeType', 'sha256', 'alt', 'width', 'height'],
      'artifact',
      errors,
    );
    requireString(artifact.modality, 'artifact.modality', errors);
    validateKebabId(artifact.seriesId, 'artifact.seriesId', errors);
    requireString(artifact.seriesLabel, 'artifact.seriesLabel', errors);
    validateImageSource(artifact, 'artifact', errors);
    return;
  }

  if (artifact.kind === 'image-stack') {
    rejectUnknownKeys(artifact, ['kind', 'series'], 'artifact', errors);
    if (!Array.isArray(artifact.series) || artifact.series.length === 0) {
      errors.push('artifact.series must contain at least one image series.');
      return;
    }

    const seriesIds = new Set<string>();
    artifact.series.forEach((entry, seriesIndex) => {
      const path = `artifact.series[${seriesIndex}]`;
      const series = requireRecord(entry, path, errors);
      if (!series) return;
      rejectUnknownKeys(series, ['id', 'label', 'modality', 'frames'], path, errors);
      if (typeof series.id === 'string' && series.id.trim() !== '') {
        validateKebabId(series.id, `${path}.id`, errors);
        if (seriesIds.has(series.id)) errors.push(`${path}.id must be unique within artifact.series.`);
        seriesIds.add(series.id);
      } else {
        requireString(series.id, `${path}.id`, errors);
      }
      requireString(series.label, `${path}.label`, errors);
      requireString(series.modality, `${path}.modality`, errors);
      if (!Array.isArray(series.frames) || series.frames.length === 0) {
        errors.push(`${path}.frames must contain at least one image frame.`);
        return;
      }

      const frameIds = new Set<string>();
      series.frames.forEach((entryFrame, frameIndex) => {
        const framePath = `${path}.frames[${frameIndex}]`;
        const frame = requireRecord(entryFrame, framePath, errors);
        if (!frame) return;
        rejectUnknownKeys(frame, ['id', 'src', 'mimeType', 'sha256', 'alt', 'width', 'height'], framePath, errors);
        if (typeof frame.id === 'string' && frame.id.trim() !== '') {
          validateKebabId(frame.id, `${framePath}.id`, errors);
          if (frameIds.has(frame.id)) errors.push(`${framePath}.id must be unique within its series.`);
          frameIds.add(frame.id);
        } else {
          requireString(frame.id, `${framePath}.id`, errors);
        }
        validateImageSource(frame, framePath, errors);
      });
    });
    const totalFrames = artifact.series.reduce((total, entry) => {
      return total + (isRecord(entry) && Array.isArray(entry.frames) ? entry.frames.length : 0);
    }, 0);
    if (totalFrames < 2) {
      errors.push("artifact.kind must be 'image' when the package contains exactly one frame.");
    }
    return;
  }

  errors.push("artifact.kind must be either 'image' or 'image-stack'.");
}

function validatePreview(value: unknown, errors: string[]): void {
  const preview = requireRecord(value, 'preview', errors);
  if (preview) {
    rejectUnknownKeys(preview, ['src', 'mimeType', 'sha256', 'alt', 'width', 'height'], 'preview', errors);
    validateImageSource(preview, 'preview', errors);
  }
}

function validateArtifactHints(value: unknown, errors: string[]): void {
  const hints = requireRecord(value, 'artifactHints', errors);
  if (!hints) return;
  rejectUnknownKeys(
    hints,
    ['showWindowLevel', 'showSeriesSelector', 'showSegmentation'],
    'artifactHints',
    errors,
  );
  requireBoolean(hints.showWindowLevel, 'artifactHints.showWindowLevel', errors);
  requireBoolean(hints.showSeriesSelector, 'artifactHints.showSeriesSelector', errors);
  requireBoolean(hints.showSegmentation, 'artifactHints.showSegmentation', errors);
}

function validateProvenance(value: unknown, errors: string[]): void {
  const provenance = requireRecord(value, 'provenance', errors);
  if (!provenance) return;
  rejectUnknownKeys(
    provenance,
    [
      'sourceName',
      'sourceUrl',
      'licenseEvidenceUrl',
      'license',
      'attribution',
      'clinicianReview',
    ],
    'provenance',
    errors,
  );
  requireString(provenance.sourceName, 'provenance.sourceName', errors);
  validateHttpsUrl(provenance.sourceUrl, 'provenance.sourceUrl', errors);
  validateHttpsUrl(provenance.licenseEvidenceUrl, 'provenance.licenseEvidenceUrl', errors);
  requireString(provenance.attribution, 'provenance.attribution', errors);

  const license = requireRecord(provenance.license, 'provenance.license', errors);
  if (license) {
    rejectUnknownKeys(license, ['name', 'spdxId', 'url'], 'provenance.license', errors);
    requireString(license.name, 'provenance.license.name', errors);
    optionalString(license.spdxId, 'provenance.license.spdxId', errors);
    validateHttpsUrl(license.url, 'provenance.license.url', errors);
  }

  const review = requireRecord(provenance.clinicianReview, 'provenance.clinicianReview', errors);
  if (!review) return;
  rejectUnknownKeys(
    review,
    review.reviewed === true
      ? ['reviewed', 'reviewer', 'credentials', 'reviewedAt']
      : ['reviewed'],
    'provenance.clinicianReview',
    errors,
  );
  if (typeof review.reviewed !== 'boolean') {
    errors.push('provenance.clinicianReview.reviewed is required and must be true or false.');
  } else if (review.reviewed) {
    requireString(review.reviewer, 'provenance.clinicianReview.reviewer', errors);
    requireString(review.credentials, 'provenance.clinicianReview.credentials', errors);
    validateIsoDate(review.reviewedAt, 'provenance.clinicianReview.reviewedAt', errors);
  }
}

function validateDeidentification(value: unknown, errors: string[]): void {
  const attestation = requireRecord(value, 'deidentification', errors);
  if (!attestation) return;
  rejectUnknownKeys(
    attestation,
    attestation.status === 'attested'
      ? ['status', 'attestedBy', 'attestedAt', 'notes']
      : ['status', 'notes'],
    'deidentification',
    errors,
  );
  optionalString(attestation.notes, 'deidentification.notes', errors);
  if (!['attested', 'synthetic', 'not-reviewed'].includes(String(attestation.status))) {
    errors.push("deidentification.status must be 'attested', 'synthetic', or 'not-reviewed'.");
    return;
  }
  if (attestation.status === 'attested') {
    requireString(attestation.attestedBy, 'deidentification.attestedBy', errors);
    validateIsoDate(attestation.attestedAt, 'deidentification.attestedAt', errors);
  }
}

function validateStringList(
  value: unknown,
  path: string,
  errors: string[],
  options: { allowEmpty: boolean },
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} is required and must be an array of strings.`);
    return;
  }
  if (!options.allowEmpty && value.length === 0) {
    errors.push(`${path} must contain at least one entry.`);
  }
  value.forEach((entry, index) => requireString(entry, `${path}[${index}]`, errors));
}

function validatePresentation(value: unknown, errors: string[]): void {
  const presentation = requireRecord(value, 'presentation', errors);
  if (!presentation) return;
  rejectUnknownKeys(
    presentation,
    ['subtitle', 'category', 'accentColor', 'accentGlow', 'accentBorder', 'textClass'],
    'presentation',
    errors,
  );
  for (const key of [
    'subtitle',
    'category',
    'accentColor',
    'accentGlow',
    'accentBorder',
    'textClass',
  ] as const) {
    requireString(presentation[key], `presentation.${key}`, errors);
  }
}

function validateDraft(
  value: unknown,
  options: { allowManifest?: boolean } = {},
): CasePackageValidationResult {
  const errors: string[] = [];
  const draft = requireRecord(value, 'casePackage', errors);
  if (!draft) return { valid: false, errors };

  rejectUnknownKeys(
    draft,
    [
      'schemaVersion',
      'id',
      'title',
      'vignette',
      'domain',
      'difficulty',
      'artifact',
      'preview',
      'artifactHints',
      'provenance',
      'deidentification',
      'contentWarnings',
      'neutralDescription',
      'teachingNotes',
      'lessonPlanRef',
      'presentation',
      ...(options.allowManifest ? ['manifest'] : []),
    ],
    'casePackage',
    errors,
  );

  if (draft.schemaVersion !== CASE_PACKAGE_VERSION) {
    errors.push(`schemaVersion must be '${CASE_PACKAGE_VERSION}'.`);
  }
  validateKebabId(draft.id, 'id', errors);
  requireString(draft.title, 'title', errors);
  requireString(draft.vignette, 'vignette', errors);
  if (typeof draft.domain !== 'string' || !DOMAIN_KEYS.has(draft.domain as DomainKey)) {
    errors.push(
      "domain must be 'radiology', 'pathology', 'dermatology', 'ecg', 'ultrasound', or 'ophthalmology'.",
    );
  }
  if (typeof draft.difficulty !== 'string' || !DIFFICULTIES.has(draft.difficulty as CaseDifficulty)) {
    errors.push("difficulty must be 'introductory', 'intermediate', or 'advanced'.");
  }
  validateArtifact(draft.artifact, errors);
  validatePreview(draft.preview, errors);
  if (isRecord(draft.preview) && typeof draft.preview.src === 'string' && isRecord(draft.artifact)) {
    const artifactPaths = draft.artifact.kind === 'image' && typeof draft.artifact.src === 'string'
      ? [draft.artifact.src]
      : draft.artifact.kind === 'image-stack' && Array.isArray(draft.artifact.series)
        ? draft.artifact.series.flatMap((entry) => {
            return isRecord(entry) && Array.isArray(entry.frames)
              ? entry.frames.flatMap((frame) => isRecord(frame) && typeof frame.src === 'string' ? [frame.src] : [])
              : [];
          })
        : [];
    if (!artifactPaths.includes(draft.preview.src)) {
      errors.push('preview.src must reference an image included in artifact.');
    }
  }
  validateArtifactHints(draft.artifactHints, errors);
  validateProvenance(draft.provenance, errors);
  validateDeidentification(draft.deidentification, errors);
  validateStringList(draft.contentWarnings, 'contentWarnings', errors, { allowEmpty: true });
  requireString(draft.neutralDescription, 'neutralDescription', errors);
  validateStringList(draft.teachingNotes, 'teachingNotes', errors, { allowEmpty: false });
  const lessonPlanRef = requireRecord(draft.lessonPlanRef, 'lessonPlanRef', errors);
  if (lessonPlanRef) {
    rejectUnknownKeys(lessonPlanRef, ['id', 'version', 'sha256'], 'lessonPlanRef', errors);
    validateKebabId(lessonPlanRef.id, 'lessonPlanRef.id', errors);
    if (
      requireString(lessonPlanRef.version, 'lessonPlanRef.version', errors)
      && !SEMVER_PATTERN.test(lessonPlanRef.version)
    ) {
      errors.push('lessonPlanRef.version must be a semantic content version such as 1.0.0.');
    }
    requireSha256(lessonPlanRef.sha256, 'lessonPlanRef.sha256', errors);
  }
  validatePresentation(draft.presentation, errors);

  return { valid: errors.length === 0, errors };
}

export function validateCasePackageDraftV1(value: unknown): CasePackageValidationResult {
  return validateDraft(value);
}

export function validateCasePackageV1(value: unknown): CasePackageValidationResult {
  const result = validateDraft(value, { allowManifest: true });
  if (!isRecord(value)) return result;

  const manifest = requireRecord(value.manifest, 'manifest', result.errors);
  if (manifest) {
    rejectUnknownKeys(manifest, ['algorithm', 'sha256'], 'manifest', result.errors);
    if (manifest.algorithm !== 'SHA-256') {
      result.errors.push("manifest.algorithm must be 'SHA-256'.");
    }
    requireSha256(manifest.sha256, 'manifest.sha256', result.errors);
  }
  result.valid = result.errors.length === 0;
  return result;
}

function canonicalize(value: unknown, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers.`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalize(entry, `${path}[${index}]`)).join(',')}]`;
  }
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must contain only plain JSON objects.`);
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        if (value[key] === undefined) {
          throw new Error(`${path}.${key} cannot be undefined. Omit optional fields instead.`);
        }
        return `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`)}`;
      })
      .join(',')}}`;
  }
  throw new Error(`${path} contains a value that cannot be represented as JSON.`);
}

/** Canonical JSON with sorted object keys and preserved array order. */
export function canonicalizeJson(value: unknown): string {
  return canonicalize(value, 'value');
}

function manifestPayload(value: CasePackageV1Draft | CasePackageV1): CasePackageV1Draft {
  const { manifest: _manifest, ...draft } = value as CasePackageV1;
  return draft as CasePackageV1Draft;
}

function validationError(prefix: string, errors: readonly string[]): Error {
  return new Error(`${prefix}\n${errors.map((error) => `- ${error}`).join('\n')}`);
}

export async function computeCasePackageManifestHash(
  value: CasePackageV1Draft | CasePackageV1,
): Promise<string> {
  const draft = manifestPayload(value);
  const validation = validateDraft(draft);
  if (!validation.valid) throw validationError('Cannot hash an invalid Case Package v1:', validation.errors);
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Case Package hashing requires crypto.subtle.');
  }

  const bytes = new TextEncoder().encode(canonicalizeJson(draft));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function finalizeCasePackageV1(draft: CasePackageV1Draft): Promise<CasePackageV1> {
  const validation = validateDraft(draft);
  if (!validation.valid) throw validationError('Cannot finalize an invalid Case Package v1:', validation.errors);
  return {
    ...draft,
    manifest: {
      algorithm: 'SHA-256',
      sha256: await computeCasePackageManifestHash(draft),
    },
  };
}

export async function createCasePackageV1(
  input: Omit<CasePackageV1Draft, 'schemaVersion'>,
): Promise<CasePackageV1> {
  return finalizeCasePackageV1({ ...input, schemaVersion: CASE_PACKAGE_VERSION });
}

export async function verifyCasePackageManifestHash(value: CasePackageV1): Promise<boolean> {
  const validation = validateCasePackageV1(value);
  if (!validation.valid) return false;
  return (await computeCasePackageManifestHash(value)) === value.manifest.sha256;
}
