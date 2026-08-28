/**
 * Author-time intro-cache generation for cases created in Case Studio (issue #70).
 *
 * This is the browser-side sibling of `scripts/introCache/generate.mts`
 * (issue #68's batch backfill). Both call OpenRouter with the exact same
 * frozen system prompt (`src/core/introCacheSystemPrompt.ts`) and both stamp
 * `provenance.systemPromptSha256` from those bytes, so the runtime treats an
 * author-generated cache byte-identically to a backfilled one.
 *
 * Key architectural constraint: CaseAttend is browser-direct / BYOK. Generation
 * uses the AUTHOR'S OpenRouter key, in their browser, sent straight to
 * `openrouter.ai`. Nothing traverses a CaseAttend server. If the author has no
 * key, generation fails with a clear "connect OpenRouter" error rather than
 * silently downgrading.
 *
 * Fail-closed contract (matches the batch script):
 *  - Every one of the five learner levels must return >= 1 valid question.
 *  - Every cachedAnswer must end with the exact SAFETY_FOOTER.
 *  - Any deviation aborts generation and no draft is written.
 */

import { SAFETY_FOOTER } from '../../lib/prompts/shared';
import type { LearnerLevel } from '../constants';
import type { CasePackageV1 } from '../core/casePackage';
import {
  INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
  INTRO_CACHE_SCHEMA,
  INTRO_CACHE_SCHEMA_VERSION,
  computeMediaSha,
  computeSystemPromptSha256,
  validateIntroCacheV1,
  type IntroCacheProvenanceV1,
  type IntroCacheV1,
} from '../core/introCache';
import { INTRO_CACHE_SYSTEM_PROMPT } from '../core/introCacheSystemPrompt';
import { getLessonPlanRef, type LessonPlanV1 } from '../core/lessonPlan';
import type { PortableCaseAssetV1 } from '../core/portableCasePackage';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_MEDIA_PER_CASE = 4;
const REQUIRED_LEVELS: readonly LearnerLevel[] = [
  'highschool',
  'undergrad',
  'ms_preclinical',
  'ms_clinical',
  'resident',
];

/** Errors that surface to the author in Case Studio. Small, safe shape. */
export type IntroCacheAuthoringErrorCode =
  | 'missing_key'
  | 'missing_lesson_plan'
  | 'missing_assets'
  | 'aborted'
  | 'network_error'
  | 'unauthorized'
  | 'payment_required'
  | 'forbidden'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_error'
  | 'invalid_response'
  | 'model_output_invalid';

export class IntroCacheAuthoringError extends Error {
  readonly code: IntroCacheAuthoringErrorCode;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(opts: {
    code: IntroCacheAuthoringErrorCode;
    message: string;
    retryable: boolean;
    httpStatus?: number;
  }) {
    super(opts.message);
    this.name = 'IntroCacheAuthoringError';
    this.code = opts.code;
    this.retryable = opts.retryable;
    if (opts.httpStatus !== undefined) this.httpStatus = opts.httpStatus;
  }
}

/**
 * Model-agnostic payload shape returned by the frontier model. Same body the
 * batch generator asks for. Validated field-by-field before we build the
 * IntroCacheV1 artifact.
 */
interface ModelLevelPayload {
  introPrompt?: unknown;
  introQuestions?: unknown;
}
interface ModelPayload {
  levels?: Record<string, ModelLevelPayload | undefined>;
}

export interface IntroCacheGenerationInput {
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
  /** Assets bound to the case, with their raw bytes as base64 for image encoding. */
  assets: readonly PortableCaseAssetV1[];
  /** BYOK OpenRouter key, from `byokStore.getKey()`. Never persisted here. */
  apiKey: string;
  /** OpenRouter model id, from `byokStore.getModel()`. */
  modelId: string;
  signal?: AbortSignal;
  /** Test seam. Production uses `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Test seam. Production uses `new Date().toISOString()`. */
  now?: () => Date;
}

/**
 * Deterministic sampler for a case's assets. Same shape as the batch script so
 * the mediaSha stamp does not depend on which pipeline ran.
 */
export function sampleAssetsForGeneration<T>(assets: readonly T[]): T[] {
  if (assets.length <= MAX_MEDIA_PER_CASE) return [...assets];
  const step = Math.floor(assets.length / MAX_MEDIA_PER_CASE) || 1;
  const sampled: T[] = [];
  for (let i = 0; i < assets.length && sampled.length < MAX_MEDIA_PER_CASE; i += step) {
    sampled.push(assets[i]);
  }
  return sampled;
}

function assertFooter(answer: string, path: string): void {
  const footer = SAFETY_FOOTER.trim();
  if (!answer.trimEnd().endsWith(footer)) {
    throw new IntroCacheAuthoringError({
      code: 'model_output_invalid',
      message: `${path}.cachedAnswer must end with the required safety footer.`,
      retryable: true,
    });
  }
}

function payloadToLevels(payload: ModelPayload): IntroCacheV1['levels'] {
  if (!payload || typeof payload !== 'object' || !payload.levels || typeof payload.levels !== 'object') {
    throw new IntroCacheAuthoringError({
      code: 'model_output_invalid',
      message: 'Model response did not include a top-level "levels" object.',
      retryable: true,
    });
  }
  const levels: Record<string, IntroCacheV1['levels'][keyof IntroCacheV1['levels']]> = {};
  for (const level of REQUIRED_LEVELS) {
    const entry = payload.levels[level];
    if (!entry || typeof entry !== 'object') {
      throw new IntroCacheAuthoringError({
        code: 'model_output_invalid',
        message: `Model response is missing the '${level}' learner level.`,
        retryable: true,
      });
    }
    if (typeof entry.introPrompt !== 'string' || entry.introPrompt.trim() === '') {
      throw new IntroCacheAuthoringError({
        code: 'model_output_invalid',
        message: `Level '${level}' has no introPrompt.`,
        retryable: true,
      });
    }
    if (!Array.isArray(entry.introQuestions) || entry.introQuestions.length === 0) {
      throw new IntroCacheAuthoringError({
        code: 'model_output_invalid',
        message: `Level '${level}' has zero introQuestions. At least one is required.`,
        retryable: true,
      });
    }
    const seen = new Set<string>();
    const introQuestions = entry.introQuestions.map((raw, index) => {
      const path = `levels.${level}.introQuestions[${index}]`;
      if (!raw || typeof raw !== 'object') {
        throw new IntroCacheAuthoringError({
          code: 'model_output_invalid',
          message: `${path} must be an object.`,
          retryable: true,
        });
      }
      const q = raw as Record<string, unknown>;
      const idRaw = q.id;
      const labelRaw = q.label;
      const promptRaw = q.prompt;
      const answerRaw = q.cachedAnswer;
      if (typeof idRaw !== 'string' || idRaw.trim() === '') {
        throw new IntroCacheAuthoringError({
          code: 'model_output_invalid', message: `${path}.id is missing.`, retryable: true,
        });
      }
      const id = idRaw.trim();
      if (seen.has(id)) {
        throw new IntroCacheAuthoringError({
          code: 'model_output_invalid',
          message: `${path}.id '${id}' duplicates another question in the same level.`,
          retryable: true,
        });
      }
      seen.add(id);
      if (typeof labelRaw !== 'string' || labelRaw.trim() === '') {
        throw new IntroCacheAuthoringError({
          code: 'model_output_invalid', message: `${path}.label is missing.`, retryable: true,
        });
      }
      if (typeof promptRaw !== 'string' || promptRaw.trim() === '') {
        throw new IntroCacheAuthoringError({
          code: 'model_output_invalid', message: `${path}.prompt is missing.`, retryable: true,
        });
      }
      if (typeof answerRaw !== 'string' || answerRaw.trim() === '') {
        throw new IntroCacheAuthoringError({
          code: 'model_output_invalid', message: `${path}.cachedAnswer is missing.`, retryable: true,
        });
      }
      const answer = answerRaw.trim();
      assertFooter(answer, path);
      return {
        id,
        label: labelRaw.trim(),
        prompt: promptRaw.trim(),
        cachedAnswer: answer,
      };
    });
    levels[level] = { introPrompt: entry.introPrompt.trim(), introQuestions };
  }
  return levels as IntroCacheV1['levels'];
}

function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fence) return fence[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

interface OpenRouterChoice {
  message?: { content?: string | Array<{ type?: string; text?: string }> };
}
interface OpenRouterBody {
  choices?: OpenRouterChoice[];
  error?: unknown;
}

async function callOpenRouter(
  input: IntroCacheGenerationInput,
  userContent: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  >,
): Promise<ModelPayload> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const body = {
    model: input.modelId,
    temperature: 0.2,
    max_tokens: 6000,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: INTRO_CACHE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  };
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://caseattend.com',
        'X-Title': 'CaseAttend intro-cache authoring',
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') {
      throw new IntroCacheAuthoringError({
        code: 'aborted', message: 'Generation cancelled.', retryable: true,
      });
    }
    throw new IntroCacheAuthoringError({
      code: 'network_error',
      message: 'Could not reach OpenRouter. Check your connection and try again.',
      retryable: true,
    });
  }
  if (!response.ok) {
    if (response.status === 401) throw new IntroCacheAuthoringError({ code: 'unauthorized', message: 'OpenRouter rejected the key (401). Reconnect your account.', retryable: false, httpStatus: 401 });
    if (response.status === 402) throw new IntroCacheAuthoringError({ code: 'payment_required', message: 'Out of OpenRouter credit (402). Switch to a Free model or add credit.', retryable: false, httpStatus: 402 });
    if (response.status === 403) throw new IntroCacheAuthoringError({ code: 'forbidden', message: 'This model is not available to your key (403).', retryable: false, httpStatus: 403 });
    if (response.status === 429) throw new IntroCacheAuthoringError({ code: 'rate_limited', message: 'OpenRouter is throttling requests (429). Try again in a moment.', retryable: true, httpStatus: 429 });
    if (response.status >= 500) throw new IntroCacheAuthoringError({ code: 'provider_unavailable', message: 'OpenRouter is temporarily unavailable. Try again.', retryable: true, httpStatus: response.status });
    throw new IntroCacheAuthoringError({ code: 'provider_error', message: `OpenRouter call failed (${response.status}).`, retryable: false, httpStatus: response.status });
  }
  let data: OpenRouterBody | null = null;
  try {
    data = (await response.json()) as OpenRouterBody;
  } catch {
    throw new IntroCacheAuthoringError({
      code: 'invalid_response', message: 'OpenRouter returned unreadable JSON.', retryable: true,
    });
  }
  if (!data || data.error) {
    throw new IntroCacheAuthoringError({
      code: 'provider_error', message: 'OpenRouter returned an error payload.', retryable: true,
    });
  }
  const raw = data.choices?.[0]?.message?.content;
  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('');
  }
  if (!text.trim()) {
    throw new IntroCacheAuthoringError({
      code: 'invalid_response', message: 'OpenRouter response had no message content.', retryable: true,
    });
  }
  let parsed: ModelPayload;
  try {
    parsed = JSON.parse(extractJsonBlock(text)) as ModelPayload;
  } catch (error) {
    throw new IntroCacheAuthoringError({
      code: 'model_output_invalid',
      message: `Model response was not valid JSON: ${(error as Error).message}`,
      retryable: true,
    });
  }
  return parsed;
}

function assetsForMediaSha(assets: readonly PortableCaseAssetV1[]): { src: string; sha256: string }[] {
  // Deterministic: sort by uri so re-orderings by the store don't shift the sha.
  return [...assets]
    .map((asset) => ({ src: asset.uri, sha256: asset.sha256 }))
    .sort((left, right) => (left.src < right.src ? -1 : left.src > right.src ? 1 : 0));
}

function buildUserContent(
  input: IntroCacheGenerationInput,
): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  const objectives = input.lessonPlan.objectives
    .map((o) => `- ${o.id}: ${o.description}`)
    .join('\n');
  const teachingNotes = input.lessonPlan.teachingNotes.map((note) => `- ${note}`).join('\n');
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: [
        `Case id: ${input.casePackage.id}`,
        `Case title: ${input.casePackage.title}`,
        `Case domain: ${input.casePackage.domain}`,
        `Vignette: ${input.casePackage.vignette}`,
        `Neutral description: ${input.casePackage.neutralDescription}`,
        '',
        'Learning objectives:',
        objectives,
        '',
        'Teaching notes:',
        teachingNotes,
        '',
        `Below are up to ${MAX_MEDIA_PER_CASE} representative image(s) sampled from the media attached to this case.`,
        'Base your intro prompts and pre-cached answers on what is actually visible plus the neutral description.',
      ].join('\n'),
    },
  ];
  const sampled = sampleAssetsForGeneration(input.assets);
  for (const asset of sampled) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${asset.mimeType};base64,${asset.bytesBase64}` },
    });
  }
  return parts;
}

/**
 * Author-time generation: reuse the exact same system prompt + payload shape as
 * the batch script, return a validated draft IntroCacheV1 the author can review.
 * Fails closed on every level guarantee — no partial artifact ever surfaces.
 */
export async function generateAuthoredIntroCache(
  input: IntroCacheGenerationInput,
): Promise<IntroCacheV1> {
  if (!input.apiKey.trim()) {
    throw new IntroCacheAuthoringError({
      code: 'missing_key',
      message: 'Connect an OpenRouter key to auto-generate the intro cache.',
      retryable: false,
    });
  }
  if (input.assets.length === 0) {
    throw new IntroCacheAuthoringError({
      code: 'missing_assets',
      message: 'This case has no images. Add at least one before generating the intro cache.',
      retryable: false,
    });
  }
  if (!input.lessonPlan || !input.lessonPlan.manifest?.sha256) {
    throw new IntroCacheAuthoringError({
      code: 'missing_lesson_plan',
      message: 'Save the case first so its lesson plan is finalized before generating the intro cache.',
      retryable: false,
    });
  }

  const mediaSha = await computeMediaSha({
    neutralDescription: input.casePackage.neutralDescription,
    assets: assetsForMediaSha(input.assets),
  });
  const systemPromptSha256 = await computeSystemPromptSha256(INTRO_CACHE_SYSTEM_PROMPT);
  const lessonPlanSha256 = getLessonPlanRef(input.lessonPlan).sha256;

  const userContent = buildUserContent(input);
  const payload = await callOpenRouter(input, userContent);
  const levels = payloadToLevels(payload);

  const now = input.now ?? (() => new Date());
  const provenance: IntroCacheProvenanceV1 = {
    modelId: input.modelId,
    systemPromptSha256,
    requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
    mediaSha,
    generatedAt: now().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  };
  const artifact: IntroCacheV1 = {
    schema: INTRO_CACHE_SCHEMA,
    schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
    caseId: input.casePackage.id,
    lessonPlanSha256,
    provenance,
    review: { status: 'draft' },
    levels,
  };
  const validation = validateIntroCacheV1(artifact);
  if (!validation.valid) {
    throw new IntroCacheAuthoringError({
      code: 'model_output_invalid',
      message: `Generated draft failed schema validation: ${validation.errors[0]}`,
      retryable: true,
    });
  }
  return artifact;
}

/**
 * Approve a draft artifact: stamp reviewer identity and switch the status to
 * `approved`. Returns a new object; the input is not mutated.
 *
 * Runtime loaders (`introCacheStore.ts`) fail closed on any status other than
 * `approved`, so calling this is the only way a browser-local intro cache
 * becomes visible to a no-key learner.
 */
export function approveIntroCache(
  draft: IntroCacheV1,
  reviewer: { name: string; credentials: string },
  now: () => Date = () => new Date(),
): IntroCacheV1 {
  const name = reviewer.name.trim();
  const credentials = reviewer.credentials.trim();
  if (!name || !credentials) {
    throw new Error('Approving an intro cache requires a reviewer name and credentials.');
  }
  const approved: IntroCacheV1 = {
    ...draft,
    review: {
      status: 'approved',
      reviewer: name,
      credentials,
      reviewedAt: now().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    },
  };
  const validation = validateIntroCacheV1(approved);
  if (!validation.valid) {
    throw new Error(
      `Approved intro cache failed schema validation:\n${validation.errors.map((e) => `- ${e}`).join('\n')}`,
    );
  }
  return approved;
}

/**
 * Compare a stored artifact's sha stamps against the current lesson plan +
 * media. Returns true when the artifact is bound to the current lesson revision.
 * Used to decide whether a saved case's intro cache is still authoritative or
 * needs to be regenerated after an edit.
 */
export async function isIntroCacheCurrent(
  cache: IntroCacheV1 | null,
  context: { lessonPlan: LessonPlanV1; assets: readonly PortableCaseAssetV1[]; neutralDescription: string },
): Promise<boolean> {
  if (!cache) return false;
  const lessonPlanSha256 = getLessonPlanRef(context.lessonPlan).sha256;
  if (cache.lessonPlanSha256 !== lessonPlanSha256) return false;
  const mediaSha = await computeMediaSha({
    neutralDescription: context.neutralDescription,
    assets: assetsForMediaSha(context.assets),
  });
  return cache.provenance.mediaSha === mediaSha;
}
