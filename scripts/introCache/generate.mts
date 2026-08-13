/**
 * Batch generator for the intro cache.
 *
 * Usage (from the repo root):
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/introCache/generate.mts --all
 *   OPENROUTER_API_KEY=sk-or-... npx tsx scripts/introCache/generate.mts --case=cxr-pneumothorax
 *   npx tsx scripts/introCache/generate.mts --list         # print lesson roster and stop
 *   npx tsx scripts/introCache/generate.mts --case=... --dry-run   # fixture answers, no network
 *
 * Behavior:
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

const DEFAULT_MODEL = process.env.INTRO_CACHE_MODEL?.trim() || 'anthropic/claude-opus-4';
const MAX_MEDIA_PER_CASE = 4;

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
      '  OPENROUTER_API_KEY=sk-or-... npx tsx scripts/introCache/generate.mts --case=<caseId>',
      '  npx tsx scripts/introCache/generate.mts --list',
      '  npx tsx scripts/introCache/generate.mts --case=<caseId> --dry-run',
      '',
      'Flags:',
      '  --all           Run every enumerated lesson (idempotent; skips current drafts).',
      '  --case=<id>     Run one lesson by case id (repeatable).',
      '  --list          Print the enumerated lesson roster and exit.',
      '  --force         Ignore existing drafts and regenerate.',
      '  --dry-run       Skip network; write a hand-written fixture per level. Useful for pipeline validation.',
      '  --model=<id>    Override the OpenRouter model id (default: anthropic/claude-opus-4).',
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

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  usage?: OpenRouterUsage;
}

async function callFrontierModel(
  lesson: EnumeratedLesson,
  systemPrompt: string,
  model: string,
): Promise<{ payload: ModelPayload; usage?: OpenRouterUsage }> {
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
  let usage: OpenRouterUsage | undefined;
  if (options.dryRun) {
    payload = fixturePayload(lesson);
  } else {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return { caseId: lesson.caseId, status: 'skipped-no-key', detail: 'OPENROUTER_API_KEY is not set.' };
    }
    const call = await callFrontierModel(lesson, INTRO_CACHE_SYSTEM_PROMPT, options.model);
    payload = call.payload;
    usage = call.usage;
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
  return { caseId: lesson.caseId, status: 'wrote', detail: usageDetail };
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
    `Generating intro cache for ${targets.length} lesson(s). Model: ${options.model}. Dry-run: ${options.dryRun}. Force: ${options.force}.`,
  );
  console.log(`System prompt SHA-256: ${systemPromptSha}`);
  const results: RunResult[] = [];
  for (const lesson of targets) {
    process.stdout.write(`- ${lesson.caseId} ... `);
    try {
      const result = await processLesson(lesson, options, systemPromptSha);
      results.push(result);
      const suffix = result.detail ? ` (${result.detail})` : '';
      console.log(`${result.status}${suffix}`);
    } catch (error) {
      const detail = (error as Error).message;
      results.push({ caseId: lesson.caseId, status: 'skipped-error', detail });
      console.log(`skipped-error (${detail})`);
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
