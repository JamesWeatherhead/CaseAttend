import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import {
  INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
  INTRO_CACHE_SCHEMA,
  INTRO_CACHE_SCHEMA_VERSION,
  type IntroCacheV1,
} from '../core/introCache';
import { AuthoredIntroCacheStore } from '../services/authoredIntroCacheStore';

function makeCache(overrides: Partial<IntroCacheV1> = {}): IntroCacheV1 {
  const level = {
    introPrompt: 'Welcome.',
    introQuestions: [
      { id: 'q1', label: 'Q1', prompt: 'ask?', cachedAnswer: 'Answer. Educational use only.' },
    ],
  };
  return {
    schema: INTRO_CACHE_SCHEMA,
    schemaVersion: INTRO_CACHE_SCHEMA_VERSION,
    caseId: 'author-case-1',
    lessonPlanSha256: 'a'.repeat(64),
    provenance: {
      modelId: 'test/model',
      systemPromptSha256: 'b'.repeat(64),
      requestTemplateVersion: INTRO_CACHE_REQUEST_TEMPLATE_VERSION,
      mediaSha: 'c'.repeat(64),
      generatedAt: '2026-08-13T00:00:00.000Z',
    },
    review: { status: 'draft' },
    levels: {
      highschool: level,
      undergrad: level,
      ms_preclinical: level,
      ms_clinical: level,
      resident: level,
    },
    ...overrides,
  };
}

describe('AuthoredIntroCacheStore', () => {
  let store: AuthoredIntroCacheStore;
  const uniqueDbName = () => `test-intro-cache-${Math.random().toString(36).slice(2)}`;

  beforeEach(() => {
    store = new AuthoredIntroCacheStore({
      indexedDB: new IDBFactory() as unknown as IDBFactory,
      databaseName: uniqueDbName(),
    });
  });

  afterEach(() => undefined);

  it('persists a draft and reads it back byte-identical', async () => {
    const cache = makeCache();
    await store.save(cache);
    const roundTrip = await store.get(cache.caseId);
    expect(roundTrip).not.toBeNull();
    expect(roundTrip?.caseId).toBe(cache.caseId);
    expect(roundTrip?.review.status).toBe('draft');
    expect(roundTrip?.levels.resident.introQuestions[0].cachedAnswer)
      .toBe(cache.levels.resident.introQuestions[0].cachedAnswer);
  });

  it('overwrites a previous artifact for the same caseId', async () => {
    await store.save(makeCache());
    const approved = makeCache({
      review: {
        status: 'approved',
        reviewer: 'James Weatherhead',
        credentials: 'MD, PhD candidate',
        reviewedAt: '2026-08-13T00:00:00.000Z',
      },
    });
    await store.save(approved);
    const roundTrip = await store.get(approved.caseId);
    expect(roundTrip?.review.status).toBe('approved');
  });

  it('returns null for an unknown caseId', async () => {
    const result = await store.get('does-not-exist');
    expect(result).toBeNull();
  });

  it('refuses to persist an artifact that fails schema validation', async () => {
    const bad = makeCache();
    const broken = {
      ...bad,
      levels: {
        ...bad.levels,
        highschool: { introPrompt: '', introQuestions: [] },
      },
    } as unknown as IntroCacheV1;
    await expect(store.save(broken)).rejects.toThrow(/Invalid Intro Cache|introQuestions/);
  });

  it('deletes a persisted artifact and reports whether it existed', async () => {
    await store.save(makeCache());
    expect(await store.delete('author-case-1')).toBe(true);
    expect(await store.get('author-case-1')).toBeNull();
    expect(await store.delete('author-case-1')).toBe(false);
  });

  it('notifies subscribers on save and delete', async () => {
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls += 1; });
    await store.save(makeCache());
    await store.delete('author-case-1');
    unsubscribe();
    expect(calls).toBe(2);
  });

  it('falls back to memory when no IndexedDB is available', async () => {
    const memoryStore = new AuthoredIntroCacheStore({ indexedDB: null });
    await memoryStore.save(makeCache());
    const roundTrip = await memoryStore.get('author-case-1');
    expect(roundTrip?.caseId).toBe('author-case-1');
    expect(await memoryStore.delete('author-case-1')).toBe(true);
    expect(await memoryStore.get('author-case-1')).toBeNull();
  });
});
