/**
 * Client-side loader for the shipped intro cache.
 *
 * Reads /intro-cache/<caseId>.json (static, no server, no key required),
 * validates against the Intro Cache v1 schema, drops the artifact if it does
 * not match the current lesson plan sha, and memoizes per case id so multiple
 * mounts share one fetch.
 */

import {
  type IntroCacheV1,
  validateIntroCacheV1,
} from '../core/introCache';

const memoized = new Map<string, Promise<IntroCacheV1 | null>>();

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

/**
 * Load and validate the shipped intro cache for a case. Returns null when the
 * artifact is missing, still in draft, or bound to a different lesson plan sha.
 * Never throws to the caller for a missing file: runtime falls back gracefully.
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
    let payload: unknown;
    try {
      payload = await fetchIntroCacheJson(caseId, options.signal);
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
      // Network hiccup or unreachable static host: never break the lesson. Log
      // and fall through so the runtime uses its unfrozen default opening.
      console.warn(`Intro cache for '${caseId}' could not be fetched:`, error);
      return null;
    }
    if (payload === null) return null;

    const validation = validateIntroCacheV1(payload);
    if (!validation.valid) {
      console.warn(
        `Intro cache for '${caseId}' failed schema validation and was ignored:`,
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
      // Media or lesson content drifted since generation: re-run the batch job.
      return null;
    }
    return cache;
  })();

  memoized.set(key, loading);
  loading.catch(() => memoized.delete(key));
  return loading;
}

/** Clears the in-memory memo. Test helper only. */
export function __resetIntroCacheStoreForTests(): void {
  memoized.clear();
}
