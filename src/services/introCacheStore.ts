/**
 * Client-side loader for the intro cache.
 *
 * Two sources, checked in order:
 *   1. Shipped static file at `/intro-cache/<caseId>.json` (issue #68's
 *      backfill).
 *   2. Browser-local authored cache in IndexedDB (issue #70). This is written
 *      by the Case Studio pipeline when an educator authors a new lesson.
 *
 * Both sources produce the same `IntroCacheV1` shape, so downstream runtime is
 * unchanged. The loader validates against the schema, drops artifacts whose
 * `lessonPlanSha256` no longer matches the current lesson, refuses drafts, and
 * memoizes per case id so multiple mounts share one fetch.
 */

import {
  type IntroCacheV1,
  validateIntroCacheV1,
} from '../core/introCache';
import {
  authoredIntroCacheStore,
  type AuthoredIntroCacheStore,
} from './authoredIntroCacheStore';

let overrideAuthoredStore: AuthoredIntroCacheStore | null = null;

const memoized = new Map<string, Promise<IntroCacheV1 | null>>();
let unsubscribeFromAuthoredStore = authoredIntroCacheStore.subscribe(() => memoized.clear());

function subscribeToAuthoredStore(store: AuthoredIntroCacheStore): void {
  unsubscribeFromAuthoredStore();
  unsubscribeFromAuthoredStore = store.subscribe(() => memoized.clear());
}

export interface IntroCacheLoadContext {
  /** The lesson plan sha the current lesson resolves to; drift makes the cache stale. */
  lessonPlanSha256: string;
}

async function fetchIntroCacheJson(caseId: string, signal?: AbortSignal): Promise<unknown | null> {
  const url = `/intro-cache/${encodeURIComponent(caseId)}.json`;
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'no-cache',
    ...(signal ? { signal } : {}),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Intro cache fetch for '${caseId}' failed with status ${response.status}.`);
  }
  return await response.json();
}

function keyFor(caseId: string, context: IntroCacheLoadContext): string {
  return `${caseId}:${context.lessonPlanSha256}`;
}

function assertCache(
  payload: unknown,
  caseId: string,
  context: IntroCacheLoadContext,
  origin: 'shipped' | 'authored',
): IntroCacheV1 | null {
  const validation = validateIntroCacheV1(payload);
  if (!validation.valid) {
    console.warn(
      `Intro cache for '${caseId}' (${origin}) failed schema validation and was ignored:`,
      validation.errors,
    );
    return null;
  }
  const cache = payload as IntroCacheV1;
  if (cache.caseId !== caseId) {
    console.warn(`Intro cache caseId '${cache.caseId}' does not match request '${caseId}'.`);
    return null;
  }
  if (cache.review.status !== 'approved') {
    // Fail closed: unreviewed drafts must never render to a learner.
    return null;
  }
  if (cache.lessonPlanSha256 !== context.lessonPlanSha256) {
    // Media or lesson content drifted since generation.
    return null;
  }
  return cache;
}

/**
 * Load and validate the intro cache for a case. Returns null when both the
 * shipped file and the browser-local store are missing, still in draft, or
 * bound to a different lesson plan sha. Never throws for a missing artifact:
 * runtime falls back gracefully.
 */
export function loadIntroCache(
  caseId: string,
  context: IntroCacheLoadContext,
  options: { signal?: AbortSignal } = {},
): Promise<IntroCacheV1 | null> {
  const key = keyFor(caseId, context);
  const existing = memoized.get(key);
  if (existing) return existing;

  const loading = (async () => {
    let payload: unknown = null;
    try {
      payload = await fetchIntroCacheJson(caseId, options.signal);
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
      // Network hiccup: fall through to the browser-local store, then to null.
      console.warn(`Intro cache for '${caseId}' could not be fetched from the shipped path:`, error);
      payload = null;
    }
    if (payload !== null) {
      const shipped = assertCache(payload, caseId, context, 'shipped');
      if (shipped) return shipped;
      // The shipped file was present but not usable (drift, draft, or invalid).
      // Do NOT fall back to the browser-local store: a curated case with a bad
      // shipped cache should surface as "no cache" so the author regenerates
      // via the batch pipeline, not as a stale authored cache leaking in.
      return null;
    }
    const store = overrideAuthoredStore ?? authoredIntroCacheStore;
    let authored: IntroCacheV1 | null = null;
    try {
      authored = await store.get(caseId);
    } catch (error) {
      console.warn(`Authored intro cache lookup for '${caseId}' failed:`, error);
      return null;
    }
    if (!authored) return null;
    return assertCache(authored, caseId, context, 'authored');
  })();

  memoized.set(key, loading);
  loading.catch(() => memoized.delete(key));
  return loading;
}

/** Clears the in-memory memo. Test helper only. */
export function __resetIntroCacheStoreForTests(): void {
  memoized.clear();
  overrideAuthoredStore = null;
  subscribeToAuthoredStore(authoredIntroCacheStore);
}

/** Test-only seam: swap in a specific authored-store instance. */
export function __setAuthoredIntroCacheStoreForTests(store: AuthoredIntroCacheStore | null): void {
  overrideAuthoredStore = store;
  memoized.clear();
  subscribeToAuthoredStore(store ?? authoredIntroCacheStore);
}
