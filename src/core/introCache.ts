/**
 * Intro Cache v1 — the canonical shipped-artifact type for per-lesson,
 * per-learner-level intro prompts and pre-generated intro Q&A.
 *
 * A learner with no OpenRouter key cannot free-type, but every entry in
 * `introQuestions[level]` is clickable and renders its `cachedAnswer`
 * instantly (no network, no key). This module owns the type; the runtime
 * loader in src/services/introCacheStore.ts reads shipped JSON from
 * /intro-cache/<caseId>.json.
 *
 * Companion issue #70 imports these types verbatim; keep the shape
 * byte-compatible across the two branches. Do not add non-optional fields
 * without coordinating there.
 */

import type { LearnerLevel } from '../constants';
import { canonicalizeJson } from './casePackage';

export const INTRO_CACHE_SCHEMA = 'caseattend.intro-cache' as const;
export const INTRO_CACHE_SCHEMA_VERSION = '1.0' as const;
export const INTRO_CACHE_REQUEST_TEMPLATE_VERSION = '1.0' as const;

export const INTRO_CACHE_LEARNER_LEVELS = Object.freeze([
  'highschool',
  'undergrad',
  'ms_preclinical',
  'ms_clinical',
  'resident',
] as const);

export type IntroCacheLearnerLevel = typeof INTRO_CACHE_LEARNER_LEVELS[number];

export interface IntroCacheQuestionV1 {
  /** Stable kebab-case identifier for exact-match lookup. */
  id: string;
  /** Short chip label the learner sees on the suggestion button. */
  label: string;
  /** The exact question that would be sent if a live model were used. */
  prompt: string;
  /**
   * The pre-generated model answer, rendered instantly on click. Every answer
   * must end with the SAFETY_FOOTER from lib/prompts/shared.ts.
   */
  cachedAnswer: string;
}

export interface IntroCacheLevelV1 {
  /** The tailored opening the learner sees on entry for this level. */
  introPrompt: string;
  /** At least one pre-cached question with a cachedAnswer. */
  introQuestions: readonly IntroCacheQuestionV1[];
}

export interface IntroCacheProvenanceV1 {
  /** OpenRouter model id used to generate answers, e.g. "anthropic/claude-opus-4". */
  modelId: string;
  /** SHA-256 of the exact system prompt that produced the cached answers. */
  systemPromptSha256: string;
  /** Frozen template version so a later prompt change is detectable. */
  requestTemplateVersion: typeof INTRO_CACHE_REQUEST_TEMPLATE_VERSION;
  /** SHA-256 over the lesson's media digests + neutral description (see below). */
  mediaSha: string;
  /** ISO 8601 UTC timestamp when generation finished. */
  generatedAt: string;
}

export type IntroCacheReviewV1 =
  | { status: 'draft' }
  | {
      status: 'approved';
      reviewer: string;
      credentials: string;
      reviewedAt: string;
    };

export interface IntroCacheV1 {
  schema: typeof INTRO_CACHE_SCHEMA;
  schemaVersion: typeof INTRO_CACHE_SCHEMA_VERSION;
  /** Stable case id — the file is shipped at /intro-cache/<caseId>.json. */
  caseId: string;
  /** Lesson plan sha bound at generation time, so drift is detectable. */
  lessonPlanSha256: string;
  provenance: IntroCacheProvenanceV1;
  review: IntroCacheReviewV1;
  // v1 caches cover the original five audiences. New guided Step 2 curricula
  // do not acquire a cached answer merely by adding a learner level.
  levels: Readonly<Record<IntroCacheLearnerLevel, IntroCacheLevelV1> & Partial<Record<LearnerLevel, IntroCacheLevelV1>>>;
}

export interface IntroCacheValidationResult {
  valid: boolean;
  errors: string[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LEARNER_LEVELS = new Set<LearnerLevel>(INTRO_CACHE_LEARNER_LEVELS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string, errors: string[]): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} is required and must be a non-empty string.`);
    return false;
  }
  return true;
}

function requireKebabId(value: unknown, path: string, errors: string[]): value is string {
  if (!requireString(value, path, errors)) return false;
  if (!KEBAB_ID_PATTERN.test(value)) {
    errors.push(`${path} must use lowercase kebab-case characters.`);
    return false;
  }
  return true;
}

function requireSha256(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    errors.push(`${path} must be a lowercase 64-character SHA-256 digest.`);
  }
}

function requireIsoDate(value: unknown, path: string, errors: string[]): void {
  if (!requireString(value, path, errors)) return;
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be an ISO 8601 UTC timestamp.`);
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
      errors.push(`${path}.${key} is not valid in Intro Cache v1. Remove this field.`);
    }
  }
}

function validateQuestion(
  value: unknown,
  path: string,
  seenIds: Set<string>,
  errors: string[],
): void {
  const question = value;
  if (!isRecord(question)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  rejectUnknownKeys(question, ['id', 'label', 'prompt', 'cachedAnswer'], path, errors);
  if (requireKebabId(question.id, `${path}.id`, errors)) {
    if (seenIds.has(question.id)) {
      errors.push(`${path}.id duplicates another question id in the same level.`);
    }
    seenIds.add(question.id);
  }
  requireString(question.label, `${path}.label`, errors);
  requireString(question.prompt, `${path}.prompt`, errors);
  requireString(question.cachedAnswer, `${path}.cachedAnswer`, errors);
}

function validateLevel(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  rejectUnknownKeys(value, ['introPrompt', 'introQuestions'], path, errors);
  requireString(value.introPrompt, `${path}.introPrompt`, errors);
  if (!Array.isArray(value.introQuestions) || value.introQuestions.length === 0) {
    errors.push(`${path}.introQuestions must contain at least one pre-cached question.`);
    return;
  }
  const seen = new Set<string>();
  value.introQuestions.forEach((entry, index) => {
    validateQuestion(entry, `${path}.introQuestions[${index}]`, seen, errors);
  });
}

function validateProvenance(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('provenance is required and must be an object.');
    return;
  }
  rejectUnknownKeys(
    value,
    ['modelId', 'systemPromptSha256', 'requestTemplateVersion', 'mediaSha', 'generatedAt'],
    'provenance',
    errors,
  );
  requireString(value.modelId, 'provenance.modelId', errors);
  requireSha256(value.systemPromptSha256, 'provenance.systemPromptSha256', errors);
  if (value.requestTemplateVersion !== INTRO_CACHE_REQUEST_TEMPLATE_VERSION) {
    errors.push(`provenance.requestTemplateVersion must be '${INTRO_CACHE_REQUEST_TEMPLATE_VERSION}'.`);
  }
  requireSha256(value.mediaSha, 'provenance.mediaSha', errors);
  requireIsoDate(value.generatedAt, 'provenance.generatedAt', errors);
}

function validateReview(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('review is required and must be an object.');
    return;
  }
  if (value.status === 'draft') {
    rejectUnknownKeys(value, ['status'], 'review', errors);
    return;
  }
  if (value.status === 'approved') {
    rejectUnknownKeys(value, ['status', 'reviewer', 'credentials', 'reviewedAt'], 'review', errors);
    requireString(value.reviewer, 'review.reviewer', errors);
    requireString(value.credentials, 'review.credentials', errors);
    requireIsoDate(value.reviewedAt, 'review.reviewedAt', errors);
    return;
  }
  errors.push("review.status must be 'draft' or 'approved'.");
}

export function validateIntroCacheV1(value: unknown): IntroCacheValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    errors.push('intro cache must be an object.');
    return { valid: false, errors };
  }
  rejectUnknownKeys(
    value,
    ['schema', 'schemaVersion', 'caseId', 'lessonPlanSha256', 'provenance', 'review', 'levels'],
    'intro cache',
    errors,
  );
  if (value.schema !== INTRO_CACHE_SCHEMA) {
    errors.push(`schema must be '${INTRO_CACHE_SCHEMA}'.`);
  }
  if (value.schemaVersion !== INTRO_CACHE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be '${INTRO_CACHE_SCHEMA_VERSION}'.`);
  }
  requireKebabId(value.caseId, 'caseId', errors);
  requireSha256(value.lessonPlanSha256, 'lessonPlanSha256', errors);
  validateProvenance(value.provenance, errors);
  validateReview(value.review, errors);

  if (!isRecord(value.levels)) {
    errors.push('levels is required and must be an object keyed by learner level.');
  } else {
    for (const key of Object.keys(value.levels)) {
      if (!LEARNER_LEVELS.has(key as LearnerLevel)) {
        errors.push(`levels.${key} is not a supported learner level.`);
      }
    }
    for (const level of INTRO_CACHE_LEARNER_LEVELS) {
      if (!Object.hasOwn(value.levels, level)) {
        errors.push(`levels.${level} is required.`);
        continue;
      }
      validateLevel(
        (value.levels as Record<string, unknown>)[level],
        `levels.${level}`,
        errors,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Small helper the runtime uses: is a given level guaranteed a cached question? */
export function introCacheHasLevel(cache: IntroCacheV1, level: LearnerLevel): boolean {
  return Object.hasOwn(cache.levels, level) && (cache.levels[level]?.introQuestions.length ?? 0) > 0;
}

/**
 * Deterministic media fingerprint: canonical JSON over the sorted list of
 * artifact paths and their SHA-256 digests. Bumping any bundled asset changes
 * this and forces the batch job to re-generate that lesson's cache.
 */
export interface MediaShaInput {
  /** Ordered list of asset paths under public/ (as they appear in the case). */
  assets: readonly { src: string; sha256: string }[];
  /** Neutral case description; included so text-only edits also bump the sha. */
  neutralDescription: string;
}

export async function computeMediaSha(input: MediaShaInput): Promise<string> {
  const sortedAssets = [...input.assets]
    .map((asset) => ({ src: asset.src, sha256: asset.sha256.toLowerCase() }))
    .sort((left, right) => (left.src < right.src ? -1 : left.src > right.src ? 1 : 0));
  const canonical = canonicalizeJson({
    schema: 'caseattend.intro-cache.media',
    version: '1.0',
    neutralDescription: input.neutralDescription,
    assets: sortedAssets,
  });
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Media SHA requires crypto.subtle.');
  }
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash of the exact system prompt used at generation time. The batch job stamps
 * this on every artifact so a later prompt tweak is a detectable drift.
 */
export async function computeSystemPromptSha256(systemPrompt: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. System prompt SHA requires crypto.subtle.');
  }
  const bytes = new TextEncoder().encode(systemPrompt);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
