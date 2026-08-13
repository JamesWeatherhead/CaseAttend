/**
 * Batch generator for the intro cache.
 *
 * Provider selection is via env INTRO_CACHE_PROVIDER:
 *   - 'openrouter' (default): OPENROUTER_API_KEY + optional INTRO_CACHE_MODEL.
 *   - 'anthropic':             ANTHROPIC_API_KEY  + ANTHROPIC_BASE_URL + INTRO_CACHE_MODEL.
 *     ANTHROPIC_BASE_URL points at any Anthropic Messages-compatible endpoint (api.anthropic.com or
 *     a maintainer-configured deployment). Nothing is hard-coded, nothing is committed.
 *
 * Usage (from the repo root):
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/introCache/generate.mts --all
 *   INTRO_CACHE_PROVIDER=anthropic ANTHROPIC_API_KEY=... ANTHROPIC_BASE_URL=https://.../v1 \
 *     INTRO_CACHE_MODEL=claude-opus-4-8 npx tsx scripts/introCache/generate.mts --all
 *   npx tsx scripts/introCache/generate.mts --list         # print lesson roster and stop
 *   npx tsx scripts/introCache/generate.mts --case=... --dry-run   # fixture answers, no network
 *
 * Behavior:
 *   - Sequential: one case at a time, with pacing (INTRO_CACHE_INTER_CALL_MS, default 6000)
 *     between calls, and exponential backoff on 429/5xx (starts at 5s, up to 5 retries).
 *   - Resumable per lesson: skips any case whose intro-cache-drafts/<caseId>.json is already current
 *     (lessonPlanSha256 + provenance.mediaSha match), unless --force is passed.
 *   - Fails closed on the per-level guarantee: if any of the five levels comes back without
 *     >=1 valid question, the whole file for that case is REJECTED and no draft is written.
 *   - One model call per case (all five levels in one JSON payload) so cost is one prompt per case.
 *   - Every cachedAnswer is asserted to end with the SAFETY_FOOTER; otherwise the whole case is rejected.
 *   - Writes drafts to intro-cache-drafts/<caseId>.json with review.status = 'draft'.
 *     A human reviewer promotes drafts into public/intro-cache/<caseId>.json via reviewIntroCache.mts.
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import {
  INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
  INTRO_CACHE_SCHEMA,
  INTRO_CACHE_SCHEMA_VERSION,
  computeSystemPromptSha256,
  validateIntroCacheV1,
  type IntroCacheV1,
} from '../../src/core/introCache';
import { SAFETY_FOOTER } from '../../lib/prompts/shared';
import { enumerateAllLessons, lessonPlanSha256, type EnumeratedLesson } from './enumerateLessons.mts';
import { INTRO_CACHE_SYSTEM_PROMPT } from './systemPrompt.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const draftsDir = path.join(repoRoot, 'intro-cache-drafts');
const publicDir = path.join(repoRoot, 'public', 'intro-cache');

type Provider = 'openrouter' | 'anthropic';

function resolveProvider(): Provider {
  const raw = (process.env.INTRO_CACHE_PROVIDER ?? 'openrouter').trim().toLowerCase();
  if (raw === 'openrouter' || raw === 'anthropic') return raw;
  throw new Error(`INTRO_CACHE_PROVIDER='${raw}' is not supported. Use 'openrouter' or 'anthropic'.`);
}

const PROVIDER: Provider = resolveProvider();
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-opus-4';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';
const DEFAULT_MODEL = process.env.INTRO_CACHE_MODEL?.trim()
  || (PROVIDER === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENROUTER_MODEL);
const MAX_MEDIA_PER_CASE = 4;

const INTER_CALL_MS = Number.parseInt(process.env.INTRO_CACHE_INTER_CALL_MS ?? '6000', 10);
const MAX_RETRIES = Number.parseInt(process.env.INTRO_CACHE_MAX_RETRIES ?? '5', 10);
const BASE_BACKOFF_MS = Number.parseInt(process.env.INTRO_CACHE_BASE_BACKOFF_MS ?? '5000', 10);
const MAX_BACKOFF_MS = Number.parseInt(process.env.INTRO_CACHE_MAX_BACKOFF_MS ?? '120000', 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function anthropicVersion(): string {
  return (process.env.ANTHROPIC_VERSION ?? '2023-06-01').trim();
}

interface CliOptions {
  caseIds: string[] | 'all';
  force: boolean;
  dryRun: boolean;
  list: boolean;
  model: string;
}

function parseCli(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    caseIds: [],
    force: false,
    dryRun: false,
    list: false,
    model: DEFAULT_MODEL,
  };
  for (const arg of argv) {
    if (arg === '--all') options.caseIds = 'all';
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--list') options.list = true;
    else if (arg.startsWith('--case=')) {
      const id = arg.slice('--case='.length).trim();
      if (id.length > 0) {
        if (options.caseIds === 'all') options.caseIds = [id];
        else options.caseIds.push(id);
      }
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length).trim() || DEFAULT_MODEL;
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  return options;
}

function printUsageAndExit(code: number): never {
  console.log(
    [
      'Usage:',
      '  OPENROUTER_API_KEY=sk-or-... npx tsx scripts/introCache/generate.mts --all',
      '  INTRO_CACHE_PROVIDER=anthropic ANTHROPIC_API_KEY=... ANTHROPIC_BASE_URL=https://.../v1 \\',
      '    INTRO_CACHE_MODEL=claude-opus-4-8 npx tsx scripts/introCache/generate.mts --all',
      '  npx tsx scripts/introCache/generate.mts --list',
      '  npx tsx scripts/introCache/generate.mts --case=<caseId> --dry-run',
      '',
      'Flags:',
      '  --all           Run every enumerated lesson (idempotent; skips current drafts).',
      '  --case=<id>     Run one lesson by case id (repeatable).',
      '  --list          Print the enumerated lesson roster and exit.',
      '  --force         Ignore existing drafts and regenerate.',
      '  --dry-run       Skip network; write a hand-written fixture per level. Useful for pipeline validation.',
      '  --model=<id>    Override the model id (provider-appropriate default).',
      '',
      'Env:',
      '  INTRO_CACHE_PROVIDER      openrouter (default) | anthropic',
      '  INTRO_CACHE_MODEL         model id (default depends on provider)',
      '  INTRO_CACHE_INTER_CALL_MS pacing between calls (default 6000)',
      '  INTRO_CACHE_MAX_RETRIES   backoff retries on 429/5xx (default 5)',
      '  ANTHROPIC_BASE_URL        Anthropic Messages endpoint base (e.g. https://.../v1)',
      '  ANTHROPIC_API_KEY         key for the anthropic provider',
      '  ANTHROPIC_VERSION         anthropic-version header (default 2023-06-01)',
    ].join('\n'),
  );
  process.exit(code);
}

interface LevelPayload {
  introPrompt: string;
  introQuestions: {
    id: string;
    label: string;
    prompt: string;
    cachedAnswer: string;
  }[];
}

interface ModelPayload {
  levels: Record<string, LevelPayload>;
}

async function readExistingDraft(caseId: string): Promise<IntroCacheV1 | null> {
  const filePath = path.join(draftsDir, `${caseId}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const validation = validateIntroCacheV1(parsed);
    if (!validation.valid) {
      console.warn(`  existing draft for ${caseId} did not validate; will regenerate:`, validation.errors[0]);
      return null;
    }
    return parsed as IntroCacheV1;
  } catch (error) {
    console.warn(`  existing draft for ${caseId} could not be read (${(error as Error).message}); will regenerate.`);
    return null;
  }
}

function sampleAssets(lesson: EnumeratedLesson): EnumeratedLesson['assets'] {
  const all = lesson.assets;
  if (all.length <= MAX_MEDIA_PER_CASE) return all;
  const step = Math.floor(all.length / MAX_MEDIA_PER_CASE) || 1;
  const sampled: EnumeratedLesson['assets'][number][] = [];
  for (let i = 0; i < all.length && sampled.length < MAX_MEDIA_PER_CASE; i += step) {
    sampled.push(all[i]);
  }
  return sampled;
}

async function readAssetBytes(src: string): Promise<Buffer> {
  const localPath = path.join(repoRoot, 'public', src.replace(/^\//, ''));
  return readFile(localPath);
}

async function buildUserMessage(lesson: EnumeratedLesson): Promise<Array<
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
>> {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [];
  const objectives = lesson.lessonPlan.objectives
    .map((o) => `- ${o.id}: ${o.description}`)
    .join('\n');
  const teachingNotes = lesson.lessonPlan.teachingNotes.map((note) => `- ${note}`).join('\n');
  parts.push({
    type: 'text',
    text: [
      `Case id: ${lesson.caseId}`,
      `Case title: ${lesson.casePackage.title}`,
      `Case domain: ${lesson.casePackage.domain}`,
      `Vignette: ${lesson.casePackage.vignette}`,
      `Neutral description: ${lesson.casePackage.neutralDescription}`,
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
  });
  const sampled = sampleAssets(lesson);
  for (const asset of sampled) {
    const bytes = await readAssetBytes(asset.src);
    const base64 = bytes.toString('base64');
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${asset.mimeType};base64,${base64}` },
    });
  }
  return parts;
}

interface FrontierUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  usage?: FrontierUsage;
}

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

class RetryableError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

function extractRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const asSeconds = Number.parseFloat(header);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000);
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

async function callOpenRouter(
  lesson: EnumeratedLesson,
  systemPrompt: string,
  model: string,
): Promise<{ payload: ModelPayload; usage?: FrontierUsage }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Export it in the shell, or pass --dry-run to skip the network.',
    );
  }
  const userContent = await buildUserMessage(lesson);
  const body = {
    model,
    temperature: 0.2,
    max_tokens: 6000,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/JamesWeatherhead/CaseAttend',
      'X-Title': 'CaseAttend intro-cache batch',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
    const errText = await response.text().catch(() => '');
    throw new RetryableError(
      `OpenRouter transient failure (${response.status}): ${errText.slice(0, 200)}`,
      extractRetryAfterMs(response),
    );
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter call failed (${response.status}): ${errText.slice(0, 500)}`);
  }
  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('OpenRouter response did not include message content.');
  let parsed: ModelPayload;
  try {
    parsed = JSON.parse(content) as ModelPayload;
  } catch (error) {
    throw new Error(`Model response was not valid JSON: ${(error as Error).message}`);
  }
  return { payload: parsed, usage: data.usage };
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedPath = path.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
}

async function anthropicUserContent(lesson: EnumeratedLesson): Promise<Array<
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
>> {
  const openaiShape = await buildUserMessage(lesson);
  return openaiShape.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    const url = part.image_url.url;
    const match = /^data:([^;]+);base64,(.*)$/.exec(url);
    if (!match) {
      throw new Error(`Expected inline base64 data URL for image; got ${url.slice(0, 32)}...`);
    }
    return {
      type: 'image',
      source: { type: 'base64', media_type: match[1], data: match[2] },
    };
  });
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

async function callAnthropic(
  lesson: EnumeratedLesson,
  systemPrompt: string,
  model: string,
): Promise<{ payload: ModelPayload; usage?: FrontierUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
  if (!apiKey || !baseUrl) {
    throw new Error(
      'INTRO_CACHE_PROVIDER=anthropic requires ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL. '
        + 'Pass --dry-run to skip the network.',
    );
  }
  const userContent = await anthropicUserContent(lesson);
  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  };
  // Some frontier Anthropic deployments reject temperature; only include it
  // when the caller opts in via env.
  const temperatureEnv = process.env.ANTHROPIC_TEMPERATURE?.trim();
  if (temperatureEnv) {
    const value = Number.parseFloat(temperatureEnv);
    if (Number.isFinite(value)) body.temperature = value;
  }
  const response = await fetch(joinUrl(baseUrl, 'messages'), {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': anthropicVersion(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
    const errText = await response.text().catch(() => '');
    throw new RetryableError(
      `Anthropic transient failure (${response.status}): ${errText.slice(0, 200)}`,
      extractRetryAfterMs(response),
    );
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic call failed (${response.status}): ${errText.slice(0, 500)}`);
  }
  const data = (await response.json()) as AnthropicResponse;
  const textBlock = data.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!textBlock?.text) throw new Error('Anthropic response did not include text content.');
  const jsonText = extractJsonBlock(textBlock.text);
  let parsed: ModelPayload;
  try {
    parsed = JSON.parse(jsonText) as ModelPayload;
  } catch (error) {
    throw new Error(`Model response was not valid JSON: ${(error as Error).message}`);
  }
  const usage: FrontierUsage | undefined = data.usage
    ? {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens:
          (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) || undefined,
      }
    : undefined;
  return { payload: parsed, usage };
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof RetryableError) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === 'TypeError'
    || message.includes('fetch failed')
    || message.includes('econnreset')
    || message.includes('etimedout')
    || message.includes('enotfound')
    || message.includes('socket hang up')
  );
}

async function callFrontierModel(
  lesson: EnumeratedLesson,
  systemPrompt: string,
  model: string,
): Promise<{ payload: ModelPayload; usage?: FrontierUsage }> {
  const attempt = (): Promise<{ payload: ModelPayload; usage?: FrontierUsage }> =>
    PROVIDER === 'anthropic'
      ? callAnthropic(lesson, systemPrompt, model)
      : callOpenRouter(lesson, systemPrompt, model);
  let lastError: unknown = null;
  for (let i = 0; i <= MAX_RETRIES; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryableError || isNetworkFailure(error);
      if (!retryable || i === MAX_RETRIES) throw error;
      const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** i);
      const retryAfter = error instanceof RetryableError ? error.retryAfterMs : undefined;
      const wait = retryAfter && retryAfter > exponential ? retryAfter : exponential;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`    transient failure, retry ${i + 1}/${MAX_RETRIES} in ${Math.round(wait / 1000)}s: ${message}`);
      await sleep(wait);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function fixtureLevel(lesson: EnumeratedLesson, level: string): LevelPayload {
  const body = [
    `Educational sample for ${lesson.casePackage.title} at the ${level} level.`,
    'This fixture is used to validate the intro-cache pipeline end-to-end without a network call.',
    'Replace with real frontier-model output before shipping.',
    SAFETY_FOOTER.trim(),
  ].join('\n\n');
  return {
    introPrompt: `**${lesson.casePackage.title}**\n\n${lesson.casePackage.vignette}\n\nBegin with observation, not diagnosis. What visible finding do you notice first?`,
    introQuestions: [
      {
        id: 'what-do-i-see',
        label: 'What do I see?',
        prompt: 'What visible finding stands out first on this image?',
        cachedAnswer: body,
      },
    ],
  };
}

function fixturePayload(lesson: EnumeratedLesson): ModelPayload {
  return {
    levels: {
      highschool: fixtureLevel(lesson, 'high school'),
      undergrad: fixtureLevel(lesson, 'undergrad'),
      ms_preclinical: fixtureLevel(lesson, 'pre-Step 1 medical student'),
      ms_clinical: fixtureLevel(lesson, 'post-Step 1 medical student'),
      resident: fixtureLevel(lesson, 'resident'),
    },
  };
}

const REQUIRED_LEVELS = ['highschool', 'undergrad', 'ms_preclinical', 'ms_clinical', 'resident'] as const;

function assertFooter(answer: string, path: string): void {
  const trimmed = answer.trimEnd();
  const footer = SAFETY_FOOTER.trim();
  if (!trimmed.endsWith(footer)) {
    throw new Error(`${path}.cachedAnswer must end with the SAFETY_FOOTER.`);
  }
}

function payloadToLevels(payload: ModelPayload): IntroCacheV1['levels'] {
  const levels: Record<string, IntroCacheV1['levels'][keyof IntroCacheV1['levels']]> = {};
  for (const level of REQUIRED_LEVELS) {
    const entry = payload.levels?.[level];
    if (!entry || !entry.introQuestions || entry.introQuestions.length === 0) {
      throw new Error(`Level '${level}' is missing or has zero questions.`);
    }
    if (typeof entry.introPrompt !== 'string' || entry.introPrompt.trim() === '') {
      throw new Error(`Level '${level}' has no introPrompt.`);
    }
    const introQuestions = entry.introQuestions.map((q, index) => {
      const path = `levels.${level}.introQuestions[${index}]`;
      if (typeof q.id !== 'string' || q.id.trim() === '') {
        throw new Error(`${path}.id must be a non-empty string.`);
      }
      if (typeof q.label !== 'string' || q.label.trim() === '') {
        throw new Error(`${path}.label must be a non-empty string.`);
      }
      if (typeof q.prompt !== 'string' || q.prompt.trim() === '') {
        throw new Error(`${path}.prompt must be a non-empty string.`);
      }
      if (typeof q.cachedAnswer !== 'string' || q.cachedAnswer.trim() === '') {
        throw new Error(`${path}.cachedAnswer must be a non-empty string.`);
      }
      assertFooter(q.cachedAnswer, path);
      return {
        id: q.id.trim(),
        label: q.label.trim(),
        prompt: q.prompt.trim(),
        cachedAnswer: q.cachedAnswer.trim(),
      };
    });
    levels[level] = { introPrompt: entry.introPrompt.trim(), introQuestions };
  }
  return levels as IntroCacheV1['levels'];
}

async function ensureDirs(): Promise<void> {
  await mkdir(draftsDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });
}

function fixedIsoTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

async function writeDraft(caseId: string, artifact: IntroCacheV1): Promise<void> {
  const filePath = path.join(draftsDir, `${caseId}.json`);
  const json = JSON.stringify(artifact, null, 2) + '\n';
  await writeFile(filePath, json, 'utf8');
}

interface RunResult {
  caseId: string;
  status: 'wrote' | 'skipped-current' | 'skipped-error' | 'skipped-no-key';
  detail?: string;
  networkCall?: boolean;
}

function providerCredentialsReady(): { ok: boolean; detail?: string } {
  if (PROVIDER === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY?.trim() || !process.env.ANTHROPIC_BASE_URL?.trim()) {
      return {
        ok: false,
        detail: 'INTRO_CACHE_PROVIDER=anthropic requires ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL.',
      };
    }
    return { ok: true };
  }
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return { ok: false, detail: 'OPENROUTER_API_KEY is not set.' };
  }
  return { ok: true };
}

async function processLesson(
  lesson: EnumeratedLesson,
  options: CliOptions,
  systemPromptSha: string,
): Promise<RunResult> {
  const existing = options.force ? null : await readExistingDraft(lesson.caseId);
  if (existing) {
    if (
      existing.lessonPlanSha256 === lessonPlanSha256(lesson.lessonPlan)
      && existing.provenance.mediaSha === lesson.mediaSha
    ) {
      return { caseId: lesson.caseId, status: 'skipped-current' };
    }
  }
  let payload: ModelPayload;
  let usage: FrontierUsage | undefined;
  let networkCall = false;
  if (options.dryRun) {
    payload = fixturePayload(lesson);
  } else {
    const ready = providerCredentialsReady();
    if (!ready.ok) {
      return { caseId: lesson.caseId, status: 'skipped-no-key', detail: ready.detail };
    }
    const call = await callFrontierModel(lesson, INTRO_CACHE_SYSTEM_PROMPT, options.model);
    payload = call.payload;
    usage = call.usage;
    networkCall = true;
  }
  let levels: IntroCacheV1['levels'];
  try {
    levels = payloadToLevels(payload);
  } catch (error) {
    return {
      caseId: lesson.caseId,
      status: 'skipped-error',
      detail: (error as Error).message,
    };
  }
  const artifact: IntroCacheV1 = {
    schema: INTRO_CACHE_SCHEMA,
    schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
    caseId: lesson.caseId,
    lessonPlanSha256: lessonPlanSha256(lesson.lessonPlan),
    provenance: {
      modelId: options.dryRun ? `dry-run-fixture (${options.model})` : options.model,
      systemPromptSha256: systemPromptSha,
      requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
      mediaSha: lesson.mediaSha,
      generatedAt: fixedIsoTimestamp(),
    },
    review: { status: 'draft' },
    levels,
  };
  const validation = validateIntroCacheV1(artifact);
  if (!validation.valid) {
    return {
      caseId: lesson.caseId,
      status: 'skipped-error',
      detail: `Generated draft failed schema: ${validation.errors[0]}`,
    };
  }
  await writeDraft(lesson.caseId, artifact);
  const usageDetail = usage
    ? `tokens: prompt ${usage.prompt_tokens ?? '?'}, completion ${usage.completion_tokens ?? '?'}, total ${usage.total_tokens ?? '?'}`
    : options.dryRun ? 'dry-run fixture' : undefined;
  return { caseId: lesson.caseId, status: 'wrote', detail: usageDetail, networkCall };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const lessons = await enumerateAllLessons();
  if (options.list) {
    for (const lesson of lessons) {
      console.log(`${lesson.caseId}\t${lesson.casePackage.title}\t${lesson.assets.length} asset(s)`);
    }
    console.log(`\nTotal: ${lessons.length} lessons.`);
    return;
  }
  const targets = options.caseIds === 'all'
    ? lessons
    : lessons.filter((lesson) => (options.caseIds as string[]).includes(lesson.caseId));
  if (options.caseIds !== 'all') {
    const seen = new Set(targets.map((l) => l.caseId));
    for (const id of options.caseIds as string[]) {
      if (!seen.has(id)) console.warn(`No lesson enumerated for '${id}'.`);
    }
  }
  if (targets.length === 0) {
    console.error('No target lessons after filtering. Pass --all or --case=<id>.');
    process.exit(1);
  }
  await ensureDirs();
  const systemPromptSha = await computeSystemPromptSha256(INTRO_CACHE_SYSTEM_PROMPT);
  console.log(
    `Generating intro cache for ${targets.length} lesson(s). Provider: ${PROVIDER}. Model: ${options.model}. `
      + `Dry-run: ${options.dryRun}. Force: ${options.force}. Pacing: ${INTER_CALL_MS}ms.`,
  );
  console.log(`System prompt SHA-256: ${systemPromptSha}`);
  const results: RunResult[] = [];
  for (let index = 0; index < targets.length; index += 1) {
    const lesson = targets[index];
    process.stdout.write(`- [${index + 1}/${targets.length}] ${lesson.caseId} ... `);
    let didNetworkCall = false;
    try {
      const result = await processLesson(lesson, options, systemPromptSha);
      results.push(result);
      didNetworkCall = result.networkCall === true;
      const suffix = result.detail ? ` (${result.detail})` : '';
      console.log(`${result.status}${suffix}`);
    } catch (error) {
      const detail = (error as Error).message;
      results.push({ caseId: lesson.caseId, status: 'skipped-error', detail });
      console.log(`skipped-error (${detail})`);
    }
    if (didNetworkCall && index < targets.length - 1 && INTER_CALL_MS > 0) {
      await sleep(INTER_CALL_MS);
    }
  }
  const wrote = results.filter((r) => r.status === 'wrote').length;
  const currentSkipped = results.filter((r) => r.status === 'skipped-current').length;
  const errored = results.filter((r) => r.status === 'skipped-error').length;
  const noKey = results.filter((r) => r.status === 'skipped-no-key').length;
  console.log(
    `\nDone. Wrote ${wrote}, already-current ${currentSkipped}, errored ${errored}, no-key ${noKey}.`,
  );
  if (wrote > 0) {
    console.log(`Drafts saved under ${path.relative(repoRoot, draftsDir)}/. Promote them via reviewIntroCache.mts.`);
  }
  if (errored > 0) process.exit(2);
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});

// Silence "value not used" lint for the private stat import when future work
// needs mtime checks; keep the module-graph import so the intent is explicit.
void stat;
