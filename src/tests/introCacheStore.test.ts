import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
  INTRO_CACHE_SCHEMA,
  INTRO_CACHE_SCHEMA_VERSION,
  type IntroCacheV1,
} from '../core/introCache';
import {
  __resetIntroCacheStoreForTests,
  loadIntroCache,
} from '../services/introCacheStore';

function makeCache(overrides: Partial<IntroCacheV1> = {}): IntroCacheV1 {
  const levelEntry = {
    introPrompt: 'Welcome.',
    introQuestions: [
      { id: 'q1', label: 'Q1', prompt: 'Ask me one thing.', cachedAnswer: 'Answer one. Educational use only.' },
    ],
  };
  const base: IntroCacheV1 = {
    schema: INTRO_CACHE_SCHEMA,
    schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
    caseId: 'cxr-pneumothorax',
    lessonPlanSha256: 'a'.repeat(64),
    provenance: {
      modelId: 'anthropic/claude-opus-4',
      systemPromptSha256: 'b'.repeat(64),
      requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
      mediaSha: 'c'.repeat(64),
      generatedAt: '2026-08-13T00:00:00.000Z',
    },
    review: {
      status: 'approved',
      reviewer: 'James Weatherhead',
      credentials: 'MD, PhD candidate',
      reviewedAt: '2026-08-13T00:00:00.000Z',
    },
    levels: {
      highschool: levelEntry,
      undergrad: levelEntry,
      ms_preclinical: levelEntry,
      ms_clinical: levelEntry,
      resident: levelEntry,
    },
  };
  return { ...base, ...overrides };
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('loadIntroCache', () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;

  beforeEach(() => {
    __resetIntroCacheStoreForTests();
    console.warn = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  it('returns a validated cache on a 200 with matching sha and approved review', async () => {
    const cache = makeCache();
    globalThis.fetch = vi.fn(async () => mockJsonResponse(cache));
    const result = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    expect(result).not.toBeNull();
    expect(result?.caseId).toBe('cxr-pneumothorax');
  });

  it('memoizes a second call with the same key', async () => {
    const cache = makeCache();
    const spy = vi.fn(async () => mockJsonResponse(cache));
    globalThis.fetch = spy as unknown as typeof fetch;
    const a = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    const b = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns null on 404 without throwing', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 }));
    const result = await loadIntroCache('missing-case', { lessonPlanSha256: 'a'.repeat(64) });
    expect(result).toBeNull();
  });

  it('returns null when the lesson plan sha does not match (drift is fail-closed)', async () => {
    const cache = makeCache({ lessonPlanSha256: 'd'.repeat(64) });
    globalThis.fetch = vi.fn(async () => mockJsonResponse(cache));
    const result = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    expect(result).toBeNull();
  });

  it('returns null when review status is draft (no unreviewed content ships to learners)', async () => {
    const cache = makeCache({ review: { status: 'draft' } });
    globalThis.fetch = vi.fn(async () => mockJsonResponse(cache));
    const result = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    expect(result).toBeNull();
  });

  it('returns null when the caseId in the JSON does not match the request', async () => {
    const cache = makeCache({ caseId: 'other-case' });
    globalThis.fetch = vi.fn(async () => mockJsonResponse(cache));
    const result = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    expect(result).toBeNull();
  });

  it('returns null and warns on schema-invalid JSON', async () => {
    globalThis.fetch = vi.fn(async () => mockJsonResponse({ nope: true }));
    const result = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null and warns on network error (never breaks the lesson)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await loadIntroCache('cxr-pneumothorax', { lessonPlanSha256: 'a'.repeat(64) });
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});
