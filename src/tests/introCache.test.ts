import { describe, expect, it } from 'vitest';

import {
  computeMediaSha,
  computeSystemPromptSha256,
  INTRO_CACHE_LEARNER_LEVELS,
  INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
  INTRO_CACHE_SCHEMA,
  INTRO_CACHE_SCHEMA_VERSION,
  introCacheHasLevel,
  validateIntroCacheV1,
  type IntroCacheV1,
} from '../core/introCache';

function sampleQuestion(id: string): { id: string; label: string; prompt: string; cachedAnswer: string } {
  return {
    id,
    label: `Label ${id}`,
    prompt: `Question ${id}?`,
    cachedAnswer: `Answer for ${id}. Educational use only.`,
  };
}

function sampleCache(overrides: Partial<IntroCacheV1> = {}): IntroCacheV1 {
  const levelEntry = {
    introPrompt: 'Welcome to this teaching case.',
    introQuestions: [sampleQuestion('q1')],
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

describe('Intro Cache v1 schema', () => {
  it('accepts a well-formed approved cache with every level covered', () => {
    const result = validateIntroCacheV1(sampleCache());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a draft (unreviewed) cache with the same shape', () => {
    const draft = sampleCache({ review: { status: 'draft' } });
    const result = validateIntroCacheV1(draft);
    expect(result.valid).toBe(true);
  });

  it('rejects a cache that is missing any learner level', () => {
    const cache = sampleCache();
    const partial = { ...cache, levels: { ...cache.levels } } as unknown as Record<string, unknown>;
    delete (partial.levels as Record<string, unknown>).resident;
    const result = validateIntroCacheV1(partial);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('resident'))).toBe(true);
  });

  it('rejects a level with zero intro questions', () => {
    const cache = sampleCache();
    const bad: IntroCacheV1 = {
      ...cache,
      levels: {
        ...cache.levels,
        highschool: { introPrompt: 'hi', introQuestions: [] },
      },
    };
    const result = validateIntroCacheV1(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('introQuestions'))).toBe(true);
  });

  it('rejects duplicate question ids within one level', () => {
    const cache = sampleCache();
    const bad: IntroCacheV1 = {
      ...cache,
      levels: {
        ...cache.levels,
        highschool: {
          introPrompt: 'hi',
          introQuestions: [sampleQuestion('dup'), sampleQuestion('dup')],
        },
      },
    };
    const result = validateIntroCacheV1(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('duplicates'))).toBe(true);
  });

  it('rejects unknown top-level fields', () => {
    const bad = { ...sampleCache(), extra: 'nope' };
    const result = validateIntroCacheV1(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('extra'))).toBe(true);
  });

  it('rejects a bad request template version', () => {
    const cache = sampleCache();
    const bad: unknown = {
      ...cache,
      provenance: { ...cache.provenance, requestTemplateVersion: '9.9' },
    };
    const result = validateIntroCacheV1(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('requestTemplateVersion'))).toBe(true);
  });

  it('rejects a non-SHA provenance digest', () => {
    const cache = sampleCache();
    const bad: unknown = {
      ...cache,
      provenance: { ...cache.provenance, mediaSha: 'not-a-hash' },
    };
    const result = validateIntroCacheV1(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('mediaSha'))).toBe(true);
  });

  it('exposes all five learner levels', () => {
    expect(new Set(INTRO_CACHE_LEARNER_LEVELS)).toEqual(
      new Set(['highschool', 'undergrad', 'ms_preclinical', 'ms_clinical', 'resident']),
    );
  });

  it('introCacheHasLevel reports coverage', () => {
    const cache = sampleCache();
    expect(introCacheHasLevel(cache, 'resident')).toBe(true);
    const partial = {
      ...cache,
      levels: {
        ...cache.levels,
        resident: { introPrompt: 'x', introQuestions: [] },
      },
    };
    expect(introCacheHasLevel(partial, 'resident')).toBe(false);
  });
});

describe('Intro Cache hashing helpers', () => {
  it('computeMediaSha is deterministic under asset ordering', async () => {
    const a = await computeMediaSha({
      neutralDescription: 'Frontal chest radiograph.',
      assets: [
        { src: '/images/cxr-pneumothorax/1.jpg', sha256: 'fe79c23752a7f32c5e8748726ca596ab94d9f4a5a878f768cd4d1d9eaa2bc7cd' },
        { src: '/images/cxr-pneumothorax/2.jpg', sha256: 'aa'.repeat(32) },
      ],
    });
    const b = await computeMediaSha({
      neutralDescription: 'Frontal chest radiograph.',
      assets: [
        { src: '/images/cxr-pneumothorax/2.jpg', sha256: 'aa'.repeat(32) },
        { src: '/images/cxr-pneumothorax/1.jpg', sha256: 'FE79C23752A7F32C5E8748726CA596AB94D9F4A5A878F768CD4D1D9EAA2BC7CD' },
      ],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computeMediaSha changes when the neutral description changes', async () => {
    const assets = [{ src: '/x.jpg', sha256: '0'.repeat(64) }];
    const a = await computeMediaSha({ neutralDescription: 'A', assets });
    const b = await computeMediaSha({ neutralDescription: 'B', assets });
    expect(a).not.toBe(b);
  });

  it('computeSystemPromptSha256 is stable and lowercase hex', async () => {
    const sha = await computeSystemPromptSha256('SYSTEM PROMPT v1');
    expect(sha).toMatch(/^[a-f0-9]{64}$/);
    expect(await computeSystemPromptSha256('SYSTEM PROMPT v1')).toBe(sha);
  });
});
