/**
 * Browser-direct OpenRouter inference (BYOK).
 *
 * SECURITY MODEL: the visitor's OpenRouter key travels ONLY from this browser to
 * https://openrouter.ai. It never touches CaseAttend servers — there is no server
 * code path that reads it — so we are structurally incapable of logging, storing,
 * or leaking it, and can never run up someone's bill. The key is minted into the
 * browser by OpenRouter's OAuth PKCE flow (see openrouterAuth.ts) and lives only
 * in this browser's localStorage (see byokStore.ts).
 *
 * Versioned teaching prompts are composed locally from the exact Case Package
 * and Lesson Plan manifests. CaseAttend has no prompt API or inference backend.
 */

import type { LearnerLevel } from '../constants';
import {
  composeLessonPrompt,
  getLessonPlanRef,
  validateLessonPlanV1,
  verifyLessonPlanManifestHash,
  type LessonPlanV1,
} from '../core/lessonPlan';
import {
  validateCasePackageV1,
  verifyCasePackageManifestHash,
  type CasePackageV1,
} from '../core/casePackage';
import { requireCasePackage } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';
import type { DomainKey } from '../lib/domains';
import { getKey } from './byokStore';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ORChunk {
  text?: string;
  done?: boolean;
}

export type ORMode = 'chat' | 'deep_think' | 'search';

export const INFERENCE_ERROR_CODES = [
  'missing_key',
  'missing_case',
  'prompt_resolution_failed',
  'request_aborted',
  'timeout',
  'network_error',
  'unauthorized',
  'payment_required',
  'forbidden',
  'rate_limited',
  'provider_unavailable',
  'provider_error',
  'invalid_response',
  'empty_response',
  'protocol_deviation',
  'unexpected_error',
] as const;

export type InferenceErrorCode = (typeof INFERENCE_ERROR_CODES)[number];

export type InferenceProtocolDeviationCode =
  | 'case_mismatch'
  | 'lesson_mismatch'
  | 'model_mismatch'
  | 'provider_mismatch'
  | 'inference_parameter_mismatch'
  | 'storage_unavailable';

/**
 * A deliberately small error shape safe to display and export. It never keeps
 * the request, API key, provider response body, or the original thrown value.
 */
export class SafeInferenceError extends Error {
  readonly code: InferenceErrorCode;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly deviation?: {
    code: InferenceProtocolDeviationCode;
    expectedId?: string;
    observedId?: string;
  };

  constructor(opts: {
    code: InferenceErrorCode;
    message: string;
    retryable: boolean;
    httpStatus?: number;
    deviation?: SafeInferenceError['deviation'];
  }) {
    super(opts.message);
    this.name = 'SafeInferenceError';
    this.code = opts.code;
    this.retryable = opts.retryable;
    if (opts.httpStatus !== undefined) this.httpStatus = opts.httpStatus;
    if (opts.deviation) this.deviation = Object.freeze({ ...opts.deviation });
  }
}

export interface SafeInferenceUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type SafeFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'error'
  | 'other';

export interface OpenRouterResponseMetadata {
  provider: 'openrouter';
  model: string;
  resolvedModelId?: string;
  upstreamProviderId?: string;
  usage?: SafeInferenceUsage;
  finishReason?: SafeFinishReason;
  latencyMs: number;
}

export interface OpenRouterResponse {
  chunks: ORChunk[];
  metadata: OpenRouterResponseMetadata;
}

/**
 * Exact request controls for a frozen research condition. Ordinary teaching
 * calls intentionally omit this object and retain their current defaults.
 */
export interface LockedOpenRouterPolicy {
  model: string;
  upstreamProviderId: string;
  temperature: number;
  topP: number;
  seed?: number;
  maxTokens: number;
  allowFallbacks: false;
  requireParameters: true;
  zeroDataRetention: true;
  dataCollection: 'deny';
}

function assertLockedOpenRouterPolicy(policy: LockedOpenRouterPolicy): void {
  if (safeRequestedModel(policy.model) !== policy.model) {
    throw new SafeInferenceError({
      code: 'protocol_deviation',
      message: 'The frozen research model identifier is invalid. The study request was not sent.',
      retryable: false,
      deviation: { code: 'inference_parameter_mismatch' },
    });
  }
  if (safeUpstreamIdentifier(policy.upstreamProviderId) !== policy.upstreamProviderId) {
    throw new SafeInferenceError({
      code: 'protocol_deviation',
      message: 'The frozen research provider identifier is invalid. The study request was not sent.',
      retryable: false,
      deviation: { code: 'inference_parameter_mismatch' },
    });
  }
  if (!Number.isFinite(policy.temperature) || policy.temperature < 0 || policy.temperature > 2
    || !Number.isFinite(policy.topP) || policy.topP < 0 || policy.topP > 1
    || !Number.isSafeInteger(policy.maxTokens) || policy.maxTokens < 1 || policy.maxTokens > 32768
    || (policy.seed !== undefined && (!Number.isSafeInteger(policy.seed) || policy.seed < 0))) {
    throw new SafeInferenceError({
      code: 'protocol_deviation',
      message: 'The frozen research sampling policy is invalid. The study request was not sent.',
      retryable: false,
      deviation: { code: 'inference_parameter_mismatch' },
    });
  }
  if (policy.allowFallbacks !== false || policy.requireParameters !== true
    || policy.zeroDataRetention !== true || policy.dataCollection !== 'deny') {
    throw new SafeInferenceError({
      code: 'protocol_deviation',
      message: 'The frozen research routing policy is incomplete. The study request was not sent.',
      retryable: false,
      deviation: { code: 'inference_parameter_mismatch' },
    });
  }
}

function finiteTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function extractSafeUsage(value: unknown): SafeInferenceUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const usage: SafeInferenceUsage = {
    promptTokens: finiteTokenCount(raw.prompt_tokens),
    completionTokens: finiteTokenCount(raw.completion_tokens),
    totalTokens: finiteTokenCount(raw.total_tokens),
  };
  return Object.values(usage).some((count) => count !== undefined) ? usage : undefined;
}

function normalizeFinishReason(value: unknown): SafeFinishReason | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'stop' || value === 'length' || value === 'content_filter'
    || value === 'tool_calls' || value === 'error') {
    return value;
  }
  return 'other';
}

function safeRequestedModel(model: string): string {
  const trimmed = model.trim();
  return trimmed.length > 0
    && trimmed.length <= 200
    && !trimmed.includes('://')
    && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(trimmed)
    ? trimmed
    : 'unknown';
}

function safeUpstreamIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0
    && trimmed.length <= 200
    && !trimmed.includes('://')
    && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(trimmed)
    ? trimmed
    : undefined;
}

function nowMilliseconds(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Call OpenRouter directly with the visitor's key. Non-streaming request, then
 * split the reply into word chunks for a typing feel — mirrors the server
 * adapters so downstream structured-block parsing is identical.
 */
export async function getOpenRouterResponse(opts: {
  message: string;
  systemPrompt: string;
  imageBase64: string | null;
  mode: ORMode;
  model: string;
  lockedPolicy?: LockedOpenRouterPolicy;
  signal?: AbortSignal;
  /**
   * Silent per-turn lesson-pacing note. Sent as a second system-role message
   * so it does not alter the cached, sha256-verified base system prompt. Only
   * applied in public/BYOK mode; ignored under a locked research policy where
   * the frozen prompt hash must be preserved.
   */
  silentSystemNote?: string;
}): Promise<OpenRouterResponse> {
  const { message, systemPrompt, imageBase64, mode, lockedPolicy, signal } = opts;
  if (lockedPolicy) assertLockedOpenRouterPolicy(lockedPolicy);
  const model = lockedPolicy?.model ?? opts.model;
  const apiKey = getKey();
  if (!apiKey) {
    throw new SafeInferenceError({
      code: 'missing_key',
      message: 'Connect your OpenRouter account to start chatting. Your key is stored in this browser and sent only to OpenRouter.',
      retryable: false,
    });
  }
  const hasImage = !!imageBase64;

  const userContent: any = hasImage && imageBase64
    ? [
        { type: 'text', text: message },
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
          },
        },
      ]
    : message;

  const messages: any[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  const trimmedSilentNote = !lockedPolicy && typeof opts.silentSystemNote === 'string'
    ? opts.silentSystemNote.trim()
    : '';
  if (trimmedSilentNote) {
    messages.push({ role: 'system', content: trimmedSilentNote });
  }
  messages.push({ role: 'user', content: userContent });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: lockedPolicy?.maxTokens ?? (mode === 'deep_think' ? 8192 : 4096),
    stream: false,
  };
  if (lockedPolicy) {
    body.temperature = lockedPolicy.temperature;
    body.top_p = lockedPolicy.topP;
    if (lockedPolicy.seed !== undefined) body.seed = lockedPolicy.seed;
    body.provider = {
      only: [lockedPolicy.upstreamProviderId],
      order: [lockedPolicy.upstreamProviderId],
      allow_fallbacks: false,
      require_parameters: true,
      zdr: true,
      data_collection: 'deny',
    };
  }

  // Fail with a clean message instead of hanging on a slow model.
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 120000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (signal?.aborted) controller.abort();

  let res: Response;
  const requestStartedAt = nowMilliseconds();
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter attribution headers (custom, not the forbidden `Referer`).
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://caseattend.com',
        'X-Title': 'CaseAttend',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new SafeInferenceError({
          code: 'timeout',
          message: 'OpenRouter request timed out. Try again or pick a faster model.',
          retryable: true,
        });
      }
      throw new SafeInferenceError({
        code: 'request_aborted',
        message: 'AI request cancelled.',
        retryable: true,
      });
    }
    throw new SafeInferenceError({
      code: 'network_error',
      message: 'Could not reach OpenRouter. Check your connection and try again.',
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!res.ok) {
    // Do not read or retain the provider response body. Status alone selects a
    // curated message and safe code.
    if (res.status === 401) throw new SafeInferenceError({ code: 'unauthorized', message: 'OpenRouter rejected the key (401). Reconnect your OpenRouter account.', retryable: false, httpStatus: 401 });
    if (res.status === 402) throw new SafeInferenceError({ code: 'payment_required', message: 'Your OpenRouter account is out of credit (402). Switch to a Free model in Connect, or add credit at openrouter.ai.', retryable: false, httpStatus: 402 });
    if (res.status === 403) throw new SafeInferenceError({ code: 'forbidden', message: 'This model is not available to your key (403). Try a Free model in Connect.', retryable: false, httpStatus: 403 });
    if (res.status === 429) throw new SafeInferenceError({ code: 'rate_limited', message: 'High traffic (429). Please try again in a moment.', retryable: true, httpStatus: 429 });
    if (res.status >= 500) throw new SafeInferenceError({ code: 'provider_unavailable', message: 'AI service temporarily unavailable. Please try again.', retryable: true, httpStatus: res.status });
    throw new SafeInferenceError({ code: 'provider_error', message: `OpenRouter request failed (${res.status}). Try again or choose another model.`, retryable: false, httpStatus: res.status });
  }

  const data: unknown = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw new SafeInferenceError({ code: 'invalid_response', message: 'OpenRouter returned an unreadable response.', retryable: true });
  }
  const response = data as Record<string, any>;
  if (response.error) {
    throw new SafeInferenceError({ code: 'provider_error', message: 'OpenRouter could not complete this request. Try again or choose another model.', retryable: true });
  }

  const firstChoice = Array.isArray(response.choices) ? response.choices[0] : undefined;
  const rawContent = firstChoice?.message?.content;
  let text = '';
  if (typeof rawContent === 'string') {
    text = rawContent;
  } else if (Array.isArray(rawContent)) {
    text = rawContent.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('');
  }

  if (!text) {
    throw new SafeInferenceError({ code: 'empty_response', message: 'OpenRouter returned an empty message. Try a different model.', retryable: true });
  }

  const chunks: ORChunk[] = [];
  const words = text.split(' ');
  const chunkSize = 8;
  for (let i = 0; i < words.length; i += chunkSize) {
    const piece = words.slice(i, i + chunkSize).join(' ');
    chunks.push({ text: (i > 0 ? ' ' : '') + piece });
  }
  chunks.push({ done: true });
  const usage = extractSafeUsage(response.usage);
  const finishReason = normalizeFinishReason(firstChoice?.finish_reason);
  const resolvedModelId = safeUpstreamIdentifier(response.model);
  const upstreamProviderId = safeUpstreamIdentifier(response.provider);
  if (lockedPolicy && (
    resolvedModelId !== lockedPolicy.model
    || upstreamProviderId !== lockedPolicy.upstreamProviderId
  )) {
    const modelMismatch = resolvedModelId !== lockedPolicy.model;
    throw new SafeInferenceError({
      code: 'protocol_deviation',
      message: 'OpenRouter returned a model or provider outside the frozen research condition. The response was discarded.',
      retryable: false,
      deviation: modelMismatch
        ? {
            code: 'model_mismatch',
            expectedId: lockedPolicy.model,
            observedId: resolvedModelId ?? 'unknown',
          }
        : {
            code: 'provider_mismatch',
            expectedId: lockedPolicy.upstreamProviderId,
            observedId: upstreamProviderId ?? 'unknown',
          },
    });
  }
  return {
    chunks,
    metadata: {
      provider: 'openrouter',
      model: safeRequestedModel(model),
      ...(resolvedModelId ? { resolvedModelId } : {}),
      ...(upstreamProviderId ? { upstreamProviderId } : {}),
      ...(usage ? { usage } : {}),
      ...(finishReason ? { finishReason } : {}),
      latencyMs: Math.max(0, Math.round(nowMilliseconds() - requestStartedAt)),
    },
  };
}

// Cache assembled prompts by the exact versioned lesson manifest and runtime
// context so a changed lesson can never reuse stale teaching instructions.
const promptCache = new Map<string, string>();

/**
 * Resolve and compose the exact teaching prompt in this browser. Any unknown
 * case, domain mismatch, invalid lesson, or manifest mismatch fails closed
 * before OpenRouter is called.
 */
export async function fetchSystemPrompt(opts: {
  modality: DomainKey;
  caseId: string;
  learnerLevel: LearnerLevel;
  mode: ORMode;
  hasImage: boolean;
  casePackage?: CasePackageV1;
  lessonPlan?: LessonPlanV1;
}): Promise<string> {
  const casePackage = opts.casePackage ?? await requireCasePackage(opts.caseId);
  if (casePackage.id !== opts.caseId) {
    throw new Error(`Frozen Case Package '${casePackage.id}' does not match requested case '${opts.caseId}'.`);
  }
  if (!validateCasePackageV1(casePackage).valid
    || !await verifyCasePackageManifestHash(casePackage)) {
    throw new Error(`Case Package '${casePackage.id}' failed manifest verification.`);
  }
  if (casePackage.domain !== opts.modality) {
    throw new Error(
      `Case '${casePackage.id}' belongs to '${casePackage.domain}', not '${opts.modality}'. Refusing to compose the wrong lesson.`,
    );
  }
  const lessonPlan = opts.lessonPlan ?? await requireLessonPlanForCase(casePackage);
  if (!validateLessonPlanV1(lessonPlan).valid
    || !await verifyLessonPlanManifestHash(lessonPlan)) {
    throw new Error(`Lesson Plan '${lessonPlan.id}' failed manifest verification.`);
  }
  const lessonPlanRef = getLessonPlanRef(lessonPlan);
  if (casePackage.lessonPlanRef.id !== lessonPlanRef.id
    || casePackage.lessonPlanRef.version !== lessonPlanRef.version
    || casePackage.lessonPlanRef.sha256 !== lessonPlanRef.sha256) {
    throw new Error(`Case Package '${casePackage.id}' is not bound to Lesson Plan '${lessonPlan.id}'.`);
  }
  const cacheKey = [
    casePackage.id,
    casePackage.schemaVersion,
    casePackage.manifest.sha256,
    lessonPlan.id,
    lessonPlan.version,
    lessonPlan.manifest.sha256,
    opts.learnerLevel,
    opts.mode,
    opts.hasImage ? '1' : '0',
  ].join('|');
  const cached = promptCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const prompt = (await composeLessonPrompt(lessonPlan, {
    learnerLevel: opts.learnerLevel,
    mode: opts.mode,
    hasImage: opts.hasImage,
    caseContext: {
      id: casePackage.id,
      title: casePackage.title,
      vignette: casePackage.vignette,
      neutralDescription: casePackage.neutralDescription,
      domain: casePackage.domain,
    },
  })).providerPrompt;
  if (!prompt.trim()) throw new Error('Lesson prompt composition returned no fixed safety policy.');
  promptCache.set(cacheKey, prompt);
  return prompt;
}
